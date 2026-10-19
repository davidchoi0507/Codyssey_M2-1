"""코디세이 키 여러 개 돌려 쓰기 (10/16): .env CODYSSEY_API_KEY=키A,키B,키C — 키가 하나면 예전과 똑같다.

- 요청마다 다음 키부터 써서 사용량을 나눈다.
- 한도·권한 오류(429·401·402·403)가 난 키는 잠시 빼고, 같은 요청을 다음 키로 바로 다시 보낸다.
  일시 오류(5xx·연결)도 기다리지 않고 다음 키로 넘긴다. 마지막 키만 예전처럼 지수 백오프 재시도를 한다.
- 빠진 키만 남아도 요청은 보낸다 (쉬는 시간이 먼저 끝나는 키부터). 키가 다 막혀도 서비스가 멈추지 않게.
- 로그에는 키 끝 4자리만 남긴다.
"""
import logging
import time

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger(__name__)

# 상태 코드 → 그 키를 쉬게 할 시간(초). 429는 순간 혼잡일 수도 있어 짧게, 권한·결제 오류는 길게.
BENCH_SECONDS = {429: 60, 401: 3600, 402: 3600, 403: 3600}


def key_tail(key: str) -> str:
    return "…" + key[-4:]


class KeyPool:
    def __init__(self, keys: list[str]):
        if not keys:
            raise AppError("CONFIG", "코디세이 API 키가 설정되지 않았어요 (CODYSSEY_API_KEY).", False)
        self.keys = keys
        self._turn = 0
        self._resting_until: dict[str, float] = {}

    def order(self) -> list[str]:
        """이번 요청에서 시도할 키 순서: 차례가 된 키부터, 쉬는 키는 맨 뒤(쉬는 시간이 먼저 끝나는 순)."""
        start = self._turn % len(self.keys)
        self._turn += 1
        rotated = self.keys[start:] + self.keys[:start]
        now = time.monotonic()
        ready = [k for k in rotated if self._resting_until.get(k, 0) <= now]
        resting = sorted((k for k in rotated if self._resting_until.get(k, 0) > now), key=self._resting_until.__getitem__)
        return ready + resting

    def rest(self, key: str, status: int | None) -> bool:
        """한도·권한 오류면 그 키를 잠시 쉬게 하고 True. 그 밖의 오류(5xx 등)는 키 탓이 아니라 그대로 둔다."""
        if status not in BENCH_SECONDS:
            return False
        self._resting_until[key] = time.monotonic() + BENCH_SECONDS[status]
        log.warning("코디세이 키 %s HTTP %s → %d초 쉬게 함", key_tail(key), status, BENCH_SECONDS[status])
        return True


_pools: dict[tuple[str, ...], KeyPool] = {}


def key_pool(settings: Settings) -> KeyPool:
    """프로세스 안에서 키 목록마다 하나 (차례·쉬는 시간을 요청 사이에 기억)."""
    keys = tuple(settings.codyssey_api_keys)
    if keys not in _pools:
        _pools[keys] = KeyPool(list(keys))
    return _pools[keys]
