"""라우터 공용: 설정, 실행기, 작업 폴더 찾기, 파일 링크 만들기."""
import re
from pathlib import Path

from fastapi import Request

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.tokens import make_token
from app.pipeline.jobfiles import JobFiles
from app.pipeline.runner import JobRunner

_JOB_ID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")  # ULID


def settings() -> Settings:
    return get_settings()


def runner(request: Request) -> JobRunner:
    return request.app.state.runner


def job_files(job_id: str) -> JobFiles:
    not_found = AppError("JOB_NOT_FOUND", "작업을 찾을 수 없어요. 7일이 지나 삭제되었을 수 있어요.", False,
                         http_status=404)
    if not _JOB_ID.match(job_id):
        raise not_found
    jf = JobFiles(get_settings().jobs_dir, job_id)
    if not (jf.root / "status.json").exists():
        raise not_found
    return jf


def file_url(jf: JobFiles, path: Path) -> str:
    s = get_settings()
    token = make_token(s.download_token_secret, jf.job_id, path.relative_to(jf.root).as_posix(),
                       s.download_token_ttl_sec)
    return f"/files/{token}"
