"""밴드 초대 코드 확인: GET /band (헤더 X-Band-Code) — 첫 화면에서 코드를 넣으면 맞는지·오늘 남은 곡 수를 보여준다."""
from fastapi import APIRouter, Header

from app.core.errors import AppError
from app.pipeline.bands import find_band
from app.pipeline.limits import band_usage
from app.schemas.job import BandInfo

router = APIRouter(tags=["밴드"])


@router.get("/band", response_model=BandInfo, summary="초대 코드 확인 + 오늘 남은 업로드 수",
            description="헤더 X-Band-Code에 코드를 넣어 호출. 틀리거나 꺼진 코드면 401 INVALID_BAND_CODE. "
                        "확인된 코드는 브라우저에 저장해 두고 POST /jobs 때 같은 헤더로 보낸다.")
def band_info(x_band_code: str | None = Header(default=None)) -> BandInfo:
    band = find_band(x_band_code)
    if band is None:
        raise AppError("BAND_CODE_REQUIRED", "초대 코드를 입력해 주세요.", False, http_status=401)
    return BandInfo(**band_usage(band))
