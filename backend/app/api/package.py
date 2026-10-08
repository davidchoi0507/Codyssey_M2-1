"""결과 화면: 패키지 목록 / 커버 선택 / 항목 재생성 / 직접 올린 사진 / ZIP"""
from fastapi import APIRouter, Depends, File, Header, Query, Request, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import ZIP_TOKEN_PATH, check_owner, file_url, find_job, job_files, runner, settings, zip_url
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.core.tokens import read_token
from app.pipeline.jobfiles import JobFiles
from app.pipeline.render import select_cover as record_selection
from app.pipeline.results import MAX_OWN_IMAGE_MB, build_zip, regenerate as regenerate_item, save_own_image, zip_info
from app.pipeline.runner import JobRunner
from app.pipeline.views import build_package
from app.schemas.package import Package
from app.schemas.requests import CoverSelect, RegenerateRequest

router = APIRouter(prefix="/jobs/{job_id}", tags=["결과"])


def _package(jf: JobFiles, s: Settings) -> Package:
    pkg = build_package(jf, s, lambda p: file_url(jf, p), zip_url=zip_url(jf))
    if pkg.stage == Stage.DONE:
        pkg.zip_files, pkg.zip_size_bytes = zip_info(jf, pkg)
    return pkg


def _not_busy(r: JobRunner, jf: JobFiles) -> None:
    if r.is_running(jf.job_id):
        raise AppError("JOB_BUSY", "아직 만드는 중이에요. 끝난 뒤에 다시 해 주세요.", True, http_status=409)


@router.get("/package", response_model=Package, summary="결과 패키지 목록 (커버·영상·채널 글·이미지·피칭)")
def get_package(jf: JobFiles = Depends(job_files), s: Settings = Depends(settings)) -> Package:
    return _package(jf, s)


@router.post("/cover/select", response_model=Package, summary="커버 선택 → 숏폼·Canvas·채널 이미지 렌더링 시작",
             description="렌더링은 대기열을 거쳐 백그라운드로 40초 안팎. GET /jobs/{id}를 폴링하다 done이 되면 패키지를 다시 조회. "
                         "다른 커버를 다시 고르면 새로 렌더링한다. item_id: cover-1~3, cover-own(직접 올린 사진)")
async def select_cover(body: CoverSelect, jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner),
                       s: Settings = Depends(settings)) -> Package:
    async with r.lock(jf.job_id):
        _not_busy(r, jf)
        record_selection(jf, body.item_id, body.v)
        r.start_render(jf)
    return _package(jf, s)


@router.post("/items/{item_id}/regenerate", response_model=Package,
             summary="항목 하나 다시 만들기 + 요청 한 줄 → 새 버전",
             description="item_id: cover-1~3(약 20초), copy-instagram|tiktok|threads|x(약 5초), pitch-en|ko(약 10초). "
                         "항목마다 regenerate_remaining회. 커버를 다시 만들어도 이미 고른 커버·영상은 바뀌지 않는다 (새 버전을 고르면 다시 렌더링).")
async def regenerate(item_id: str, body: RegenerateRequest | None = None, jf: JobFiles = Depends(job_files),
                     r: JobRunner = Depends(runner), s: Settings = Depends(settings)) -> Package:
    async with r.lock(jf.job_id):
        _not_busy(r, jf)
        await regenerate_item(s, jf, item_id, body.request if body else None)
    return _package(jf, s)


@router.post("/own-image", response_model=Package, summary="직접 올린 사진을 커버 후보로 (cover-own)",
             description="jpg·png, 800px 이상, 20MB 이하. 정사각으로 가운데를 잘라 쓴다. 올린 뒤 cover/select로 cover-own을 고르면 렌더링.")
async def own_image(file: UploadFile = File(), jf: JobFiles = Depends(job_files), r: JobRunner = Depends(runner),
                    s: Settings = Depends(settings)) -> Package:
    data = await file.read(MAX_OWN_IMAGE_MB * 1024 * 1024 + 1)  # 한도+1바이트까지만 메모리로 — 넘으면 save_own_image가 거절
    async with r.lock(jf.job_id):
        _not_busy(r, jf)
        save_own_image(jf, data)
    return _package(jf, s)


@router.get("/zip", summary="ZIP 다운로드 (done 이후)", response_class=FileResponse,
            description="패키지의 zip_url을 그대로 쓴다 (서명 토큰 t 포함, 24시간 유효). 토큰 없이 부르면 X-Band-Code로 확인.")
def download_zip(job_id: str, request: Request, t: str | None = Query(default=None),
                 x_band_code: str | None = Header(default=None), s: Settings = Depends(settings)) -> FileResponse:
    jf = find_job(job_id)
    if t is not None:
        if read_token(s.download_token_secret, t) != (jf.job_id, ZIP_TOKEN_PATH):
            raise AppError("LINK_EXPIRED", "다운로드 링크가 만료되었어요. 결과 화면을 새로고침해 주세요.", False, http_status=403)
    else:
        check_owner(jf, request, x_band_code)
    pkg = _package(jf, s)
    path = build_zip(jf, pkg, pkg.ai_generated.models)
    song = jf.read_json(jf.song)
    name = f"{song.get('artist', '')} - {song.get('title', '')}".strip(" -") or jf.job_id
    return FileResponse(path, media_type="application/zip", filename=f"{name}.zip")
