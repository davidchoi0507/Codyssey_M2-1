"""결과 화면: 패키지 목록 / 커버 선택 / 항목 재생성 / 직접 올린 사진 / ZIP"""
from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import file_url, job_files, settings
from app.core.config import Settings
from app.core.errors import not_ready
from app.pipeline.jobfiles import JobFiles
from app.pipeline.views import build_package
from app.schemas.package import Package
from app.schemas.requests import CoverSelect, RegenerateRequest

router = APIRouter(prefix="/jobs/{job_id}", tags=["결과"])


@router.get("/package", response_model=Package, summary="결과 패키지 목록 (커버·영상·채널 글·피칭)")
def get_package(jf: JobFiles = Depends(job_files), s: Settings = Depends(settings)) -> Package:
    return build_package(jf, s, lambda p: file_url(jf, p))


@router.post("/cover/select", response_model=Package, summary="커버 선택 → 숏폼·채널 이미지 렌더링 — 10/7 예정")
def select_cover(body: CoverSelect, jf: JobFiles = Depends(job_files)) -> Package:
    raise not_ready("10/7")


@router.post("/items/{item_id}/regenerate", response_model=Package, summary="항목 하나 재생성 — 10/10 예정")
def regenerate(item_id: str, body: RegenerateRequest, jf: JobFiles = Depends(job_files)) -> Package:
    raise not_ready("10/10")


@router.post("/own-image", response_model=Package, summary="직접 올린 사진으로 만들기 — 10/10 예정")
def own_image(file: UploadFile = File(), jf: JobFiles = Depends(job_files)) -> Package:
    raise not_ready("10/10")


@router.get("/zip", summary="ZIP 다운로드 — 10/7 예정")
def download_zip(jf: JobFiles = Depends(job_files)):
    raise not_ready("10/7")
