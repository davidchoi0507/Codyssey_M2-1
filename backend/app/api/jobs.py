"""업로드·진행 화면: POST /jobs, POST /jobs/demo, GET /jobs/{job_id}, PATCH /jobs/{job_id}/info"""
import hashlib
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.auth import link_job
from app.api.deps import current_user, file_url, job_files, person_key, runner, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.analysis.audio_io import check_magic
from app.pipeline import community, demo, reports
from app.pipeline.intake import ALLOWED_EXT, create_job
from app.pipeline.bands import find_band
from app.pipeline.limits import check_daily_limits, check_demo_limits, client_ip, record_client
from app.pipeline.jobfiles import JobFiles
from app.pipeline.runner import JobRunner
from app.pipeline.views import job_status
from app.schemas.job import JobCreated, JobStatus
from app.schemas.requests import MAX_DESCRIPTION, MAX_GENRE, MAX_LYRICS, MAX_TITLE, JobInfoPatch

router = APIRouter(prefix="/jobs", tags=["작업"])
CHUNK = 1024 * 1024
# 연속 클릭 방지 (팀 테스트 P1-1): 같은 사람(밴드 코드 또는 IP)이 같은 파일·제목·아티스트를 이 시간 안에 다시 올리면
# 새 작업을 만들지 않고 앞 작업을 돌려준다. 서버 프로세스 하나라 메모리로 충분 (재시작하면 비워짐).
DUPLICATE_WINDOW_SEC = 120
_recent_uploads: dict[tuple, tuple[str, float]] = {}


def _find_duplicate(key: tuple) -> str | None:
    now = time.monotonic()
    for k, (_, at) in list(_recent_uploads.items()):
        if now - at > DUPLICATE_WINDOW_SEC:
            del _recent_uploads[k]
    hit = _recent_uploads.get(key)
    return hit[0] if hit else None


