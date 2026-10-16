"""코디세이 이미지 어댑터: POST https://copa.codyssey.kr/api/v1/images

응답의 url은 웹 로그인 전용이라 API 키로 열 수 없다 → response_format=b64_json으로 원본을 받는다.
응답 형식: {"code":200,"result":{"images":[{"b64_json":...}],"usage":{...}},"errors":null}
"""
import base64
import logging

import httpx

from app.adapters.codyssey_keys import key_pool, key_tail
from app.adapters.retry import with_retry
from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger(__name__)


class _HttpError(Exception):
    def __init__(self, status: int, text: str):
        super().__init__(f"HTTP {status}: {text[:200]}")
        self.status, self.text = status, text


def _transient(e: Exception) -> bool:
    return isinstance(e, httpx.TransportError) or (isinstance(e, _HttpError) and (e.status == 429 or e.status >= 500))


class CodysseyImage:
    def __init__(self, settings: Settings):
        if not settings.codyssey_image_model:
            raise AppError("CONFIG", "이미지 모델이 설정되지 않았어요 (CODYSSEY_IMAGE_MODEL).", False)
        self.s = settings
        self.pool = key_pool(settings)
        # .../v1 → 미디어 API는 /api/v1 경로
        self.url = settings.codyssey_base_url.rstrip("/").removesuffix("/v1") + "/api/v1/images"

    @property
    def model_label(self) -> str:
        return f"codyssey:{self.s.codyssey_image_model}"

    async def _post(self, key: str, prompt: str, size: str) -> dict:
        async with httpx.AsyncClient(timeout=240) as client:
            r = await client.post(self.url, headers={"Authorization": f"Bearer {key}"},
                                  json={"model": self.s.codyssey_image_model, "prompt": prompt,
                                        "size": size, "response_format": "b64_json"})
        if r.status_code != 200:
            raise _HttpError(r.status_code, r.text)
        return r.json()

    async def generate(self, prompt: str, *, size: str = "1024x1024") -> tuple[bytes, dict]:
        """반환: (PNG 바이트, 메타 — 모델·토큰·requestId).
        키가 여러 개면 차례대로 돌려 쓰고, 한도·권한·일시 오류면 다음 키로 넘긴다. 마지막 키만 백오프 재시도."""
        keys = self.pool.order()
        for i, key in enumerate(keys):
            last = i == len(keys) - 1
            try:
                if last:
                    data = await with_retry(lambda: self._post(key, prompt, size), is_retryable=_transient,
                                            max_retries=self.s.api_max_retries, what="코디세이 이미지")
                else:
                    data = await self._post(key, prompt, size)
                break
            except (_HttpError, httpx.TransportError) as e:
                switch = self.pool.rest(key, getattr(e, "status", None)) or _transient(e)
                if switch and not last:
                    log.warning("코디세이 이미지: 키 %s 실패(%s) → 다음 키 %s", key_tail(key), e, key_tail(keys[i + 1]))
                    continue
                if _transient(e):
                    raise AppError("IMAGE_BUSY", "이미지 AI가 잠시 바빠요. 잠시 뒤 다시 시도해 주세요.", True) from e
                log.error("이미지 생성 실패 %s", str(e)[:500])
                raise AppError("IMAGE_ERROR", "커버 이미지를 만들지 못했어요. 다시 시도해 주세요.", True) from e

        result = data.get("result") or {}
        images = result.get("images") or []
        if not images or not images[0].get("b64_json"):
            log.error("이미지 응답에 b64_json 없음: code=%s errors=%s", data.get("code"), data.get("errors"))
            raise AppError("IMAGE_ERROR", "커버 이미지를 만들지 못했어요. 다시 시도해 주세요.", True)
        png = base64.b64decode(images[0]["b64_json"].split(",")[-1])
        usage = result.get("usage") or {}
        meta = {"model": self.model_label, "request_id": result.get("requestId"),
                "output_tokens": usage.get("outputTokens")}
        return png, meta
