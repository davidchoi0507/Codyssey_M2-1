"""FastAPI 앱: 라우터 등록, CORS, 에러 형식 통일."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.api import files, jobs, note, package
from app.db import import_legacy_files
from app.core.config import get_settings
from app.core.errors import AppError
from app.pipeline.runner import JobRunner

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
settings = get_settings()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.download_token_secret:
        raise RuntimeError("DOWNLOAD_TOKEN_SECRET이 비어 있어요 (.env)")
    settings.jobs_dir.mkdir(parents=True, exist_ok=True)
    if n := import_legacy_files(settings.jobs_dir):
        log.info("작업 폴더 기록 %d건을 DB로 옮김", n)
    app.state.runner = JobRunner(settings)
    if recovered := app.state.runner.recover():
        log.info("끝나지 않은 작업 %d건 다시 시작: %s", len(recovered), ", ".join(recovered))
    yield
    app.state.runner.shutdown()


app = FastAPI(
    title="인디 앨범 스튜디오 API",
    description="곡 하나로 발매 캠페인까지 — AI A&R 노트, 커버, 숏폼, 채널 홍보 세트.\n\n"
                "**초안**: 10/7 이후로는 필드를 추가만 하고 이름 변경·삭제는 하지 않습니다. "
                "'예정'이 붙은 엔드포인트는 형식만 확정이고 지금은 501을 돌려줍니다.\n\n"
                "에러는 항상 `{code, message, retryable}` 형식이고 message는 화면에 그대로 보여도 되는 한국어입니다.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["*"],
                   allow_headers=["*"])


@app.exception_handler(AppError)
async def app_error(_: Request, e: AppError) -> JSONResponse:
    return JSONResponse(e.to_dict(), status_code=e.http_status)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError) -> JSONResponse:
    fields = sorted({".".join(str(x) for x in err["loc"][1:]) for err in e.errors()})
    return JSONResponse({"code": "INVALID_REQUEST", "message": f"입력값을 확인해 주세요: {', '.join(fields)}",
                         "retryable": False, "fields": fields}, status_code=422)


@app.get("/health", tags=["공통"], summary="헬스체크")
def health() -> dict:
    return {"status": "ok"}


for r in (jobs.router, note.router, package.router, files.router):
    app.include_router(r)

if settings.playground_enabled:
    @app.get("/playground", include_in_schema=False)
    def playground() -> FileResponse:
        """백엔드 흐름 확인용 페이지 (실제 화면이 아님). PLAYGROUND_ENABLED=false로 끈다."""
        return FileResponse(Path(__file__).parent / "playground" / "index.html")
