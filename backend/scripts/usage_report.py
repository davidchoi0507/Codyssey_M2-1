"""체험 피드백 요약 (10/14 회의): 자동 사용 기록 + 마지막 설문을 한 번에 본다. 서버에서 실행.

  python -m scripts.usage_report                    # 화면에 요약
  python -m scripts.usage_report --since 2026-10-18 # 테스트 시작일부터만 (팀 QA 작업 빼기)
  python -m scripts.usage_report --csv              # data/exports/usage_report.csv 도 만든다 (체험 하나 = 한 줄)

같은 내용을 브라우저로 보려면 /admin (ADMIN_KEY 필요). 계산은 app/pipeline/usage_report.py 한 곳에서 한다.
"""
import argparse
import sys

from app.core.config import get_settings
from app.pipeline.usage_report import csv_text, experiences, summarize


def pct(n: int, total: int) -> str:
    return f"{n}/{total} ({round(100 * n / total)}%)" if total else "0"


def report(sm: dict) -> None:
    print(f"체험 {sm['total']}건 — 발매 준비 {sm['release']}, 바로 공개 {sm['community']}")
    print("\n[눈에 띄는 점]")
    for x in sm["insights"]:
        print(f"  {'!' if x['level'] == 'warn' else '·'} {x['text']}")
    if sm["release"]:
        print("\n[발매 준비 — 어디까지 갔나]")
        for f in sm["funnel"]:
            print(f"  {f['label']:12s} {pct(f['n'], sm['release'])}")
        print("  멈춘 곳: " + ", ".join(f"{x['label']} {x['n']}" for x in sm["stopped_at"]))
        print("\n[쓴 기능]  " + ", ".join(f"{x['label']} {pct(x['n'], sm['release'])}" for x in sm["features"]))
        if w := sm["minutes_to_note"]:
            print(f"\n[A&R 노트까지 걸린 시간] 중앙값 {w['median']}분, 최대 {w['max']}분")
        print(f"[실패가 한 번이라도 난 작업] {pct(sm['with_failure'], sm['release'])}")
    if sm["published"]:
        print("\n[커뮤니티 공개]")
        print(f"  공개 {sm['published']}곡 · 반응을 1개 이상 받은 곡 {pct(sm['published_with_reaction'], sm['published'])}"
              f" · 올린 사람이 관리 화면을 연 곡 {pct(sm['published_owner_viewed'], sm['published'])}")
    print(f"\n[마지막 설문] 응답 {pct(sm['survey_answered'], sm['total'])}")
    for q in sm["questions"]:
        if not q["n"]:
            continue
        if q["type"] == "choice":
            avg = f" 평균 {q['average']}/5" if q["average"] is not None else ""
            print(f"  {q['question']}{avg}  " + ", ".join(f"{c['label']} {c['n']}" for c in q["counts"] if c["n"]))
        elif q["type"] == "matrix":
            print(f"  {q['question']}")
            for row in q["rows"]:
                if any(c["n"] for c in row["counts"]):
                    print(f"    {row['label']}: " + ", ".join(f"{c['label']} {c['n']}" for c in row["counts"] if c["n"]))
        else:
            print(f"  {q['question']} ({q['n']}건)")
            for a in q["answers"]:
                print(f"    - {a['text']}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--since", default="2000-01-01", help="이 날짜(YYYY-MM-DD) 이후 체험만")
    p.add_argument("--csv", action="store_true")
    args = p.parse_args()
    rows = experiences(args.since)
    report(summarize(rows))
    if args.csv:
        path = get_settings().data_dir / "exports" / "usage_report.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(csv_text(rows), encoding="utf-8")
        print(f"\nCSV: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
