"""비주얼 디렉터: 확정된 A&R 노트 → 커버 3종 이미지 프롬프트."""
from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote
from app.schemas.package import VisualPlan

OVERUSED = {"film_snapshot", "painterly", "swiss_graphic"}  # 방향이 사진·일러스트·그래픽일 때 늘 이것만 고르는 경향


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

    soft_asked = False

    def check(p: VisualPlan) -> list[str]:
        nonlocal soft_asked
        got = [c.direction_id for c in p.covers]
        if sorted(got) != sorted(ids):
            return [f"covers의 direction_id가 {ids}와 맞지 않음: {got}"]
        # 레시피 다양성은 한 번만 다시 쓰게 한다 (두 번째에도 같으면 그대로 씀 — 작업을 실패시키지 않게)
        recipes = [c.recipe for c in p.covers]
        defaults = [r for r in recipes if r in OVERUSED]
        if not soft_asked and (len(set(recipes)) < len(recipes) or len(defaults) > 1):
            soft_asked = True
            return [f"recipe가 겹치거나 기본 레시피({', '.join(sorted(OVERUSED))})를 2개 이상 썼음: {recipes}. "
                    "곡의 분위기에 맞는 다른 레시피로 바꿔서 다시 써 줘"]
        return []

    plan, usage = await ask_json(chat_model(settings), load_prompt("visual_director"), payload, VisualPlan,
                                 check=check, what="커버 방향")
    return plan, {"model": model_label(settings), **usage}
