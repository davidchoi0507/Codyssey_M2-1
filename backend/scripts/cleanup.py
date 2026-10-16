"""보관 기간이 지난 작업 삭제 — 서버에서 매일 실행 (systemd 타이머).
RETENTION_MODE=days면 업로드 RETENTION_DAYS일(기본 7일) 뒤, service_end면 SERVICE_END_DATE 다음 날 일괄 (10/16, 동의서 v1.6).

  python -m scripts.cleanup            # 삭제
  python -m scripts.cleanup --dry-run  # 지울 대상만 보기

커뮤니티 반응·신고의 접속 IP는 FEEDBACK_IP_RETENTION_DAYS(기본 7일) 뒤 지우고, 만료된 로그인 세션도 지운다.
SERVICE_END_DATE 다음 날(한국 시간 0시)부터는 RETENTION_MODE와 관계없이 서비스 데이터 전체를 지운다 — 커뮤니티 공개 곡·반응·신고·
소리 지문, 로그인 계정·세션, 설문 응답 (동의서 v1.6 보관표 "종료일 일괄 삭제"). 공개 곡은 개인을 알 수 없는 숫자만 지표로 남긴다.
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
from app.pipeline import community
from app.pipeline.jobfiles import JobFiles

FREE_TEXT = {"correction", "request", "message", "fields"}  # 지표 보관에서 빼는 값


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    s = get_settings()
    now = datetime.now(timezone.utc)
    keep = {j.strip() for j in s.keep_job_ids.split(",") if j.strip()}
    with db.connect() as conn:
        rows = conn.execute("SELECT job_id, created_at FROM jobs").fetchall()
    old = [r["job_id"] for r in rows if r["job_id"] not in keep
           and (exp := s.job_expires(datetime.fromisoformat(r["created_at"]))) is not None and exp <= now]
    # DB에 없는 오래된 폴더(가져오기 전 실패 등)도 정리
    orphans = []
    if s.jobs_dir.exists():
        with db.connect() as conn:
            known = {r["job_id"] for r in conn.execute("SELECT job_id FROM jobs")}
        def expired(d) -> bool:
            exp = s.job_expires(datetime.fromtimestamp(d.stat().st_mtime, timezone.utc))
            return exp is not None and exp <= now
        orphans = [d.name for d in s.jobs_dir.iterdir()
                   if d.is_dir() and d.name not in known and d.name not in keep and expired(d)]

    rule = f"종료일 {s.service_end_date} 다음 날 일괄" if s.retention_mode == "service_end" else f"{s.retention_days}일"
    print(f"보관({rule}) 지난 작업 {len(old)}건, DB에 없는 오래된 폴더 {len(orphans)}건")
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
    if (end := s.service_end_at()) is not None and end <= now:
        purge_service_end(s, archive)
    return 0


def purge_service_end(s, archive) -> None:
    """서비스 종료 — 공개 곡과 사람에 관한 기록을 모두 지운다. 매일 돌아도 남은 게 없으면 아무것도 안 한다."""
    with db.connect() as conn:
        tracks = conn.execute("SELECT track_id, created_at, plays, ai_usage FROM tracks").fetchall()
    with archive.open("a", encoding="utf-8") as out:
        for t in tracks:
            st = community.stats(t["track_id"])
            out.write(json.dumps({"track_id": t["track_id"], "published_at": t["created_at"], "plays": t["plays"],
                                  "ai_usage": t["ai_usage"], "rating_avg": st["rating_avg"],
                                  "rating_count": st["rating_count"], "comments": st["comments"], "tags": st["tags"]},
                                 ensure_ascii=False) + "\n")
            community.remove(s, t["track_id"])
    with db.connect() as conn:
        n = {table: conn.execute(f"DELETE FROM {table}").rowcount
             for table in ("feedback", "reports", "track_fingerprints", "surveys", "sessions", "users")}
    shutil.rmtree(s.community_dir, ignore_errors=True)
    print(f"서비스 종료일({s.service_end_date}) 지남 — 공개 곡 {len(tracks)}곡 삭제, "
          + ", ".join(f"{k} {v}건" for k, v in n.items()))


if __name__ == "__main__":
    sys.exit(main())
