"""밴드 초대 코드 관리 (관리자용, 서버에서 실행).

  python -m scripts.bands add "밴드 이름" [--limit 5] [--note "섭외 담당: OO"]   # 코드 발급
  python -m scripts.bands list                                                   # 목록 + 오늘/전체 업로드 수
  python -m scripts.bands off K7QM-3XPA                                          # 코드 끄기 (유출·테스트 종료)
  python -m scripts.bands on K7QM-3XPA
  python -m scripts.bands limit K7QM-3XPA 8                                      # 하루 한도 바꾸기
"""
import argparse
import sys

from app import db
from app.core.config import get_settings
from app.pipeline.bands import create_band, display, normalize
from app.pipeline.limits import _today_start_utc


def main() -> int:
    p = argparse.ArgumentParser(description="밴드 초대 코드 관리")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("name")
    a.add_argument("--limit", type=int, default=None, help="하루 업로드 한도 (기본 DAILY_JOBS_PER_BAND)")
    a.add_argument("--note")
    sub.add_parser("list")
    for cmd in ("off", "on"):
        sub.add_parser(cmd).add_argument("code")
    lim = sub.add_parser("limit")
    lim.add_argument("code")
    lim.add_argument("n", type=int)
    args = p.parse_args()

    if args.cmd == "add":
        limit = args.limit or get_settings().daily_jobs_per_band
        code = create_band(args.name, limit, args.note)
        print(f"{args.name}: {display(code)}  (하루 {limit}곡)")
        return 0
    if args.cmd == "list":
        since = _today_start_utc()
        with db.connect() as conn:
            rows = conn.execute(
                "SELECT b.*, (SELECT count(*) FROM jobs j WHERE j.band_code = b.code AND j.created_at >= ?) AS today, "
                "(SELECT count(*) FROM jobs j WHERE j.band_code = b.code) AS total FROM bands b ORDER BY created_at",
                (since,)).fetchall()
        for r in rows:
            state = "사용 중" if r["active"] else "꺼짐"
            print(f"{display(r['code'])}  {state:4}  오늘 {r['today']}/{r['daily_limit']}  전체 {r['total']:3}  {r['name']}"
                  + (f"  ({r['note']})" if r["note"] else ""))
        print(f"{len(rows)}개 (7일 지난 작업은 삭제되므로 '전체'는 최근 7일 기준)")
        return 0
    code = normalize(args.code)
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM bands WHERE code = ?", (code,)).fetchone() is None:
            print(f"없는 코드예요: {args.code}", file=sys.stderr)
            return 1
        if args.cmd in ("off", "on"):
            conn.execute("UPDATE bands SET active = ? WHERE code = ?", (1 if args.cmd == "on" else 0, code))
        else:
            conn.execute("UPDATE bands SET daily_limit = ? WHERE code = ?", (args.n, code))
    print("바꿨어요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
