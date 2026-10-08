"""라우터 공용: 설정, 실행기, 작업 폴더 찾기, 파일 링크 만들기."""
import re
from pathlib import Path

from fastapi import Header, Request

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.tokens import make_token
from app.pipeline.bands import check_attempts, job_band, normalize, record_fail
from app.pipeline.jobfiles import JobFiles
from app.pipeline.limits import client_ip
from app.pipeline.runner import JobRunner

ZIP_TOKEN_PATH = "package.zip"
_JOB_ID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")  # ULID


def settings() -> Settings:
    return get_settings()


def runner(request: Request) -> JobRunner:
    return request.app.state.runner


def find_job(job_id: str) -> JobFiles:
    """작업 폴더 찾기만 (권한 확인 없음 — 서명 링크처럼 따로 확인한 경우에만 쓴다)."""
    not_found = AppError("JOB_NOT_FOUND", "작업을 찾을 수 없어요. 7일이 지나 삭제되었을 수 있어요.", False,
                         http_status=404)
    if not _JOB_ID.match(job_id):
        raise not_found
    jf = JobFiles(get_settings().jobs_dir, job_id)
    if not jf.exists():
        raise not_found
    return jf


def check_owner(jf: JobFiles, request: Request, x_band_code: str | None) -> None:
    """밴드 코드로 올린 작업은 같은 코드가 있어야 열린다 (작업 ID가 새도 남이 못 보게).
    코드 없이 올린 작업(팀 QA·샘플)은 작업 ID만으로 열린다."""
    owner = job_band(jf.job_id)
    if owner is None:
        return
    client = client_ip(request)
    check_attempts(client)
    if normalize(x_band_code) != owner:
        record_fail(client)
        raise AppError("BAND_CODE_MISMATCH", "이 작업을 올린 밴드의 초대 코드가 필요해요. 첫 화면에서 코드를 확인해 주세요.",
                       False, http_status=403)


def job_files(job_id: str, request: Request,
              x_band_code: str | None = Header(default=None, description="작업을 올린 밴드의 초대 코드 (코드로 올린 작업이면 필수)"),
              ) -> JobFiles:
    jf = find_job(job_id)
    check_owner(jf, request, x_band_code)
    return jf


def zip_url(jf: JobFiles) -> str:
    """ZIP은 브라우저가 링크로 바로 받으므로 헤더 대신 서명 토큰을 붙인다 (파일 링크와 같은 유효 시간)."""
    s = get_settings()
    return f"/jobs/{jf.job_id}/zip?t={make_token(s.download_token_secret, jf.job_id, ZIP_TOKEN_PATH, s.download_token_ttl_sec)}"


def file_url(jf: JobFiles, path: Path) -> str:
    s = get_settings()
    token = make_token(s.download_token_secret, jf.job_id, path.relative_to(jf.root).as_posix(),
                       s.download_token_ttl_sec)
    return f"/files/{token}"
