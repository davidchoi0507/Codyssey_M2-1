"""Gemini 어댑터: 압축 음원 + librosa 결과 → 듣기 결과(Listening).

음원이 작으면 요청에 직접 넣고, 크면 Files API로 올렸다가 분석 직후 삭제한다.
google-genai 2.28 기준 (client.aio.models.generate_content, response_schema=Pydantic).
"""
import json
import logging
from pathlib import Path

from google import genai
from google.genai import errors, types

from app.adapters.retry import with_retry
from app.core.config import Settings
from app.core.errors import AppError
from app.prompts import load_prompt
from app.analysis.profile import profile_for_prompt
from app.schemas.analysis import Features, Listening

log = logging.getLogger(__name__)


def _retryable(e: Exception) -> bool:
    return isinstance(e, errors.APIError) and (e.code == 429 or e.code >= 500)


class GeminiListener:
    def __init__(self, settings: Settings):
        self.s = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)

    @property
    def model_name(self) -> str:
        return self.s.gemini_model

    async def listen(self, audio_path: Path, features: Features, song: dict) -> tuple[Listening, dict]:
        """반환: (듣기 결과, 메타데이터 — 실제 응답 모델 버전·전송 방식·토큰 사용량)."""
        size_mb = audio_path.stat().st_size / 1024 / 1024
        uploaded = None
        try:
            if size_mb <= self.s.gemini_inline_max_mb:
                audio_part = types.Part.from_bytes(data=audio_path.read_bytes(), mime_type="audio/mp3")
                transport = "inline"
            else:
                uploaded = await with_retry(
                    lambda: self.client.aio.files.upload(file=str(audio_path), config={"mime_type": "audio/mp3"}),
                    is_retryable=_retryable, max_retries=self.s.api_max_retries, what="Gemini 파일 업로드")
                audio_part = types.Part.from_uri(file_uri=uploaded.uri, mime_type="audio/mp3")
                transport = "files_api"

            user_text = (
                "## 곡 정보 (사용자 입력)\n" + json.dumps(song, ensure_ascii=False, indent=1)
                + "\n\n## Audio Feature Profile (librosa 측정값)\n"
                + json.dumps(profile_for_prompt(features), ensure_ascii=False)
            )
            config = types.GenerateContentConfig(
                system_instruction=load_prompt("gemini_listen"),
                response_mime_type="application/json",
                response_schema=Listening,
                temperature=0.4,
                # 도구 호출을 쓰지 않으므로 끈다 (켜져 있으면 SDK가 매 호출 경고를 찍음)
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )
            resp = await with_retry(
                lambda: self.client.aio.models.generate_content(
                    model=self.s.gemini_model, contents=[audio_part, user_text], config=config),
                is_retryable=_retryable, max_retries=self.s.api_max_retries, what="Gemini 듣기")
        except errors.APIError as e:
            log.exception("Gemini 호출 실패")
            if e.code == 429:
                raise AppError("GEMINI_RATE_LIMIT", "AI가 잠시 바빠요. 잠시 뒤 다시 시도해 주세요.", True) from e
            raise AppError("GEMINI_ERROR", "AI가 곡을 듣는 중 문제가 생겼어요. 다시 시도해 주세요.", True) from e
        finally:
            if uploaded is not None:
                try:
                    await self.client.aio.files.delete(name=uploaded.name)
                except errors.APIError:
                    log.warning("Gemini 업로드 파일 삭제 실패: %s", uploaded.name)

        listening = resp.parsed if isinstance(resp.parsed, Listening) else None
        if listening is None:
            raise AppError("GEMINI_BAD_OUTPUT", "AI의 듣기 결과를 읽지 못했어요. 다시 시도해 주세요.", True)

        valid_ids = {c.id for c in features.highlight_candidates}
        if listening.recommended_highlight_id not in valid_ids:
            log.warning("Gemini가 없는 후보 id를 골랐음: %s", listening.recommended_highlight_id)

        usage = resp.usage_metadata
        meta = {
            "model": self.s.gemini_model,
            "model_version": resp.model_version,
            "transport": transport,
            "audio_mb": round(size_mb, 2),
            "prompt_tokens": getattr(usage, "prompt_token_count", None),
            "output_tokens": getattr(usage, "candidates_token_count", None),
        }
        return listening, meta
