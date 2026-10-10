"""신고 (DECISIONS #33): 곡·반응을 누구나 신고. 서로 다른 접속에서 REPORT_HIDE_THRESHOLD번이면 자동으로 숨기고
운영자에게 텔레그램으로 알린다. 운영자는 scripts/community.py reports·restore로 확인하고 되돌리거나 지운다.

곡이 숨겨지면 status='reported' (목록·주소에서 사라짐, 올린 사람 관리 화면에서는 보임).
반응이 숨겨지면 hidden=1, hidden_reason='reported'.
"""
import logging
import threading

import httpx

from app import db
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.pipeline.jobfiles import now_iso

log = logging.getLogger(__name__)
REASONS = {"abuse": "욕설·비하·혐오", "ad": "광고·도배", "stolen": "남의 곡을 허락 없이 올림", "other": "기타"}


def notify(text: str) -> None:
    """운영자 텔레그램 알림. 토큰이 없거나 실패해도 신고 처리는 계속한다 (로그만)."""
    s = get_settings()
    log.warning("[운영 알림] %s", text)
    if not (s.telegram_bot_token and s.telegram_chat_id):
        return

    def send() -> None:
        try:
            httpx.post(f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage",
                       json={"chat_id": s.telegram_chat_id, "text": f"[인디 커뮤니티] {text}"}, timeout=10)
        except httpx.HTTPError as e:
            log.warning("텔레그램 알림 실패: %s", e)

    threading.Thread(target=send, daemon=True).start()  # 신고 응답이 텔레그램을 기다리지 않게


def report(s: Settings, track_id: str, feedback_id: int | None, reason: str, detail: str | None,
           client: str) -> dict:
    """신고를 남기고, 기준을 넘으면 숨긴다. 같은 접속이 같은 대상을 두 번 신고하면 한 번으로 친다."""
    if reason not in REASONS:
        raise AppError("INVALID_REASON", "신고 사유를 골라 주세요.", False, http_status=422)
    with db.connect() as conn:
        t = conn.execute("SELECT title, artist, status FROM tracks WHERE track_id = ?", (track_id,)).fetchone()
        if t is None or t["status"] != "live":
            raise AppError("TRACK_NOT_FOUND", "곡을 찾을 수 없어요. 이미 내려갔을 수 있어요.", False, http_status=404)
        if feedback_id is not None:
            f = conn.execute("SELECT comment, hidden FROM feedback WHERE id = ? AND track_id = ?",
                             (feedback_id, track_id)).fetchone()
            if f is None:
                raise AppError("FEEDBACK_NOT_FOUND", "반응을 찾을 수 없어요.", False, http_status=404)
        target = "feedback_id IS ?" if feedback_id is None else "feedback_id = ?"
        dup = conn.execute(f"SELECT 1 FROM reports WHERE track_id = ? AND {target} AND client = ?",
                           (track_id, feedback_id, client)).fetchone()
        if not dup:
            conn.execute("INSERT INTO reports (track_id, feedback_id, reason, detail, client, ts) VALUES (?, ?, ?, ?, ?, ?)",
                         (track_id, feedback_id, reason, (detail or "").strip()[:300] or None, client, now_iso()))
        n = conn.execute(f"SELECT count(DISTINCT client) FROM reports WHERE track_id = ? AND {target} AND resolved = 0",
                         (track_id, feedback_id)).fetchone()[0]
        hidden = False
        if n >= s.report_hide_threshold:
            if feedback_id is None:
                hidden = conn.execute("UPDATE tracks SET status = 'reported' WHERE track_id = ? AND status = 'live'",
                                      (track_id,)).rowcount > 0
            else:
                hidden = conn.execute("UPDATE feedback SET hidden = 1, hidden_reason = 'reported' "
                                      "WHERE id = ? AND hidden = 0", (feedback_id,)).rowcount > 0
    what = f"곡 '{t['artist']} — {t['title']}'" if feedback_id is None else f"'{t['title']}'의 반응 #{feedback_id}"
    if not dup:
        if hidden:
            notify(f"신고 {n}건으로 {what}을(를) 자동 숨김 ({REASONS[reason]}). 확인: python -m scripts.community reports {track_id}")
        elif reason == "stolen" and feedback_id is None:
            notify(f"무단 업로드 신고: {what} ({n}건). 확인: python -m scripts.community reports {track_id}")
    return {"reported": True, "hidden": hidden,
            "message": "신고가 접수됐어요. 운영자가 확인할게요." if not dup else "이미 신고한 내용이에요. 운영자가 확인할게요."}


def auto_hide_spam(feedback_ids: list[int], track_id: str) -> None:
    """여러 접속이 같은 한마디를 짧은 시간에 남김(봇 의심) → 모두 숨기고 알림."""
    if not feedback_ids:
        return
    with db.connect() as conn:
        n = conn.execute(f"UPDATE feedback SET hidden = 1, hidden_reason = 'spam' WHERE hidden = 0 AND id IN "
                         f"({','.join('?' * len(feedback_ids))})", feedback_ids).rowcount
    if n:
        notify(f"같은 한마디가 여러 접속에서 짧은 시간에 올라와 반응 {len(feedback_ids)}개를 숨겼어요 (봇 의심). "
               f"확인: python -m scripts.community feedback {track_id}")


def open_reports(track_id: str | None = None) -> list[dict]:
    q = "SELECT * FROM reports WHERE resolved = 0" + (" AND track_id = ?" if track_id else "") + " ORDER BY id DESC"
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(q, (track_id,) if track_id else ())]


def restore(track_id: str, feedback_id: int | None = None) -> None:
    """운영자가 확인 후 다시 보이게 하고 그 대상의 신고를 처리 완료로."""
    target = "feedback_id IS ?" if feedback_id is None else "feedback_id = ?"
    with db.connect() as conn:
        if feedback_id is None:
            conn.execute("UPDATE tracks SET status = 'live' WHERE track_id = ? AND status = 'reported'", (track_id,))
        else:
            conn.execute("UPDATE feedback SET hidden = 0, hidden_reason = NULL WHERE id = ?", (feedback_id,))
        conn.execute(f"UPDATE reports SET resolved = 1 WHERE track_id = ? AND {target}", (track_id, feedback_id))
