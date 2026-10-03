"""카피라이터: 확정된 A&R 노트 → 채널 4종(인스타·틱톡·스레드·X) 홍보 글."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import CopySet

X_MAX_CHARS = 140  # 한국어는 X에서 글자당 2로 계산 → 280/2


def _check(c: CopySet) -> list[str]:
    problems = []
    if c.tiktok.hook and len(c.tiktok.hook) > 20:
        problems.append(f"tiktok hook이 너무 김 ({len(c.tiktok.hook)}자)")
    if not c.tiktok.hook:
        problems.append("tiktok hook이 비어 있음")
    if len(c.x.text) > X_MAX_CHARS:
        problems.append(f"x text가 {len(c.x.text)}자 — {X_MAX_CHARS}자 이내로")
    for name in ("instagram", "tiktok", "threads", "x"):
        bad = [h for h in getattr(c, name).hashtags if not h.startswith("#") or " " in h]
        if bad:
            problems.append(f"{name} 해시태그 형식 오류 {bad}")
    return problems


async def write_copy(settings: Settings, note: ARNote, song: dict) -> tuple[CopySet, dict]:
    rec = next(c for c in note.highlight.candidates if c.id == note.highlight.recommended_id)
    payload = {
        "song": {k: song.get(k) for k in ("title", "artist", "genre", "description", "lyrics", "release_date")},
        "ar_note": {
            "interpretation": note.interpretation,
            "mood_keywords": note.mood_keywords,
            "highlight": {"start": note.highlight.selected.start, "end": note.highlight.selected.end,
                          "reason": rec.reason},
            "user_correction": note.user_correction,
        },
    }
    fast = bool(settings.codyssey_llm_model_fast)
    copy, usage = await ask_json(chat_model(settings, fast=fast), load_prompt("copywriter"), payload, CopySet,
                                 check=_check, what="채널 홍보 글")
    for name in ("instagram", "threads", "x"):
        getattr(copy, name).hook = None
    return copy, {"model": model_label(settings, fast=fast), **usage}
