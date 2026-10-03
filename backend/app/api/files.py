"""파일 다운로드: GET /files/{token} — 만료 토큰으로 작업 폴더 안의 파일만 내려준다."""
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import settings
from app.core.config import Settings
from app.core.errors import AppError
from app.core.tokens import read_token

router = APIRouter(tags=["파일"])


@router.get("/files/{token}", summary="결과 파일 내려받기 (링크는 패키지 목록에서 발급, 기본 24시간 유효)")
def get_file(token: str, s: Settings = Depends(settings)) -> FileResponse:
    job_id, rel = read_token(s.download_token_secret, token)
    root = (s.jobs_dir / job_id).resolve()
    path = (root / rel).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise AppError("FILE_NOT_FOUND", "파일을 찾을 수 없어요. 7일이 지나 삭제되었을 수 있어요.", False, http_status=404)
    return FileResponse(path, filename=path.name)
