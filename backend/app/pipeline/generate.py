"""생성 파이프라인 (노트 수락 후): 비주얼 디렉터 → 커버 3장 + 카피라이터 채널 4종 + 피칭 메일(영·한).

- 비주얼 디렉터·카피라이터·피칭은 병렬. 커버 3장도 동시에 생성 (이미지 API 동시 호출 수는 세마포어로 제한).
- 결과는 버전 번호를 붙여 저장하고, 다시 실행하면 이미 있는 파일은 건너뛴다 (실패한 항목부터 재실행).
- 끝나면 awaiting_cover (사용자가 커버를 고르면 숏폼·채널 이미지 렌더링 — 10/7·10/9).
"""
import asyncio
import logging
import time

from app.adapters.codyssey_image import CodysseyImage
from app.agents.copywriter import write_copy
from app.agents.pitch import write_pitch
from app.agents.visual import plan_covers
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.media.images import save_png, upscale
from app.pipeline.jobfiles import JobFiles, now_iso
from app.schemas.note import ARNote
from app.schemas.package import CHANNELS, VisualPlan

log = logging.getLogger(__name__)
IMAGE_CONCURRENCY = 3


def accepted_note(jf: JobFiles) -> ARNote:
    if not jf.accepted.exists():
        raise AppError("NOTE_NOT_ACCEPTED", "A&R 노트를 먼저 수락해 주세요.", False)
    v = jf.read_json(jf.accepted)["version"]
    return ARNote.model_validate(jf.read_json(jf.note(v)))


def song_duration(jf: JobFiles) -> float:
    """곡 길이(초) — 글 속 시간 표현 검사용."""
    return float(jf.read_json(jf.features)["duration_sec"])


def accept_note(jf: JobFiles, version: int | None = None) -> ARNote:
    """지정 버전(없으면 최신)을 확정본으로 기록."""
    v = version or jf.latest_note_version()
    if v is None or not jf.note(v).exists():
        raise AppError("NOTE_NOT_READY", "아직 A&R 노트가 준비되지 않았어요.", False)
    jf.write_json(jf.accepted, {"version": v, "at": now_iso()})
    jf.event("note_accepted", version=v)
    return ARNote.model_validate(jf.read_json(jf.note(v)))


async def _covers(settings: Settings, jf: JobFiles, note: ARNote, song: dict, listening: dict | None) -> None:
    if jf.cover_prompts(1).exists():
        plan = VisualPlan.model_validate(jf.read_json(jf.cover_prompts(1)))
    else:
        plan, meta = await plan_covers(settings, note, song, listening)
        jf.write_json(jf.cover_prompts(1), plan.model_dump())
        jf.event("visual_meta", **meta)

    image = CodysseyImage(settings)
    sem = asyncio.Semaphore(IMAGE_CONCURRENCY)

    async def one(idx: int, prompt: str, direction_id: str) -> None:
        png_path, big_path = jf.cover(idx, 1), jf.cover(idx, 1, "_3000")
        if not png_path.exists():
            async with sem:
                t = time.monotonic()
                png, meta = await image.generate(prompt)
            size = await asyncio.to_thread(save_png, png, png_path)
            jf.event("cover_generated", item=f"cover-{idx}", direction_id=direction_id, v=1, size=list(size),
                     sec=round(time.monotonic() - t, 1), **meta)
        if not big_path.exists():
            await asyncio.to_thread(upscale, png_path, big_path, 3000)

    order = {c.id: i for i, c in enumerate(note.cover_directions, 1)}
    results = await asyncio.gather(*(one(order[c.direction_id], c.prompt, c.direction_id) for c in plan.covers),
                                   return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        for e in errors:
            log.error("커버 생성 실패: %r", e)
        raise errors[0] if isinstance(errors[0], AppError) else AppError(
            "IMAGE_ERROR", "커버 이미지 일부를 만들지 못했어요. 다시 시도하면 실패한 것만 다시 만들어요.", True)


async def _copy(settings: Settings, jf: JobFiles, note: ARNote, song: dict) -> None:
    if all(jf.channel_copy(ch, 1).exists() for ch in CHANNELS):
        return
    copyset, meta = await write_copy(settings, note, song, song_duration(jf))
    for ch in CHANNELS:
        jf.write_json(jf.channel_copy(ch, 1), getattr(copyset, ch).model_dump())
    jf.event("copy_meta", **meta)


async def _pitch(settings: Settings, jf: JobFiles, note: ARNote, song: dict, listening: dict | None) -> None:
    if all(jf.pitch(lang, 1).exists() for lang in ("en", "ko")):
        return
    pitch, meta = await write_pitch(settings, note, song, listening, song_duration(jf))
    for lang in ("en", "ko"):
        jf.write_json(jf.pitch(lang, 1), getattr(pitch, lang).model_dump())
    jf.event("pitch_meta", **meta)


async def run_generation(settings: Settings, jf: JobFiles) -> None:
    note = accepted_note(jf)
    song = jf.read_json(jf.song)
    listening = jf.read_json(jf.listening)["result"] if jf.listening.exists() else None
    jf.set_status(Stage.GENERATING, step="generate")
    jf.event("step_start", step="generate")
    t = time.monotonic()
    try:
        results = await asyncio.gather(_covers(settings, jf, note, song, listening), _copy(settings, jf, note, song),
                                       _pitch(settings, jf, note, song, listening), return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                raise r
    except AppError as e:
        jf.fail(e.to_dict())
        jf.event("failed", step="generate", code=e.code, message=e.message)
        raise
    except Exception as e:
        log.exception("생성 중 예상하지 못한 오류")
        err = AppError("INTERNAL", "처리 중 문제가 생겼어요. 다시 시도해 주세요.", True)
        jf.fail(err.to_dict())
        jf.event("failed", step="generate", code=err.code, message=repr(e))
        raise err from e
    jf.event("step_end", step="generate", sec=round(time.monotonic() - t, 2), ok=True)
    jf.set_status(Stage.AWAITING_COVER)
