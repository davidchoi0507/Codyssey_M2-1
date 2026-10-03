"""백그라운드 실행기: API 요청은 바로 응답하고, 분석·생성은 여기서 돈다.

임시 버전 — 대기열 순번, 동시 실행 제한, 서버 재시작 시 미완료 작업 복구는 10/6에 추가.
(librosa는 프로세스 풀 크기 = CPU_WORKERS 만큼만 동시에 돈다)
"""
import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor

from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline.analyze import run_analysis
from app.pipeline.generate import run_generation
from app.pipeline.jobfiles import JobFiles

log = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, settings: Settings):
        self.s = settings
        self.pool = ProcessPoolExecutor(max_workers=settings.cpu_workers)
        self.tasks: dict[str, asyncio.Task] = {}

    def is_running(self, job_id: str) -> bool:
        t = self.tasks.get(job_id)
        return t is not None and not t.done()

    def _start(self, job_id: str, coro_factory) -> None:
        """이벤트 루프 안(async 라우트)에서만 호출할 것 — 동기 라우트는 스레드풀에서 돌아 루프가 없다."""
        if self.is_running(job_id):
            raise AppError("JOB_BUSY", "이미 처리 중이에요. 잠시만 기다려 주세요.", True, http_status=409)

        async def run():
            try:
                await coro_factory()
            except AppError as e:
                log.warning("작업 %s 실패: %s", job_id, e)  # 상태 파일에 이미 기록됨
            except Exception:
                log.exception("작업 %s 예상하지 못한 오류", job_id)

        self.tasks[job_id] = asyncio.create_task(run())

    def start_analysis(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: run_analysis(self.s, jf, self.pool))

    def start_generation(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: run_generation(self.s, jf))

    def shutdown(self) -> None:
        for t in self.tasks.values():
            t.cancel()
        self.pool.shutdown(wait=False, cancel_futures=True)
