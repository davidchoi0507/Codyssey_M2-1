"""카피라이터: 확정된 A&R 노트 → 채널 4종(인스타·틱톡·스레드·X) 홍보 글."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.agents.time_check import out_of_range, strip_times, time_labels
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import CopySet

X_MAX_CHARS = 140  # 한국어는 X에서 글자당 2로 계산 → 280/2
CHANNEL_NAMES = ("instagram", "tiktok", "threads", "x")


def _time_problems(c: CopySet, duration: float) -> list[str]:
    problems = []
    for name in CHANNEL_NAMES:
        ch = getattr(c, name)
        bad = out_of_range(ch.text + " " + (ch.hook or ""), duration)
        if bad:
            problems.append(f"{name}에 곡 길이({duration:.0f}초)보다 뒤인 시간 {bad}초가 있음 — highlight_time 값만 쓰거나 시간을 빼기")
    return problems


def _repair(c: CopySet, duration: float) -> CopySet:
    c = c.model_copy(deep=True)
    for name in CHANNEL_NAMES:
        ch = getattr(c, name)
        ch.text = strip_times(ch.text, lambda sec: sec > duration + 1)
        if ch.hook:
            ch.hook = strip_times(ch.hook, lambda sec: sec > duration + 1)
    return c


def _check(c: CopySet, duration: float) -> list[str]:
    problems = _time_problems(c, duration)
    if c.tiktok.hook and len(c.tiktok.hook) > 20:
        problems.append(f"tiktok hook이 너무 김 ({len(c.tiktok.hook)}자)")
    if not c.tiktok.hook:
        problems.append("tiktok hook이 비어 있음")
    if len(c.x.text) > X_MAX_CHARS:
        problems.append(f"x text가 {len(c.x.text)}자 — {X_MAX_CHARS}자 이내로")
    for name in CHANNEL_NAMES:
        bad = [h for h in getattr(c, name).hashtags if not h.startswith("#") or " " in h]
        if bad:
            problems.append(f"{name} 해시태그 형식 오류 {bad}")
    return problems


async def write_copy(settings: Settings, note: ARNote, song: dict, duration: float, request: str | None = None,
                     previous: str | None = None) -> tuple[CopySet, dict]:
    rec = next(c for c in note.highlight.candidates if c.id == note.highlight.recommended_id)
    payload = {
        "song": {k: song.get(k) for k in ("title", "artist", "genre", "description", "lyrics", "release_date")},
        "song_length": time_labels(duration),
        "highlight_time": time_labels(note.highlight.selected.start),
        "ar_note": {
            "interpretation": note.interpretation,
            "mood_keywords": note.mood_keywords,
            "highlight": {"reason": rec.reason},
            "user_correction": note.user_correction,
        },
    }
    if request:
        payload["revision_request"] = {"request": request, "previous_text": previous}
    fast = bool(settings.codyssey_llm_model_fast)
    copy, usage = await ask_json(chat_model(settings, fast=fast), load_prompt("copywriter"), payload, CopySet,
                                 check=lambda c: _check(c, duration), repair=lambda c: _repair(c, duration),
                                 what="채널 홍보 글")
    for name in ("instagram", "threads", "x"):
        getattr(copy, name).hook = None
    return copy, {"model": model_label(settings, fast=fast), **usage}
