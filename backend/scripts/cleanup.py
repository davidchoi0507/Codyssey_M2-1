"""보관 기간(RETENTION_DAYS, 기본 7일)이 지난 작업 삭제 — 서버에서 매일 실행 (systemd 타이머).

  python -m scripts.cleanup            # 삭제
  python -m scripts.cleanup --dry-run  # 지울 대상만 보기

커뮤니티 반응·신고의 접속 IP는 FEEDBACK_IP_RETENTION_DAYS(기본 7일) 뒤 지우고, 만료된 로그인 세션도 지운다.
KEEP_JOB_IDS(쉼표 구분)에 적은 작업은 남긴다 (팀 공유 샘플). 음원·결과물·곡 정보·동의 기록·DB 레코드를 지운다. 결과보고서용 지표는 개인정보와 자유 입력(수정 문장, 요청,
에러 원문)을 빼고 data/metrics_archive.jsonl 에 한 줄씩 남긴다.
"""
import argparse
import json
import shutil
import sys
from datetime import datetime, timedelta, timezone

from app import db
from app.core.config import get_settings
from app.pipeline.jobfiles import JobFiles

FREE_TEXT = {"correction", "request", "message", "fields"}  # 지표 보관에서 빼는 값


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    s = get_settings()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=s.retention_days)).isoformat(timespec="seconds")
    keep = {j.strip() for j in s.keep_job_ids.split(",") if j.strip()}
    with db.connect() as conn:
        old = [r["job_id"] for r in conn.execute("SELECT job_id FROM jobs WHERE created_at < ?", (cutoff,))
               if r["job_id"] not in keep]
    # DB에 없는 오래된 폴더(가져오기 전 실패 등)도 정리
    orphans = []
    if s.jobs_dir.exists():
        with db.connect() as conn:
            known = {r["job_id"] for r in conn.execute("SELECT job_id FROM jobs")}
        limit = datetime.now().timestamp() - s.retention_days * 86400
        orphans = [d.name for d in s.jobs_dir.iterdir()
                   if d.is_dir() and d.name not in known and d.name not in keep and d.stat().st_mtime < limit]

    print(f"보관 {s.retention_days}일 지난 작업 {len(old)}건, DB에 없는 오래된 폴더 {len(orphans)}건")
    if args.dry_run:
        for j in old + orphans:
            print(" ", j)
        return 0

    archive = s.data_dir / "metrics_archive.jsonl"
    with archive.open("a", encoding="utf-8") as out:
        for job_id in old:
            jf = JobFiles(s.jobs_dir, job_id)
            st = jf.status()
            events = [{k: v for k, v in e.items() if k not in FREE_TEXT} for e in jf.events()]
            out.write(json.dumps({"job_id": job_id, "final_stage": st["stage"], "events": events},
                                 ensure_ascii=False) + "\n")
            with db.connect() as conn:
                for table in ("events", "consents", "jobs"):
                    conn.execute(f"DELETE FROM {table} WHERE job_id = ?", (job_id,))
            shutil.rmtree(jf.root, ignore_errors=True)
    for name in orphans:
        shutil.rmtree(s.jobs_dir / name, ignore_errors=True)
    # 커뮤니티 반응·신고에 남긴 접속 IP는 FEEDBACK_IP_RETENTION_DAYS 뒤 지운다 (동의서 v1.3 초안 제7조)
    ip_cutoff = (datetime.now(timezone.utc) - timedelta(days=s.feedback_ip_retention_days)).isoformat(timespec="seconds")
    with db.connect() as conn:
        n_fb = conn.execute("UPDATE feedback SET client = NULL WHERE client IS NOT NULL AND ts < ?", (ip_cutoff,)).rowcount
        n_rp = conn.execute("UPDATE reports SET client = NULL WHERE client IS NOT NULL AND ts < ?", (ip_cutoff,)).rowcount
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (datetime.now(timezone.utc).isoformat(timespec="seconds"),))
    print(f"삭제 완료. 지표는 {archive}에 보관. 지난 접속 IP 정리: 반응 {n_fb}건, 신고 {n_rp}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
