"""사용 기록 자동 수집 (10/14 회의): 설문으로 묻지 않아도 서버가 알 수 있는 건 여기서 남기고 요약한다.

- 작업(발매 준비)은 events 테이블에 남긴다. 작업과 함께 7일 뒤 지워지고, 지표는 cleanup이
  data/metrics_archive.jsonl 에 남긴다 (자유 입력 제외).
- 바로 공개한 곡은 작업이 없어서 tracks 열(owner_views·owner_seen_at·owner_seen_reactions)에 남긴다.
- 화면에서만 일어나는 일(글 복사 등)은 POST /jobs/{id}/usage 로 받는다 — CLIENT_EVENTS 에 있는 것만.
"""
import json
from datetime import datetime

from app import db
from app.pipeline.jobfiles import JobFiles, now_iso

# 화면이 보내도 되는 이벤트 → 설명 (API 문서에도 이대로 보인다)
CLIENT_EVENTS = {
    "copied_channel": "채널 글 복사 (target: instagram·tiktok·threads·x)",
    "copied_pitch": "피칭 메일 복사 (target: ko·en)",
    "copied_editorial": "Spotify 에디토리얼·소개글 복사",
    "copied_field": "제출 도우미 칸 복사 (target: 칸 이름)",
    "opened_distributor": "유통사 사이트 열기 (target: distrokid·muzeplatform)",
    "opened_guide": "발매 안내 열기",
    "survey_shown": "마지막 설문이 화면에 보임",
    "survey_closed": "설문을 답하지 않고 닫음",
}

# 발매 준비에서 어디까지 갔는지 (뒤로 갈수록 멀리 감)
REACH = ["uploaded", "note_ready", "note_accepted", "cover_selected", "rendered", "downloaded"]


def event_once(jf: JobFiles, event: str, **payload) -> None:
    """같은 이벤트·같은 값이 이미 있으면 남기지 않는다 (화면이 같은 걸 여러 번 불러도 한 번만)."""
    body = json.dumps(payload, ensure_ascii=False)
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM events WHERE job_id = ? AND event = ? AND payload = ? LIMIT 1",
                        (jf.job_id, event, body)).fetchone():
            return
        conn.execute("INSERT INTO events (job_id, ts, event, payload) VALUES (?, ?, ?, ?)",
                     (jf.job_id, now_iso(), event, body))


def owner_viewed(track_id: str, reactions: int) -> None:
    """올린 사람이 관리 화면(반응 목록)을 열었다 — 반응을 확인했는지 알기 위해."""
    with db.connect() as conn:
        conn.execute("UPDATE tracks SET owner_views = owner_views + 1, owner_seen_at = ?, owner_seen_reactions = ? "
                     "WHERE track_id = ?", (now_iso(), reactions, track_id))


def _minutes(a: str, b: str) -> float:
    return round((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60, 1)


def summarize_events(events: list[dict]) -> dict:
    """작업 이벤트 → 어디까지 했는지·무엇을 썼는지·얼마나 걸렸는지. 지워진 작업(metrics_archive)에도 같이 쓴다."""
    names = [e["event"] for e in events]
    has = set(names)
    reach = "uploaded"
    for step, done in (("note_ready", "note_ready" in has), ("note_accepted", "note_accepted" in has),
                       ("cover_selected", "cover_selected" in has),
                       ("rendered", any(e["event"] == "step_end" and e.get("step") == "render" and e.get("ok")
                                        for e in events)),
                       ("downloaded", bool(has & {"zip_downloaded", "sheet_downloaded"}))):
        if done:
            reach = step
    features = sorted({
        *(f for f, ev in (("note_edit", "note_edited"), ("relisten", "relistened"), ("release_info", "release_info_saved"),
                          ("rights", "rights_saved"), ("regenerate", "item_regenerated"),
                          ("own_cover", "own_image_uploaded"), ("check", "distributor_checked"),
                          ("zip", "zip_downloaded"), ("sheet", "sheet_downloaded"),
                          ("community", "community_published")) if ev in has),
        *(e["event"] for e in events if e["event"] in CLIENT_EVENTS and e["event"].startswith(("copied_", "opened_"))),
    })
    first = events[0]["ts"] if events else None
    note_at = next((e["ts"] for e in events if e["event"] == "note_ready"), None)
    return {
        "reach": reach,
        "features": features,
        "distributors": sorted({e.get("dist") for e in events if e["event"] == "distributor_checked"} - {None}),
        "failures": names.count("failed"),
        "retries": names.count("retry"),
        "regenerations": names.count("item_regenerated"),
        "note_edits": names.count("note_edited"),
        "minutes_to_note": _minutes(first, note_at) if first and note_at else None,
        "minutes_active": _minutes(first, events[-1]["ts"]) if len(events) > 1 else 0,
    }


def track_summary(track: dict) -> dict:
    """공개한 곡: 반응을 받았는지, 올린 사람이 확인했는지."""
    with db.connect() as conn:
        r = conn.execute("SELECT count(*) AS n, sum(rating IS NOT NULL) AS rated, sum(comment IS NOT NULL) AS commented "
                         "FROM feedback WHERE track_id = ? AND hidden = 0", (track["track_id"],)).fetchone()
    return {
        "track_id": track["track_id"],
        "source": track.get("source") or "job",
        "listen_mode": track["listen_mode"],
        "comments_public": bool(track["comments_public"]),
        "plays": track["plays"],
        "reactions": r["n"] or 0,
        "ratings": r["rated"] or 0,
        "comments": r["commented"] or 0,
        "owner_views": track.get("owner_views") or 0,
        "owner_saw_reactions": (track.get("owner_seen_reactions") or 0) > 0,
    }


def job_summary(jf: JobFiles) -> dict:
    """작업 하나의 이용 요약 (+ 공개했으면 곡 요약)."""
    from app.pipeline.community import track_for_job  # community → usage 순환 import 피하기
    out = {"kind": "release", **summarize_events(jf.events())}
    if t := track_for_job(jf.job_id):
        out["track"] = track_summary(t)
    return out
