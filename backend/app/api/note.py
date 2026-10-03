"""A&R 노트 화면: 조회 / 수정 / 다시 듣기 / 수락"""
from fastapi import APIRouter, Depends

from app.api.deps import job_files, runner
from app.core.errors import AppError, not_ready
from app.pipeline.generate import accept_note
from app.pipeline.jobfiles import JobFiles
from app.pipeline.runner import JobRunner
from app.pipeline.views import job_status
from app.schemas.job import JobStatus
from app.schemas.note import ARNote
from app.schemas.requests import AcceptRequest, NotePatch

router = APIRouter(prefix="/jobs/{job_id}/note", tags=["A&R 노트"])


@router.get("", response_model=ARNote, summary="A&R 노트 조회 (최신 버전)")
def get_note(jf: JobFiles = Depends(job_files)) -> ARNote:
    v = jf.latest_note_version()
    if v is None:
        raise AppError("NOTE_NOT_READY", "아직 A&R 노트가 준비되지 않았어요.", True, http_status=409)
    return ARNote.model_validate(jf.read_json(jf.note(v)))


@router.patch("", response_model=ARNote, summary="노트 수정 (한 줄 수정·직접 편집·하이라이트 선택) — 10/6 예정")
def patch_note(body: NotePatch, jf: JobFiles = Depends(job_files)) -> ARNote:
    raise not_ready("10/6")


@router.post("/relisten", response_model=JobStatus, summary="다시 듣기 — 10/6 예정")
def relisten(jf: JobFiles = Depends(job_files)) -> JobStatus:
    raise not_ready("10/6")


@router.post("/accept", response_model=JobStatus, summary="노트 수락 → 커버 3종·채널 카피 생성 시작")
async def accept(body: AcceptRequest | None = None, jf: JobFiles = Depends(job_files),
           r: JobRunner = Depends(runner)) -> JobStatus:
    if jf.accepted.exists():
        raise AppError("ALREADY_ACCEPTED", "이미 수락한 노트예요. 결과 화면에서 확인해 주세요.", False, http_status=409)
    accept_note(jf, body.version if body else None)
    r.start_generation(jf)
    return job_status(jf)
