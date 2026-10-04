"""피칭 메일: 확정된 A&R 노트 → 큐레이터용 메일 영어·한국어 각 1통."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import PitchSet

# 자리표시는 밴드가 직접 채운다 (pitch.md). 빠지면 링크 없는 메일이 나가므로 검사한다.
PLACEHOLDERS = {"en": ("[Streaming link]", "[Your name]"), "ko": ("[음원 링크]", "[이름]")}


def _check(p: PitchSet) -> list[str]:
    problems = []
    for lang, limit in (("en", 70), ("ko", 45)):
        mail = getattr(p, lang)
        if len(mail.subject) > limit:
            problems.append(f"{lang} subject가 {len(mail.subject)}자 — {limit}자 이내로")
        missing = [ph for ph in PLACEHOLDERS[lang] if ph not in mail.body]
        if missing:
            problems.append(f"{lang} body에 자리표시 {missing}가 없음")
    words = len(p.en.body.split())
    if not 90 <= words <= 200:
        problems.append(f"en body가 {words}단어 — 110~170단어로")
    if not 280 <= len(p.ko.body) <= 700:
        problems.append(f"ko body가 {len(p.ko.body)}자 — 350~600자로")
    return problems


async def write_pitch(settings: Settings, note: ARNote, song: dict, listening: dict | None) -> tuple[PitchSet, dict]:
    rec = next(c for c in note.highlight.candidates if c.id == note.highlight.recommended_id)
    payload = {
        "song": {k: song.get(k) for k in ("title", "artist", "genre", "description", "lyrics", "release_date")},
        "ar_note": {
            "interpretation": note.interpretation,
            "mood_keywords": note.mood_keywords,
            "highlight": {"start_sec": note.highlight.selected.start, "reason": rec.reason},
            "user_correction": note.user_correction,
        },
        "heard": {k: listening.get(k) for k in ("genre_feel", "instrumentation", "vocal_texture", "lyrics_gist")}
        if listening else None,
    }
    pitch, usage = await ask_json(chat_model(settings), load_prompt("pitch"), payload, PitchSet,
                                  check=_check, what="피칭 메일")
    return pitch, {"model": model_label(settings), **usage}
