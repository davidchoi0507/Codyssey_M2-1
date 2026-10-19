"""외부 API 공통 재시도: 429/5xx는 지수 백오프로 다시 시도한다."""
import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")
log = logging.getLogger(__name__)


async def with_retry(fn: Callable[[], Awaitable[T]], *, is_retryable: Callable[[Exception], bool],
                     max_retries: int, what: str, base_delay: float = 2.0) -> T:
    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as e:
            if attempt >= max_retries or not is_retryable(e):
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            log.warning("%s 실패 (%s) — %.1f초 뒤 재시도 %d/%d", what, e, delay, attempt + 1, max_retries)
            await asyncio.sleep(delay)
            attempt += 1