@router.post("", response_model=JobCreated, status_code=201, summary="곡 업로드 (분석 시작)")
async def create(
    request: Request,
    file: UploadFile = File(description="음원 .mp3/.wav, 200MB·10분 이하"),
    title: str = Form(max_length=MAX_TITLE), artist: str = Form(max_length=MAX_TITLE),
    genre: str = Form("", max_length=MAX_GENRE), description: str = Form("", max_length=MAX_DESCRIPTION),
    lyrics: str | None = Form(None, max_length=MAX_LYRICS),
    consent_original: bool = Form(description="자작곡(권리 보유) 확약 — 필수"),
    consent_privacy: bool = Form(description="개인정보 수집·7일 보관 — 필수"),
    consent_external_ai: bool = Form(description="음원의 Gemini 전송·무료 티어 학습 가능성 고지 — 필수"),
    consent_showcase: bool = Form(False, description="발표 사용 동의 — 선택"),
    consent_version: str = Form(max_length=20, description="동의 문구 버전"),
    confirm_original: bool = Form(False, description="(10/16 추가) 409 KNOWN_SONG_MATCH 뒤 '직접 만든 곡이 맞다'고 확인하고 "
                                  "다시 보낼 때 true"),
    x_band_code: str | None = Header(default=None, description="밴드 초대 코드 (BAND_CODE_REQUIRED=true면 필수)"),
    s: Settings = Depends(settings), r: JobRunner = Depends(runner),
) -> JobCreated:
    client = client_ip(request)
    user = current_user(request)
    who = person_key(request, user)
    band = find_band(x_band_code, client)
    check_daily_limits(s, client, band, who)  # 파일을 받기 전에
    s.jobs_dir.mkdir(parents=True, exist_ok=True)
    limit = s.max_upload_mb * 1024 * 1024
    with tempfile.TemporaryDirectory(dir=s.data_dir) as tmp:
        tmp_path = Path(tmp) / "upload"
        written = 0
        digest = hashlib.sha256()
        with tmp_path.open("wb") as out:
            while chunk := await file.read(CHUNK):
                written += len(chunk)
                digest.update(chunk)
                if written > limit:
                    raise AppError("UPLOAD_TOO_LARGE", f"{s.max_upload_mb}MB 이하 파일만 올릴 수 있어요.", False,
                                   http_status=413)
                out.write(chunk)
        dup_key = (band["code"] if band else who, digest.hexdigest(), title.strip(), artist.strip())
        if (dup := _find_duplicate(dup_key)) and JobFiles(s.jobs_dir, dup).status()["stage"] != "failed":
            return JobCreated(job_id=dup, status_url=f"/jobs/{dup}", duplicate=True)
        # 남의 곡 먼저 거르기 (10/16): AI 분석(Gemini 하루 한도) 전에 소리 지문으로 — 커뮤니티에 이미 공개된 곡과 같은
        # 녹음이면 거절, 알려진 곡(AcoustID)과 비슷하면 '직접 만든 곡이 맞아요' 확인을 받아야 분석 시작. 몇 초 걸림.
        ext = Path(file.filename or "").suffix.lower()
        known = None
        if ext in ALLOWED_EXT:
            check_magic(tmp_path, ext)
            _, known = await run_in_threadpool(community.check_copy, s, tmp_path, ext,
                                               user_id=user["user_id"] if user else None, who=who,
                                               confirm_original=confirm_original)
        song = {"title": title, "artist": artist, "genre": genre, "description": description, "lyrics": lyrics}
        consent = {"consent_original": consent_original, "consent_privacy": consent_privacy,
                   "consent_external_ai": consent_external_ai, "consent_showcase": consent_showcase,
                   "consent_version": consent_version}
        jf = create_job(s, tmp_path, filename=file.filename or "", song=song, consent=consent, source="api")
        _recent_uploads[dup_key] = (jf.job_id, time.monotonic())
    if known:  # 알려진 곡과 비슷하지만 올린 사람이 직접 만든 곡이라고 확인함 — 공개할 때 다시 묻지 않게 남긴다
        jf.write_json(jf.root / community.COPY_CHECK, {"known": known, "confirmed": True})
        jf.event("known_song_confirmed", score=known["score"])
        reports.notify(f"알려진 곡과 비슷하지만 올린 사람이 자작곡이라고 확인하고 분석을 시작했어요: '{artist} — {title}' ≈ "
                       f"'{known['artist']} — {known['title']}' (점수 {known['score']}, 작업 {jf.job_id})")
    record_client(jf.job_id, client, band, who)
    link_job(jf.job_id, user)  # 로그인했으면 '내 곡'에 (선택)
    r.start_analysis(jf)
    return JobCreated(job_id=jf.job_id, status_url=f"/jobs/{jf.job_id}")


@router.post("/demo", response_model=JobCreated, status_code=201, summary="(10/17 추가) 체험 모드 — 예시 곡으로 시작",
             description="곡 없이 예시 곡(아티스트 201의 AI 곡)으로 작업을 만든다. 분석·A&R 노트는 미리 만든 것이라 몇 초 안에 "
                         "note_ready. 그다음(노트 수정·수락 → 커버·카피·영상, 발매 준비 검사, ZIP)은 보통 작업과 같은 API를 "
                         "그대로 쓴다. 다른 점: 커뮤니티 공개는 403 DEMO_NO_PUBLISH, GET /jobs/{id}의 demo=true. "
                         "업로드 동의는 받지 않는다(올리는 곡이 없음). 하루 한도는 사람별 DAILY_DEMO_PER_CLIENT(기본 3)로 "
                         "내 곡 한도와 따로 센다. 예시 곡이 서버에 준비 안 됐으면 503 DEMO_UNAVAILABLE.")
async def create_demo(request: Request, s: Settings = Depends(settings), r: JobRunner = Depends(runner)) -> JobCreated:
    client = client_ip(request)
    user = current_user(request)
    who = person_key(request, user)
    check_demo_limits(s, client, who)
    s.jobs_dir.mkdir(parents=True, exist_ok=True)
    jf = await run_in_threadpool(demo.create_demo_job, s)
    record_client(jf.job_id, client, None, who)
    link_job(jf.job_id, user)
    r.start_analysis(jf)  # 결과 파일이 다 있어 단계를 건너뛰고 바로 note_ready
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
