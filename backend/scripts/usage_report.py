"""체험 피드백 요약 (10/14 회의): 자동 사용 기록 + 마지막 설문을 한 번에 본다. 서버에서 실행.

  python -m scripts.usage_report                    # 화면에 요약
  python -m scripts.usage_report --since 2026-10-18 # 테스트 시작일부터만 (팀 QA 작업 빼기)
  python -m scripts.usage_report --csv              # data/exports/usage_report.csv 도 만든다 (체험 하나 = 한 줄)

체험 = 발매 준비 작업 하나(살아 있는 작업 + 7일 지나 지워진 작업의 metrics_archive) 또는 AI 없이 바로 공개한 곡 하나.
"""
import argparse
import csv
import json
import statistics
import sys
from collections import Counter

from app import db
from app.core.config import get_settings
from app.pipeline import survey, usage
from app.pipeline.jobfiles import JobFiles


def experiences(since: str) -> list[dict]:
    s = get_settings()
    keep = {j.strip() for j in s.keep_job_ids.split(",") if j.strip()}
    out: dict[str, dict] = {}
    archive = s.data_dir / "metrics_archive.jsonl"
    if archive.exists():
        for line in archive.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                if rec["events"] and rec["events"][0]["ts"] >= since:
                    out[rec["job_id"]] = {"id": f"job:{rec['job_id']}", "kind": "release", "created_at": rec["events"][0]["ts"],
                                          **usage.summarize_events(rec["events"])}
    with db.connect() as conn:
        jobs = [r["job_id"] for r in conn.execute("SELECT job_id FROM jobs WHERE created_at >= ?", (since,))]
        tracks = {r["job_id"]: dict(r) for r in conn.execute("SELECT * FROM tracks WHERE job_id IS NOT NULL")}
        direct = [dict(r) for r in conn.execute("SELECT * FROM tracks WHERE source = 'direct' AND created_at >= ?", (since,))]
    for job_id in jobs:
        if job_id in keep:
            continue
        jf = JobFiles(s.jobs_dir, job_id)
        out[job_id] = {"id": f"job:{job_id}", "kind": "release", "created_at": jf.status()["created_at"],
                       **usage.summarize_events(jf.events())}
    for job_id, rec in out.items():
        if t := tracks.get(job_id):
            rec["track"] = usage.track_summary(t)
    rows = list(out.values())
    rows += [{"id": f"track:{t['track_id']}", "kind": "community", "created_at": t["created_at"], "reach": "published",
              "features": [], "track": usage.track_summary(t)} for t in direct]
    with db.connect() as conn:
        answers = {r["subject"]: json.loads(r["answers"]) for r in conn.execute("SELECT subject, answers FROM surveys")}
    for r in rows:
        r["survey"] = answers.get(r["id"])
    return sorted(rows, key=lambda r: r["created_at"])


def pct(n: int, total: int) -> str:
    return f"{n}/{total} ({round(100 * n / total)}%)" if total else "0"


def report(rows: list[dict]) -> None:
    rel = [r for r in rows if r["kind"] == "release"]
    com = [r for r in rows if r["kind"] == "community"]
    print(f"체험 {len(rows)}건 — 발매 준비 {len(rel)}, 바로 공개 {len(com)}")

    if rel:
        print("\n[발매 준비 — 어디까지 갔나]")
        reach = Counter(r["reach"] for r in rel)
        for i, step in enumerate(usage.REACH):
            n = sum(reach[x] for x in usage.REACH[i:])
            print(f"  {step:15s} {pct(n, len(rel))}")
        print("  멈춘 곳: " + ", ".join(f"{k} {v}" for k, v in reach.most_common()))
        feats = Counter(f for r in rel for f in r["features"])
        print("\n[쓴 기능]  " + ", ".join(f"{k} {pct(v, len(rel))}" for k, v in feats.most_common()))
        waits = [r["minutes_to_note"] for r in rel if r.get("minutes_to_note") is not None]
        if waits:
            print(f"\n[A&R 노트까지 걸린 시간] 중앙값 {statistics.median(waits)}분, 최대 {max(waits)}분")
        print(f"[실패가 한 번이라도 난 작업] {pct(sum(1 for r in rel if r.get('failures')), len(rel))}")

    pub = [r for r in rows if r.get("track")]
    if pub:
        print("\n[커뮤니티 공개]")
        print(f"  공개 {len(pub)}곡 · 반응을 1개 이상 받은 곡 {pct(sum(1 for r in pub if r['track']['reactions']), len(pub))}"
              f" · 올린 사람이 관리 화면을 연 곡 {pct(sum(1 for r in pub if r['track']['owner_views']), len(pub))}")

    answered = [r for r in rows if r["survey"]]
    print(f"\n[마지막 설문] 응답 {pct(len(answered), len(rows))}")
    for q in survey.QUESTIONS:
        vals = [r["survey"][q["id"]] for r in answered if q["id"] in r["survey"]]
        if not vals:
            continue
        if q["type"] == "choice":
            nums = [int(v) for v in vals if v.isdigit()]
            avg = f" 평균 {round(statistics.mean(nums), 2)}/5" if nums else ""
            print(f"  {q['question']}{avg}  " + ", ".join(f"{q['options'][k]} {v}" for k, v in Counter(vals).most_common()))
        elif q["type"] == "matrix":
            print(f"  {q['question']}")
            for row, label in q["rows"].items():
                c = Counter(v[row] for v in vals if row in v)
                if c:
                    print(f"    {label}: " + ", ".join(f"{q['options'][k]} {n}" for k, n in c.most_common()))
        else:
            print(f"  {q['question']} ({len(vals)}건)")
            for v in vals:
                print(f"    - {v}")


def write_csv(rows: list[dict]) -> str:
    s = get_settings()
    path = s.data_dir / "exports" / "usage_report.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    qids = [q["id"] for q in survey.QUESTIONS]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "kind", "created_at", "reach", "features", "failures", "minutes_to_note", "published",
                    "reactions", "owner_views", *qids])
        for r in rows:
            t, sv = r.get("track") or {}, r["survey"] or {}
            w.writerow([r["id"], r["kind"], r["created_at"], r["reach"], " ".join(r["features"]), r.get("failures", ""),
                        r.get("minutes_to_note", ""), bool(t), t.get("reactions", ""), t.get("owner_views", ""),
                        *[json.dumps(sv[q], ensure_ascii=False) if isinstance(sv.get(q), dict) else sv.get(q, "")
                          for q in qids]])
    return str(path)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--since", default="2000-01-01", help="이 날짜(YYYY-MM-DD) 이후 체험만")
    p.add_argument("--csv", action="store_true")
    args = p.parse_args()
    rows = experiences(args.since)
    report(rows)
    if args.csv:
        print(f"\nCSV: {write_csv(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
