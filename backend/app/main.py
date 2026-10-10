"""FastAPI 앱: 라우터 등록, CORS, 에러 형식 통일."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from app.api import auth, band, community, files, jobs, note, package, release
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

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",      # 올린 파일을 브라우저가 다른 형식(HTML 등)으로 추측하지 않게
    "X-Frame-Options": "DENY",                # 다른 사이트가 iframe으로 감싸지 못하게
    "Referrer-Policy": "no-referrer",         # 작업 ID·토큰이 든 주소가 외부 사이트로 새지 않게
    "Strict-Transport-Security": "max-age=31536000",  # https로만 (http 개발 서버에서는 브라우저가 무시)
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    return response


@app.exception_handler(AppError)
async def app_error(_: Request, e: AppError) -> JSONResponse:
    return JSONResponse(e.to_dict(), status_code=e.http_status)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError) -> JSONResponse:
    fields = sorted({".".join(str(x) for x in err["loc"][1:]) for err in e.errors()})
    too_long = {".".join(str(x) for x in err["loc"][1:]): err["ctx"]["max_length"]
                for err in e.errors() if err["type"] == "string_too_long"}
    shown = [f"{f}({too_long[f]}자 이내)" if f in too_long else f for f in fields]
    return JSONResponse({"code": "INVALID_REQUEST", "message": f"입력값을 확인해 주세요: {', '.join(shown)}",
                         "retryable": False, "fields": fields}, status_code=422)


@app.get("/health", tags=["공통"], summary="헬스체크")
def health() -> dict:
    return {"status": "ok"}


for r in (band.router, jobs.router, note.router, package.router, files.router, community.router, release.router,
          auth.router):
    app.include_router(r)

STUDIO = Path(__file__).parent / "studio"


@app.get("/studio", include_in_schema=False)
def studio() -> FileResponse:
    """전체 흐름 시안 화면 (10/10, 팀장 디자인 참고용). 발매 안내 → 곡 올리기 → … → 커뮤니티를 한 화면 앱으로."""
    return FileResponse(STUDIO / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/studio/{name}", include_in_schema=False)
def studio_asset(name: str) -> FileResponse:
    types = {"app.css": "text/css", "app.js": "text/javascript"}
    if name not in types:
        raise AppError("NOT_FOUND", "없는 주소예요.", False, http_status=404)
    return FileResponse(STUDIO / name, media_type=types[name], headers={"Cache-Control": "no-cache"})


@app.get("/privacy", include_in_schema=False)
def privacy() -> FileResponse:
    """개인정보처리방침 (구글·카카오 로그인 동의 화면에 거는 공개 주소)."""
    return FileResponse(STUDIO / "privacy.html", headers={"Cache-Control": "no-cache"})


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/studio")


if settings.playground_enabled:
    @app.get("/playground", include_in_schema=False)
    def playground() -> FileResponse:
        """백엔드 흐름 확인용 페이지 (실제 화면이 아님). PLAYGROUND_ENABLED=false로 끈다."""
        # no-cache: 배포 후 브라우저가 예전 페이지를 쓰지 않게 (10/8 옛 페이지가 밴드 코드를 안 보내 403)
        return FileResponse(Path(__file__).parent / "playground" / "index.html", headers={"Cache-Control": "no-cache"})
