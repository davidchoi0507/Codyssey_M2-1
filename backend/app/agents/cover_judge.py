"""커버 고르기: 한 방향의 후보 2~3장을 Gemini(Flash Lite, 이미지 입력)가 보고 하나를 고른다.

고르기는 품질을 올리는 보조 단계라 실패해도 작업을 멈추지 않는다 — 어떤 문제든 None을 돌려주고 첫 후보를 쓴다.
듣기용 상위 모델의 하루 한도(모델별 20회)를 쓰지 않도록 settings.cover_judge_model(Flash Lite, 하루 500회)만 쓴다.
"""
import io
import logging
from pathlib import Path

from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from PIL import Image

from app.adapters.gemini import _retryable
from app.adapters.retry import with_retry
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.note import ARNote

log = logging.getLogger(__name__)


class CoverJudgement(BaseModel):
    scores: list[int] = Field(description="후보 순서대로 1~10 점수")
    best: int = Field(description="가장 좋은 후보 번호 (1부터)")
    reason: str = Field(description="고른 이유 한 문장 (한국어)")


def _jpeg(path: Path, size: int = 512) -> bytes:
    """토큰을 아끼려고 작게 줄여 보낸다 (썸네일 판단에도 이 크기면 충분)."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((size, size))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=85)
        return buf.getvalue()


async def pick_cover(settings: Settings, note: ARNote, direction_id: str, candidates: list[Path]) -> tuple[int, dict] | None:
    """반환: (고른 후보 index 0부터, 기록용 메타) — 실패하면 None."""
    direction = next((c.text for c in note.cover_directions if c.id == direction_id), "")
    parts: list = [f"Cover direction: {direction}\nMood keywords: {', '.join(note.mood_keywords)}\n"
                   f"Palette: {', '.join(note.colors)}"]
    for i, p in enumerate(candidates, 1):
        parts += [f"Candidate {i}:", types.Part.from_bytes(data=_jpeg(p), mime_type="image/jpeg")]
    config = types.GenerateContentConfig(
        system_instruction=load_prompt("cover_judge"), response_mime_type="application/json",
        response_schema=CoverJudgement, temperature=0.2,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    keys = [k for k in (settings.gemini_api_key, settings.gemini_api_key_backup) if k]
    for key in keys:
        try:
            client = genai.Client(api_key=key)
            resp = await with_retry(
                lambda: client.aio.models.generate_content(model=settings.cover_judge_model, contents=parts,
                                                           config=config),
                is_retryable=_retryable, max_retries=1, what="커버 고르기")
            j = resp.parsed if isinstance(resp.parsed, CoverJudgement) else None
            if j is None or not 1 <= j.best <= len(candidates):
                log.warning("커버 고르기 결과를 읽지 못함: %r", resp.text[:300] if resp.text else None)
                return None
            return j.best - 1, {"model": "gemini:" + settings.cover_judge_model, "scores": j.scores, "reason": j.reason}
        except Exception as e:  # 다음 키로, 그래도 안 되면 첫 후보
            log.warning("커버 고르기 실패 (%s): %r", settings.cover_judge_model, e)
    return None
