"""커버 검수: 고른 커버를 Gemini(Flash Lite, 이미지 입력)가 보고 유통사 반려 1순위 항목(글자·깨진 글자·워터마크·로고·URL·
선정성·흐림)을 찾는다. 커버를 고를 때 한 번 (렌더링과 함께) 실행하고 결과를 파일로 둔다 — 제출 전 검수에서 읽는다.

보조 검사라 실패해도 렌더링을 멈추지 않는다 (검수 목록에는 '직접 확인'으로 남는다).
"""
import io
import logging
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image
from pydantic import BaseModel, Field

from app.adapters.gemini import _retryable
from app.adapters.retry import with_retry
from app.core.config import Settings
from app.prompts import load_prompt

log = logging.getLogger(__name__)


class CoverInspection(BaseModel):
    has_text: bool
    text_found: str = ""
    garbled_text: bool
    watermark_or_logo: bool
    url_or_handle: bool
    explicit_content: bool
    blurry: bool
    notes: str = Field(description="한 문장 (한국어)")


async def inspect_cover(settings: Settings, cover: Path) -> CoverInspection | None:
    with Image.open(cover) as im:
        im = im.convert("RGB")
        im.thumbnail((1024, 1024))  # 작은 글자·로고까지 보이게 판단용으로는 크게
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)
    parts = [types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"), "Review this album cover."]
    config = types.GenerateContentConfig(
        system_instruction=load_prompt("cover_inspect"), response_mime_type="application/json",
        response_schema=CoverInspection, temperature=0.0,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    for key in [k for k in (settings.gemini_api_key, settings.gemini_api_key_backup) if k]:
        try:
            client = genai.Client(api_key=key)
            resp = await with_retry(
                lambda: client.aio.models.generate_content(model=settings.cover_judge_model, contents=parts,
                                                           config=config),
                is_retryable=_retryable, max_retries=1, what="커버 검수")
            if isinstance(resp.parsed, CoverInspection):
                return resp.parsed
        except Exception as e:
            log.warning("커버 검수 실패 (%s): %r", settings.cover_judge_model, e)
    return None
