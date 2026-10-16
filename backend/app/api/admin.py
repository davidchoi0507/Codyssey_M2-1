"""운영자 페이지 (10/16): 체험 기록·마지막 설문을 브라우저로 보고 CSV·JSON으로 내려받는다.

페이지(/admin)는 누구나 열 수 있지만 데이터는 X-Admin-Key 헤더가 서버 .env 의 ADMIN_KEY 와 같을 때만 준다.
ADMIN_KEY 가 비어 있으면 데이터 API는 404 (기능 꺼짐). 틀린 키는 IP당 10분에 10번까지만.
"""
import hmac
import json
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import FileResponse, Response

from app.api.deps import settings
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline.limits import client_ip
from app.pipeline.usage_report import experiences, summarize, csv_text

router = APIRouter(prefix="/admin", include_in_schema=False)
PAGE = Path(__file__).parent.parent / "admin" / "index.html"

_WRONG_LIMIT, _WRONG_WINDOW = 10, 600
_wrong: dict[str, deque] = defaultdict(deque)


def require_admin(request: Request, x_admin_key: str | None = Header(default=None),
                  s: Settings = Depends(settings)) -> None:
    if not s.admin_key:
        raise AppError("NOT_FOUND", "운영자 페이지가 꺼져 있어요 (서버 .env ADMIN_KEY).", False, http_status=404)
    ip, now = client_ip(request), time.monotonic()
    tries = _wrong[ip]
    while tries and now - tries[0] > _WRONG_WINDOW:
        tries.popleft()
    if len(tries) >= _WRONG_LIMIT:
        raise AppError("TOO_MANY_TRIES", "키를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.", True, http_status=429)
    if not hmac.compare_digest((x_admin_key or "").encode(), s.admin_key.encode()):
        tries.append(now)
        raise AppError("ADMIN_KEY_INVALID", "운영자 키가 맞지 않아요.", False, http_status=401)


def _since(since: str | None) -> str:
    if not since:
        return "2000-01-01"
    try:
        return date.fromisoformat(since).isoformat()
    except ValueError:
        raise AppError("INVALID_REQUEST", "날짜는 YYYY-MM-DD 형식으로 넣어 주세요.", False, http_status=422)


def _filename(ext: str, since: str) -> str:
    tail = f"_since_{since}" if since != "2000-01-01" else ""
    return f"balmaero_usage_{date.today().isoformat()}{tail}.{ext}"


@router.get("")
def page() -> FileResponse:
    return FileResponse(PAGE, headers={"Cache-Control": "no-cache"})


@router.get("/usage", dependencies=[Depends(require_admin)])
def usage_data(since: str | None = Query(default=None)) -> dict:
    rows = experiences(_since(since))
    return {"summary": summarize(rows), "rows": rows}


@router.get("/usage.csv", dependencies=[Depends(require_admin)])
def usage_csv(since: str | None = Query(default=None)) -> Response:
    sn = _since(since)
    return Response(csv_text(experiences(sn)), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{_filename("csv", sn)}"',
                             "Cache-Control": "no-store"})


@router.get("/usage.json", dependencies=[Depends(require_admin)])
def usage_json(since: str | None = Query(default=None)) -> Response:
    sn = _since(since)
    rows = experiences(sn)
    body = json.dumps({"since": sn, "summary": summarize(rows), "rows": rows}, ensure_ascii=False, indent=2)
    return Response(body, media_type="application/json; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{_filename("json", sn)}"',
                             "Cache-Control": "no-store"})
