"""분석 파이프라인: 압축 + librosa → Gemini 듣기 → A&R 노트 v1.

각 단계 결과를 파일로 저장하고, 다시 실행하면 이미 끝난 단계는 건너뛴다(= 실패한 단계부터 재실행).
압축(ffmpeg)과 librosa는 동시에 돈다. Gemini는 librosa 수치·하이라이트 후보를 함께 받아야 하므로
librosa가 끝난 뒤 시작한다 (librosa는 수 초, Gemini가 대부분의 시간을 차지).
"""
import asyncio
import logging
import time
from concurrent.futures import ProcessPoolExecutor

from app.adapters.gemini import GeminiListener
from app.agents.ar import write_note
from app.analysis.audio_io import make_analysis_mp3
from app.analysis.features import analyze_file
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.jobfiles import JobFiles
from app.schemas.analysis import Features, Listening
from app.schemas.note import ARNote

log = logging.getLogger(__name__)


class _Timer:
    def __init__(self, jf: JobFiles, step: str):
        self.jf, self.step = jf, step

    def __enter__(self):
        self.t = time.monotonic()
        self.jf.set_status(Stage.ANALYZING, step=self.step)
        self.jf.event("step_start", step=self.step)
        return self

    def __exit__(self, exc_type, exc, tb):
        self.sec = round(time.monotonic() - self.t, 2)
        self.jf.event("step_end", step=self.step, sec=self.sec, ok=exc is None)
        return False


async def run_analysis(settings: Settings, jf: JobFiles, pool: ProcessPoolExecutor) -> ARNote:
    song = jf.read_json(jf.song)
    original = jf.find_original()
    if original is None:
        raise AppError("JOB_NO_INPUT", "올린 음원을 찾을 수 없어요. 다시 올려 주세요.", False)
    loop = asyncio.get_running_loop()
    timings: dict[str, float] = {}

    try:
        # 1) 수치 재기: 압축본 만들기 + librosa (동시)
        if jf.features.exists() and jf.analysis_mp3.exists():
            features = Features.model_validate(jf.read_json(jf.features))
        else:
            with _Timer(jf, "measure") as t:
                mp3_task = asyncio.to_thread(make_analysis_mp3, original, jf.analysis_mp3)
                feat_task = loop.run_in_executor(pool, analyze_file, str(original), settings.highlight_sec)
                _, feat_dict = await asyncio.gather(mp3_task, feat_task)
                features = Features.model_validate(feat_dict)
                jf.write_json(jf.features, features.model_dump())
            timings["measure"] = t.sec

        # 2) 곡 듣기: Gemini
        if jf.listening.exists():
            saved = jf.read_json(jf.listening)
            listening, gemini_meta = Listening.model_validate(saved["result"]), saved["meta"]
        else:
            with _Timer(jf, "listen") as t:
                listening, gemini_meta = await GeminiListener(settings).listen(jf.analysis_mp3, features, song)
                jf.write_json(jf.listening, {"result": listening.model_dump(), "meta": gemini_meta})
            timings["listen"] = t.sec

        # 3) 해석 쓰기: A&R 에이전트
        if jf.note(1).exists():
            note = ARNote.model_validate(jf.read_json(jf.note(1)))
        else:
            with _Timer(jf, "note") as t:
                note, llm_meta = await write_note(
                    settings, job_id=jf.job_id, features=features, listening=listening, song=song,
                    gemini_model=gemini_meta["model"])
                jf.write_json(jf.note(1), note.model_dump())
                jf.event("note_meta", version=1, **llm_meta)
            timings["note"] = t.sec
    except AppError as e:
        jf.fail(e.to_dict())
        jf.event("failed", code=e.code, message=e.message)
        raise
    except Exception as e:
        log.exception("분석 중 예상하지 못한 오류")
        err = AppError("INTERNAL", "처리 중 문제가 생겼어요. 다시 시도해 주세요.", True)
        jf.fail(err.to_dict())
        jf.event("failed", code=err.code, message=repr(e))
        raise err from e

    jf.set_status(Stage.NOTE_READY)
    jf.event("note_ready", timings=timings)
    return note
