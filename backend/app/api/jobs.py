"""업로드·진행 화면: POST /jobs, GET /jobs/{job_id}, PATCH /jobs/{job_id}/info"""
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile

from app.api.deps import file_url, job_files, runner, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline.intake import create_job
from app.pipeline.bands import find_band
from app.pipeline.limits import check_daily_limits, client_ip, record_client
from app.pipeline.jobfiles import JobFiles
from app.pipeline.runner import JobRunner
from app.pipeline.views import job_status
from app.schemas.job import JobCreated, JobStatus
from app.schemas.requests import JobInfoPatch

router = APIRouter(prefix="/jobs", tags=["작업"])
CHUNK = 1024 * 1024


@router.post("", response_model=JobCreated, status_code=201, summary="곡 업로드 (분석 시작)")
async def create(
    request: Request,
    file: UploadFile = File(description="음원 .mp3/.wav, 200MB·10분 이하"),
    title: str = Form(), artist: str = Form(), genre: str = Form(""), description: str = Form(""),
    lyrics: str | None = Form(None),
    consent_original: bool = Form(description="자작곡(권리 보유) 확약 — 필수"),
    consent_privacy: bool = Form(description="개인정보 수집·7일 보관 — 필수"),
    consent_external_ai: bool = Form(description="음원의 Gemini 전송·무료 티어 학습 가능성 고지 — 필수"),
    consent_showcase: bool = Form(False, description="발표 사용 동의 — 선택"),
    consent_version: str = Form(description="동의 문구 버전"),
    x_band_code: str | None = Header(default=None, description="밴드 초대 코드 (BAND_CODE_REQUIRED=true면 필수)"),
    s: Settings = Depends(settings), r: JobRunner = Depends(runner),
) -> JobCreated:
    client = client_ip(request)
    band = find_band(x_band_code)
    check_daily_limits(s, client, band)  # 파일을 받기 전에
    s.jobs_dir.mkdir(parents=True, exist_ok=True)
    limit = s.max_upload_mb * 1024 * 1024
    with tempfile.TemporaryDirectory(dir=s.data_dir) as tmp:
        tmp_path = Path(tmp) / "upload"
        written = 0
        with tmp_path.open("wb") as out:
            while chunk := await file.read(CHUNK):
                written += len(chunk)
                if written > limit:
                    raise AppError("UPLOAD_TOO_LARGE", f"{s.max_upload_mb}MB 이하 파일만 올릴 수 있어요.", False,
                                   http_status=413)
                out.write(chunk)
        song = {"title": title, "artist": artist, "genre": genre, "description": description, "lyrics": lyrics}
        consent = {"consent_original": consent_original, "consent_privacy": consent_privacy,
                   "consent_external_ai": consent_external_ai, "consent_showcase": consent_showcase,
                   "consent_version": consent_version}
        jf = create_job(s, tmp_path, filename=file.filename or "", song=song, consent=consent, source="api")
    record_client(jf.job_id, client, band)
    r.start_analysis(jf)
    return JobCreated(job_id=jf.job_id, status_url=f"/jobs/{jf.job_id}")


@router.get("/{job_id}", response_model=JobStatus, summary="진행 상태 (2~3초마다 폴링)")
def status(jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner)) -> JobStatus:
    return job_status(jf, r.queue_position(jf.job_id), lambda p: file_url(jf, p))


@router.patch("/{job_id}/info", response_model=dict, summary="기다리는 동안 추가 입력 (가사·채널·발매일)")
def patch_info(body: JobInfoPatch, jf: JobFiles = Depends(job_files)) -> dict:
    song = jf.read_json(jf.song)
    song.update(body.model_dump(exclude_none=True))
    jf.write_json(jf.song, song)
    jf.event("info_updated", fields=sorted(body.model_dump(exclude_none=True)))
    return {k: v for k, v in song.items() if k != "lyrics"} | {"lyrics_set": bool(song.get("lyrics"))}


@router.post("/{job_id}/retry", response_model=JobStatus, summary="실패한 단계부터 다시 시도")
async def retry(jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner)) -> JobStatus:
    st = jf.status()
    if st["stage"] != "failed":
        raise AppError("NOT_FAILED", "실패한 작업만 다시 시도할 수 있어요.", False, http_status=409)
    if (st.get("error") or {}).get("retryable") is False:
        raise AppError("NOT_RETRYABLE", "이 문제는 다시 시도해도 해결되지 않아요. 새로 올려 주세요.", False, http_status=409)
    if st.get("step") == "generate":
        r.start_generation(jf)
    elif st.get("step") == "render":
        r.start_render(jf)
    else:
        r.start_analysis(jf)
    jf.event("retry", step=st.get("step"))
    return job_status(jf, r.queue_position(jf.job_id), lambda p: file_url(jf, p))
