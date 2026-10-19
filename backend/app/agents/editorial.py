"""에디토리얼 피칭: 확정된 A&R 노트 → Spotify for Artists 피칭 설명(한·영 500자 이내) + 국내 음원 사이트 소개글 + 태그 추천.

국내 인디는 해외 큐레이터 메일보다 발매 전 플랫폼 제출 글이 실제로 쓰인다 (2026-10-09 방향 논의). 피칭 메일과 같은 구조.
"""
import re

from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.agents.time_check import find_times
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import EditorialSet

SPOTIFY_MAX = 500  # Spotify for Artists 피칭 설명 글자 수 상한
_URL = re.compile(r"https?://|www\.|@\w+\.\w+", re.I)


def _check(e: EditorialSet) -> list[str]:
    problems = []
    for name in ("spotify_ko", "spotify_en"):
        n = len(getattr(e, name))
        if n > SPOTIFY_MAX:
            problems.append(f"{name}가 {n}자 — Spotify 상한 {SPOTIFY_MAX}자, 300~480자로")
        elif n < 150:
            problems.append(f"{name}가 {n}자 — 너무 짧음, 300~480자로")
    if not 200 <= len(e.dsp_intro_ko) <= 900:
        problems.append(f"dsp_intro_ko가 {len(e.dsp_intro_ko)}자 — 300~700자로")
    for name in ("spotify_ko", "spotify_en", "dsp_intro_ko"):
        text = getattr(e, name)
        if find_times(text):
            problems.append(f"{name}에 시간 표현이 있음 — 쓰지 않기")
        if _URL.search(text):
            problems.append(f"{name}에 링크·이메일이 있음 — 쓰지 않기")
    if not e.tags.genres or not e.tags.moods:
        problems.append("tags.genres·moods를 1개 이상")
    return problems


def _repair(e: EditorialSet) -> EditorialSet:
    """다시 써도 Spotify 글이 길면 문장 단위로 자른다 (제출 화면이 500자에서 막히므로)."""
    e = e.model_copy(deep=True)
    for name in ("spotify_ko", "spotify_en"):
        text = getattr(e, name)
        while len(text) > SPOTIFY_MAX and re.search(r"[.!?。]\s", text):
            text = re.sub(r"(?s)(.*[.!?。])\s.*$", r"\1", text).strip()
        setattr(e, name, text[:SPOTIFY_MAX])
    return e


async def write_editorial(settings: Settings, note: ARNote, song: dict, listening: dict | None,
                          request: str | None = None, previous: dict | None = None) -> tuple[EditorialSet, dict]:
    payload = {
        "song": {k: song.get(k) for k in ("title", "artist", "genre", "description", "lyrics")},
        "ar_note": {
            "interpretation": note.interpretation,
            "mood_keywords": note.mood_keywords,
            "user_correction": note.user_correction,
        },
        "heard": {k: listening.get(k) for k in ("genre_feel", "instrumentation", "vocal_texture", "lyrics_gist")} if listening else None,
    }
    if request:
        payload["revision_request"] = {"request": request, "previous": previous}
    out, usage = await ask_json(chat_model(settings), load_prompt("editorial"), payload, EditorialSet,
                                check=_check, repair=_repair, what="에디토리얼 피칭")
    return out, {"model": model_label(settings), **usage}
