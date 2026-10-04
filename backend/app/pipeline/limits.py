"""하루 생성 한도 (비용 관리, PROJECT_BRIEF): 접속 IP별 DAILY_JOBS_PER_CLIENT곡, 전체 DAILY_JOBS_GLOBAL곡.

하루 기준은 한국 시간 자정. 업로드 파일을 받기 전에 확인한다.
"""
from datetime import datetime, timedelta, timezone

from fastapi import Request

from app import db
from app.core.config import Settings
from app.core.errors import AppError

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


def check_daily_limits(settings: Settings, client: str) -> None:
    since = _today_start_utc()
    with db.connect() as conn:
        total = conn.execute("SELECT count(*) FROM jobs WHERE created_at >= ?", (since,)).fetchone()[0]
        mine = conn.execute("SELECT count(*) FROM jobs WHERE client = ? AND created_at >= ?",
                            (client, since)).fetchone()[0]
    if total >= settings.daily_jobs_global:
        raise AppError("DAILY_LIMIT_GLOBAL", "오늘 준비한 분석 수량이 모두 찼어요. 내일 다시 와 주세요.", False,
                       http_status=429)
    if mine >= settings.daily_jobs_per_client:
        raise AppError("DAILY_LIMIT", f"하루에 {settings.daily_jobs_per_client}곡까지 올릴 수 있어요. 내일 다시 와 주세요.",
                       False, http_status=429)


def record_client(job_id: str, client: str) -> None:
    with db.connect() as conn:
        conn.execute("UPDATE jobs SET client = ? WHERE job_id = ?", (client, job_id))
