"""커뮤니티 운영: 곡 목록·숨기기·지우기, 반응 숨기기 (신고가 들어왔을 때 서버에서).

  python -m scripts.community list                 # 곡 목록 (숨긴 곡 포함)
  python -m scripts.community feedback TRACK_ID    # 반응 전부 (비공개 포함)
  python -m scripts.community hide TRACK_ID        # 목록·주소에서 내림 (파일은 남김)
  python -m scripts.community show TRACK_ID        # 다시 공개
  python -m scripts.community remove TRACK_ID      # 곡·반응·파일 삭제
  python -m scripts.community hide-feedback TRACK_ID FEEDBACK_ID
  python -m scripts.community key TRACK_ID         # 관리 링크 다시 만들기 (올린 사람이 잃어버렸을 때)
  python -m scripts.community reports [TRACK_ID]   # 처리 안 한 신고 (10/10)
  python -m scripts.community restore TRACK_ID [FEEDBACK_ID]  # 신고로 숨겨진 곡·반응을 다시 보이게 + 신고 처리 완료
"""
import argparse
import sys

from app import db
from app.core.config import get_settings
from app.pipeline import community as c
from app.pipeline import reports


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("cmd", choices=["list", "feedback", "hide", "show", "remove", "hide-feedback", "key", "reports", "restore"])
    p.add_argument("track_id", nargs="?")
    p.add_argument("feedback_id", nargs="?", type=int)
    a = p.parse_args()
    s = get_settings()
    if a.cmd == "list":
        with db.connect() as conn:
            for r in conn.execute("SELECT * FROM tracks ORDER BY created_at DESC"):
                st = c.stats(r["track_id"])
                print(f"{r['track_id']}  {r['status']:6}  {r['listen_mode']:9}  의견{'공개' if r['comments_public'] else '비공개'}"
                      f"  재생 {r['plays']:3}  반응 {st['reactions']:3}  {r['artist']} — {r['title']}")
        return 0
    if a.cmd == "reports":
        for r in reports.open_reports(a.track_id):
            what = f"반응 #{r['feedback_id']}" if r["feedback_id"] else "곡"
            print(f"#{r['id']} {r['ts']} {r['track_id']} {what} [{reports.REASONS.get(r['reason'], r['reason'])}] "
                  f"{r['detail'] or ''}  ({r['client']})")
        return 0
    if not a.track_id:
        p.error("TRACK_ID가 필요해요")
    t = c.get_track(a.track_id, include_hidden=True)
    if a.cmd == "feedback":
        for f in c.feedback_rows(a.track_id, include_hidden=True):
            print(f"#{f['id']} {f['ts']} {'[숨김:' + (f.get('hidden_reason') or '') + '] ' if f['hidden'] else ''}{f['nickname'] or '익명'} "
                  f"★{f['rating'] or '-'} {', '.join(f['tags'])} | {f['comment'] or ''}  ({f['client']})")
    elif a.cmd in ("hide", "show"):
        with db.connect() as conn:
            conn.execute("UPDATE tracks SET status = ? WHERE track_id = ?",
                         ("hidden" if a.cmd == "hide" else "live", a.track_id))
        print(f"{t['title']}: {'내림' if a.cmd == 'hide' else '다시 공개'}")
    elif a.cmd == "remove":
        c.remove(s, a.track_id)
        print(f"{t['title']}: 삭제")
    elif a.cmd == "hide-feedback":
        c.hide_feedback(a.track_id, a.feedback_id)
        print(f"반응 #{a.feedback_id} 숨김")
    elif a.cmd == "restore":
        reports.restore(a.track_id, a.feedback_id)
        print(f"{t['title']}: {'반응 #' + str(a.feedback_id) if a.feedback_id else '곡'} 다시 보이게, 신고 처리 완료")
    elif a.cmd == "key":
        print(f"{s.public_base_url}/community/manage?t={a.track_id}#key={c.owner_key(s, a.track_id)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
