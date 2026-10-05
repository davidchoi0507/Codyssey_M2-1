"""밴드 초대 코드 확인: GET /band (헤더 X-Band-Code) — 첫 화면에서 코드를 넣으면 맞는지·오늘 남은 곡 수를 보여준다.
GET /band/jobs — 같은 코드로 그 밴드의 작업 목록 (작업 ID를 몰라도 이어서 열기)."""
from datetime import datetime

from fastapi import APIRouter, Header

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.stages import STAGE_LABELS, Stage
from app.pipeline.bands import find_band, job_rows
from app.pipeline.jobfiles import JobFiles
from app.pipeline.limits import band_usage
from app.pipeline.views import expires_at
from app.schemas.job import BandInfo, BandJob, BandJobs

router = APIRouter(tags=["밴드"])


def _band(code: str | None) -> dict:
    band = find_band(code)
    if band is None:
        raise AppError("BAND_CODE_REQUIRED", "초대 코드를 입력해 주세요.", False, http_status=401)
    return band


@router.get("/band", response_model=BandInfo, summary="초대 코드 확인 + 오늘 남은 업로드 수",
            description="헤더 X-Band-Code에 코드를 넣어 호출. 틀리거나 꺼진 코드면 401 INVALID_BAND_CODE. "
                        "확인된 코드는 브라우저에 저장해 두고 POST /jobs 때 같은 헤더로 보낸다.")
def band_info(x_band_code: str | None = Header(default=None)) -> BandInfo:
    return BandInfo(**band_usage(_band(x_band_code)))


@router.get("/band/jobs", response_model=BandJobs, summary="밴드의 작업 목록 (코드로 이어서 열기)",
            description="헤더 X-Band-Code. 이 코드로 올린 작업을 최근 것부터 돌려준다 (7일 지나 삭제된 작업은 없음). "
                        "코드 없이 올린 작업은 여기 안 나온다 — 화면에서 만든 작업 ID를 브라우저에도 저장해 두기.")
def band_jobs(x_band_code: str | None = Header(default=None)) -> BandJobs:
    band = _band(x_band_code)
    jobs_dir = get_settings().jobs_dir
    jobs = []
    for r in job_rows(band["code"]):
        jf = JobFiles(jobs_dir, r["job_id"])
        song = jf.read_json(jf.song) if jf.song.exists() else {}
        jobs.append(BandJob(job_id=r["job_id"], title=song.get("title", ""), artist=song.get("artist", ""),
                            stage=r["stage"], stage_label=STAGE_LABELS[Stage(r["stage"])],
                            created_at=datetime.fromisoformat(r["created_at"]),
                            expires_at=expires_at(r["job_id"], r["created_at"])))
    return BandJobs(band=BandInfo(**band_usage(band)), jobs=jobs)
