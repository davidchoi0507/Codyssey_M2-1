"""백그라운드 실행기: API 요청은 바로 응답하고, 분석·생성은 여기서 돈다.

- 분석은 CPU_WORKERS개 자리(슬롯)를 나눠 쓴다. 한 작업이 측정→듣기→해석 끝까지 자리를 잡고 있으므로
  librosa 동시 실행도, Gemini 동시 호출(무료 티어 분당 5회)도 같이 제한된다. 자리를 기다리는 작업은
  들어온 순서대로 queue_position(1부터)을 가진다.
- 생성(코디세이 API 호출뿐, CPU 거의 안 씀)은 대기열 없이 바로 시작한다. 이미지 동시 호출은 generate.py의 세마포어.
- 렌더링(숏폼·Canvas, ffmpeg)도 CPU를 많이 쓰므로 같은 자리를 쓴다.
- 서버가 다시 켜지면 끝나지 않은 작업(uploaded·analyzing·generating·rendering)을 다시 넣는다.
  단계마다 결과 파일이 있으면 건너뛰므로 끊긴 단계부터 이어진다.
"""
import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor

from app import db
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.analyze import run_analysis
from app.pipeline.generate import run_generation
from app.pipeline.jobfiles import JobFiles
from app.pipeline.note_edit import relisten_pending, run_relisten
from app.pipeline.render import run_render

log = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, settings: Settings):
        self.s = settings
        self.pool = ProcessPoolExecutor(max_workers=settings.cpu_workers)
        self.slots = asyncio.Semaphore(settings.cpu_workers)
        self.waiting: list[str] = []  # 분석 자리를 기다리는 job_id (들어온 순서)
        self.tasks: dict[str, asyncio.Task] = {}
        self.locks: dict[str, asyncio.Lock] = {}  # 노트 수정이 같은 작업에서 겹치지 않게 (버전 번호 충돌 방지)

    def lock(self, job_id: str) -> asyncio.Lock:
        return self.locks.setdefault(job_id, asyncio.Lock())

    def is_running(self, job_id: str) -> bool:
        t = self.tasks.get(job_id)
        return t is not None and not t.done()

    def queue_position(self, job_id: str) -> int | None:
        try:
            return self.waiting.index(job_id) + 1
        except ValueError:
            return None

    def _start(self, job_id: str, coro_factory) -> None:
        """이벤트 루프 안(async 라우트·lifespan)에서만 호출할 것 — 동기 라우트는 스레드풀에서 돌아 루프가 없다."""
        if self.is_running(job_id):
            raise AppError("JOB_BUSY", "이미 처리 중이에요. 잠시만 기다려 주세요.", True, http_status=409)

        async def run():
            try:
                await coro_factory()
            except AppError as e:
                log.warning("작업 %s 실패: %s", job_id, e)  # 상태는 DB에 이미 기록됨
            except Exception:
                log.exception("작업 %s 예상하지 못한 오류", job_id)

        self.tasks[job_id] = asyncio.create_task(run())

    async def _in_slot(self, jf: JobFiles, coro_factory) -> None:
        self.waiting.append(jf.job_id)
        try:
            await self.slots.acquire()
        finally:
            self.waiting.remove(jf.job_id)
        try:
            await coro_factory()
        finally:
            self.slots.release()

    def start_analysis(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: self._in_slot(jf, lambda: run_analysis(self.s, jf, self.pool)))

    def start_relisten(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: self._in_slot(jf, lambda: run_relisten(self.s, jf)))

    def start_render(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: self._in_slot(jf, lambda: run_render(self.s, jf)))

    def start_generation(self, jf: JobFiles) -> None:
        self._start(jf.job_id, lambda: run_generation(self.s, jf))

    def recover(self) -> list[str]:
        """서버 시작 시: 끝나지 않은 작업을 다시 넣는다 (먼저 들어온 작업부터)."""
        with db.connect() as conn:
            rows = conn.execute("SELECT job_id, stage FROM jobs WHERE stage IN (?, ?, ?, ?) ORDER BY created_at",
                                (Stage.UPLOADED, Stage.ANALYZING, Stage.GENERATING, Stage.RENDERING)).fetchall()
        for r in rows:
            jf = JobFiles(self.s.jobs_dir, r["job_id"])
            jf.event("recovered", stage=r["stage"])
            if r["stage"] == Stage.GENERATING:
                self.start_generation(jf)
            elif r["stage"] == Stage.RENDERING:
                self.start_render(jf)
            elif r["stage"] == Stage.ANALYZING and relisten_pending(jf):
                self.start_relisten(jf)
            else:
                self.start_analysis(jf)
        return [r["job_id"] for r in rows]

    def shutdown(self) -> None:
        for t in self.tasks.values():
            t.cancel()
        self.pool.shutdown(wait=False, cancel_futures=True)
