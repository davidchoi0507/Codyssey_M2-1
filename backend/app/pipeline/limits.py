"""하루 생성 한도 (비용 관리, PROJECT_BRIEF): 밴드(초대 코드)별 → 없으면 접속 IP별, 그리고 전체 DAILY_JOBS_GLOBAL곡.

하루 기준은 한국 시간 자정. 업로드 파일을 받기 전에 확인한다.
"""
from datetime import datetime, timedelta, timezone

from fastapi import Request

from app import db
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline import bands

KST = timezone(timedelta(hours=9))


def client_ip(request: Request) -> str:
    """Caddy 뒤에서는 X-Forwarded-For의 첫 번째가 실제 접속 IP."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _today_start_utc() -> str:
    now = datetime.now(KST)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc).isoformat(timespec="seconds")


def check_daily_limits(settings: Settings, client: str, band: dict | None) -> None:
    """band: bands.find_band 결과 (코드 없이 올리면 None)."""
    if band is None and settings.band_code_required:
        raise AppError("BAND_CODE_REQUIRED", "초대 코드를 입력해 주세요. 테스트 참여 안내와 함께 받은 코드예요.", False,
                       http_status=401)
    since = _today_start_utc()
    with db.connect() as conn:
        total = conn.execute("SELECT count(*) FROM jobs WHERE created_at >= ?", (since,)).fetchone()[0]
        mine_ip = conn.execute("SELECT count(*) FROM jobs WHERE client = ? AND band_code IS NULL AND created_at >= ?",
                               (client, since)).fetchone()[0]
    if total >= settings.daily_jobs_global:
        raise AppError("DAILY_LIMIT_GLOBAL", "오늘 준비한 분석 수량이 모두 찼어요. 내일 다시 와 주세요.", False,
                       http_status=429)
    if band is not None:
        if bands.used_since(band["code"], since) >= band["daily_limit"]:
            raise AppError("DAILY_LIMIT", f"밴드당 하루 {band['daily_limit']}곡까지 올릴 수 있어요. 내일 다시 와 주세요.",
                           False, http_status=429)
    elif mine_ip >= settings.daily_jobs_per_client:
        raise AppError("DAILY_LIMIT", f"하루에 {settings.daily_jobs_per_client}곡까지 올릴 수 있어요. 내일 다시 와 주세요.",
                       False, http_status=429)


def band_usage(band: dict) -> dict:
    """GET /band 응답용: 오늘 쓴 곡 수와 남은 곡 수."""
    used = bands.used_since(band["code"], _today_start_utc())
    return {"name": band["name"], "code": bands.display(band["code"]), "daily_limit": band["daily_limit"],
            "used_today": used, "remaining_today": max(band["daily_limit"] - used, 0)}


def record_client(job_id: str, client: str, band: dict | None = None) -> None:
    with db.connect() as conn:
        conn.execute("UPDATE jobs SET client = ?, band_code = ? WHERE job_id = ?",
                     (client, band["code"] if band else None, job_id))
