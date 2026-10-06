"""피칭 메일: 확정된 A&R 노트 → 큐레이터용 메일 영어·한국어 각 1통."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.agents.time_check import find_times, out_of_range, strip_times, time_labels
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import PitchSet

# 자리표시는 밴드가 직접 채운다 (pitch.md). 빠지면 링크 없는 메일이 나가므로 검사한다.
PLACEHOLDERS = {"en": ("[Streaming link]", "[Your name]"), "ko": ("[음원 링크]", "[이름]")}


def _secs(text: str) -> list[int]:
    return [sec for _, _, sec in find_times(text)]


def _unmatched(mine: list[int], other: list[int]) -> list[int]:
    """다른 언어 메일에 (±1초 안으로) 없는 시간."""
    return [s for s in mine if not any(abs(s - o) <= 1 for o in other)]


def _time_problems(p: PitchSet, duration: float) -> list[str]:
    problems = []
    for lang in ("en", "ko"):
        bad = out_of_range(getattr(p, lang).body, duration)
        if bad:
            problems.append(f"{lang} body에 곡 길이({duration:.0f}초)보다 뒤인 시간 {bad}초가 있음 — highlight_time 값만 쓰기")
    en, ko = _secs(p.en.body), _secs(p.ko.body)
    if _unmatched(en, ko) or _unmatched(ko, en):
        problems.append(f"en과 ko 메일의 시간이 다름 (en {en}초, ko {ko}초) — 둘 다 highlight_time 값으로 맞추기")
    return problems


def _repair(p: PitchSet, duration: float) -> PitchSet:
    """다시 써도 틀리면: 곡 길이를 넘는 시간과, 다른 언어 메일과 안 맞는 시간을 지운다."""
    p = p.model_copy(deep=True)
    en, ko = _secs(p.en.body), _secs(p.ko.body)
    for mail, other in ((p.en, ko), (p.ko, en)):
        mail.body = strip_times(mail.body, lambda sec, other=other: sec > duration + 1 or bool(_unmatched([sec], other)))
    return p


def _check(p: PitchSet, duration: float) -> list[str]:
    problems = _time_problems(p, duration)
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


async def write_pitch(settings: Settings, note: ARNote, song: dict, listening: dict | None, duration: float,
                      request: str | None = None, previous: dict | None = None) -> tuple[PitchSet, dict]:
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
        "heard": {k: listening.get(k) for k in ("genre_feel", "instrumentation", "vocal_texture", "lyrics_gist")}
        if listening else None,
    }
    if request:
        payload["revision_request"] = {"request": request, "previous_mail": previous}
    pitch, usage = await ask_json(chat_model(settings), load_prompt("pitch"), payload, PitchSet,
                                  check=lambda p: _check(p, duration), repair=lambda p: _repair(p, duration),
                                  what="피칭 메일")
    return pitch, {"model": model_label(settings), **usage}
