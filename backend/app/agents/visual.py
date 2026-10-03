"""비주얼 디렉터: 확정된 A&R 노트 → 커버 3종 이미지 프롬프트."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import VisualPlan


async def plan_covers(settings: Settings, note: ARNote, song: dict, listening: dict | None) -> tuple[VisualPlan, dict]:
    ids = [c.id for c in note.cover_directions]
    payload = {
        "song": {k: song.get(k) for k in ("title", "artist", "genre", "description")},
        "ar_note": {
            "interpretation": note.interpretation,
            "mood_keywords": note.mood_keywords,
            "colors": note.colors,
            "cover_directions": [c.model_dump() for c in note.cover_directions],
            "user_correction": note.user_correction,
        },
        "heard": {k: listening.get(k) for k in ("instrumentation", "emotional_arc", "lyrics_gist", "genre_feel")}
        if listening else None,
    }

    def check(p: VisualPlan) -> list[str]:
        got = [c.direction_id for c in p.covers]
        return [] if sorted(got) == sorted(ids) else [f"covers의 direction_id가 {ids}와 맞지 않음: {got}"]

    plan, usage = await ask_json(chat_model(settings), load_prompt("visual_director"), payload, VisualPlan,
                                 check=check, what="커버 방향")
    return plan, {"model": model_label(settings), **usage}
