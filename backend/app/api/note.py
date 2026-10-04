"""A&R 노트 화면: 조회 / 수정 / 다시 듣기 / 수락"""
from fastapi import APIRouter, Depends

from app.api.deps import job_files, runner, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.generate import accept_note
from app.pipeline.note_edit import edit_note, edits_remaining, ensure_editable, latest_note
from app.pipeline.jobfiles import JobFiles
from app.pipeline.runner import JobRunner
from app.pipeline.views import job_status
from app.schemas.job import JobStatus
from app.schemas.note import ARNote
from app.schemas.requests import AcceptRequest, NotePatch

router = APIRouter(prefix="/jobs/{job_id}/note", tags=["A&R 노트"])


@router.get("", response_model=ARNote, summary="A&R 노트 조회 (최신 버전)")
def get_note(jf: JobFiles = Depends(job_files), s: Settings = Depends(settings)) -> ARNote:
    # 남은 횟수는 노트에 저장된 값이 아니라 지금 기록으로 계산 (제한 규칙이 바뀌어도 맞게)
    return latest_note(jf).model_copy(update={"edits_remaining": edits_remaining(s, jf)})


@router.patch("", response_model=ARNote,
              summary="노트 수정 (한 줄 수정·직접 편집·하이라이트 선택) → 새 버전",
              description="correction이 있으면 해석을 다시 써서 10초 안팎 걸린다. 직접 편집 필드는 그 위에 덮어쓴다. "
                          "한 줄 수정과 다시 듣기만 횟수를 쓴다 (edits_remaining). 직접 편집은 제한 없음.")
async def patch_note(body: NotePatch, jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner),
                     s: Settings = Depends(settings)) -> ARNote:
    if r.is_running(jf.job_id):
        raise AppError("JOB_BUSY", "다시 듣는 중이에요. 끝난 뒤에 고쳐 주세요.", True, http_status=409)
    async with r.lock(jf.job_id):
        return await edit_note(s, jf, body)


@router.post("/relisten", response_model=JobStatus, summary="다시 듣기 (추가한 가사 등 반영) → 새 버전",
             description="백그라운드로 돈다. GET /jobs/{id}를 폴링하다가 note_ready가 되면 노트를 다시 조회. "
                         "실패하면 이전 노트가 그대로 있고 error에 이유가 담긴다 (횟수는 돌려줌).")
async def relisten(jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner),
                   s: Settings = Depends(settings)) -> JobStatus:
    async with r.lock(jf.job_id):
        if r.is_running(jf.job_id):
            raise AppError("JOB_BUSY", "이미 처리 중이에요. 잠시만 기다려 주세요.", True, http_status=409)
        ensure_editable(s, jf, uses_ai=True)
        jf.event("relisten_requested")
        jf.set_status(Stage.ANALYZING, step="listen")  # 차례를 기다리는 동안 수정·수락이 끼어들지 않게
        r.start_relisten(jf)
    return job_status(jf, r.queue_position(jf.job_id))


@router.post("/accept", response_model=JobStatus, summary="노트 수락 → 커버 3종·채널 카피 생성 시작")
async def accept(body: AcceptRequest | None = None, jf: JobFiles = Depends(job_files),
           r: JobRunner = Depends(runner)) -> JobStatus:
    if jf.status()["stage"] != Stage.NOTE_READY and not jf.accepted.exists():
        raise AppError("NOTE_NOT_READY", "노트가 준비된 뒤에 수락할 수 있어요.", True, http_status=409)
    if jf.accepted.exists():
        raise AppError("ALREADY_ACCEPTED", "이미 수락한 노트예요. 결과 화면에서 확인해 주세요.", False, http_status=409)
    accept_note(jf, body.version if body else None)
    r.start_generation(jf)
    return job_status(jf)
