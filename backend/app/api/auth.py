"""로그인·내 곡: /auth/*, /me/* (DECISIONS #34). 곡 올리는 사람만 쓰는 선택 기능."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app import db
from app.api.deps import current_user, require_user, session_token, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import STAGE_LABELS, Stage
from app.pipeline import auth as a
from app.pipeline import community as c
from app.pipeline.jobfiles import JobFiles

router = APIRouter(tags=["로그인·내 곡"])
Provider = Literal["kakao", "google"]


class Providers(BaseModel):
    kakao: bool
    google: bool
    dev: bool = Field(description="로컬 확인용 가짜 로그인 (서버에서는 항상 false)")


class Me(BaseModel):
    user_id: str
    provider: str
    nickname: str
    created_at: datetime


class MyJob(BaseModel):
    job_id: str
    title: str
    artist: str
    stage: str
    stage_label: str
    created_at: datetime
    track_id: str | None = Field(default=None, description="커뮤니티에 올렸으면 곡 ID")


class MyTrack(BaseModel):
    track_id: str
    title: str
    artist: str
    status: str = Field(description="live 공개 중 · reported 신고로 숨겨짐(운영자 확인 중) · hidden 운영자가 내림")
    listen_mode: str
    plays: int
    reactions: int
    cover_url: str
    manage_url: str
    created_at: datetime


def _cookie_secure(s: Settings) -> bool:
    return s.public_base_url.startswith("https://")


def _finish(s: Settings, user: dict, next_url: str) -> RedirectResponse:
    token = a.new_session(s, user["user_id"])
    target = f"{next_url}#session={token}" if a.is_external(s, next_url) else next_url
    resp = RedirectResponse(target, status_code=303)
    resp.set_cookie(a.COOKIE, token, max_age=s.session_ttl_days * 86400, httponly=True, secure=_cookie_secure(s),
                    samesite="lax", path="/")
    resp.delete_cookie(a.STATE_COOKIE, path="/auth")
    return resp


@router.get("/auth/providers", response_model=Providers, summary="쓸 수 있는 로그인 (키가 등록된 것만 true)")
def providers(s: Settings = Depends(settings)) -> Providers:
    return Providers(**a.enabled(s))


@router.get("/auth/dev/login", include_in_schema=False)  # /auth/{provider}/login 보다 먼저 (dev가 provider로 잡히지 않게)
def dev_login(name: str = Query("테스트 음악가", max_length=20), next: str | None = None,
              s: Settings = Depends(settings)) -> RedirectResponse:
    if not s.auth_dev_login:
        raise AppError("NOT_FOUND", "없는 주소예요.", False, http_status=404)
    return _finish(s, a.upsert_user("dev", name, name), a.safe_next(s, next))


@router.get("/auth/{provider}/login", summary="카카오·구글 로그인 시작 (화면에서 이 주소로 이동)",
            description="next: 로그인 뒤 돌아갈 주소. 이 서버의 경로(/studio 등) 또는 CORS_ORIGINS·AUTH_REDIRECT_ORIGINS에 "
                        "있는 화면 주소만. 다른 주소의 화면이면 돌아갈 때 `#session=토큰`을 붙여 주고, 화면은 그 토큰을 "
                        "Authorization: Bearer 로 보낸다.")
def login(provider: Provider, next: str | None = Query(default=None, max_length=500),
          s: Settings = Depends(settings)) -> RedirectResponse:
    state, nonce = a.make_state(s, provider, a.safe_next(s, next))
    resp = RedirectResponse(a.authorize_url(s, provider, state), status_code=303)
    resp.set_cookie(a.STATE_COOKIE, nonce, max_age=a.STATE_TTL_SEC, httponly=True, secure=_cookie_secure(s),
                    samesite="lax", path="/auth")
    return resp


@router.get("/auth/{provider}/callback", include_in_schema=False)
def callback(provider: Provider, request: Request, code: str | None = None, state: str | None = None,
             error: str | None = None, s: Settings = Depends(settings)) -> RedirectResponse:
    if error or not code or not state:  # 사용자가 동의 화면에서 취소
        return RedirectResponse("/studio#/login?cancelled=1", status_code=303)
    next_url = a.read_state(s, state, provider, request.cookies.get(a.STATE_COOKIE))
    uid, nick = a.fetch_profile(s, provider, code)
    return _finish(s, a.upsert_user(provider, uid, nick), next_url)


@router.get("/auth/me", response_model=Me, summary="로그인한 사용자 (아니면 401)")
def me(user: dict = Depends(require_user)) -> Me:
    return Me(**{k: user[k] for k in ("user_id", "provider", "nickname", "created_at")})


@router.post("/auth/logout", response_model=dict, summary="로그아웃")
def logout(request: Request) -> dict:
    a.end_session(session_token(request))
    resp = JSONResponse({"logged_out": True})
    resp.delete_cookie(a.COOKIE, path="/")
    return resp


@router.delete("/auth/me", response_model=dict, summary="탈퇴 (로그인 정보 삭제 — 올린 곡은 관리 링크로 계속 관리)")
def withdraw(user: dict = Depends(require_user)) -> dict:
    a.delete_user(user["user_id"])
    resp = JSONResponse({"deleted": True})
    resp.delete_cookie(a.COOKIE, path="/")
    return resp


@router.get("/me/jobs", response_model=list[MyJob], summary="내가 올린 작업 (7일 안의 것만 — 지난 작업은 삭제됨)")
def my_jobs(user: dict = Depends(require_user), s: Settings = Depends(settings)) -> list[MyJob]:
    with db.connect() as conn:
        rows = conn.execute("SELECT j.job_id, j.stage, j.created_at, t.track_id FROM jobs j "
                            "LEFT JOIN tracks t ON t.job_id = j.job_id WHERE j.user_id = ? ORDER BY j.created_at DESC",
                            (user["user_id"],)).fetchall()
    out = []
    for r in rows:
        jf = JobFiles(s.jobs_dir, r["job_id"])
        if not jf.exists():
            continue
        song = jf.read_json(jf.song)
        out.append(MyJob(job_id=r["job_id"], title=song.get("title", ""), artist=song.get("artist", ""),
                         stage=r["stage"], stage_label=STAGE_LABELS.get(Stage(r["stage"]), r["stage"]),
                         created_at=datetime.fromisoformat(r["created_at"]), track_id=r["track_id"]))
    return out


@router.get("/me/tracks", response_model=list[MyTrack], summary="내가 커뮤니티에 올린 곡 (관리 링크 포함)")
def my_tracks(user: dict = Depends(require_user), s: Settings = Depends(settings)) -> list[MyTrack]:
    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM tracks WHERE user_id = ? ORDER BY created_at DESC",
                                              (user["user_id"],))]
    return [MyTrack(track_id=t["track_id"], title=t["title"], artist=t["artist"], status=t["status"],
                    listen_mode=t["listen_mode"], plays=t["plays"], reactions=c.stats(t["track_id"])["reactions"],
                    cover_url=f"/community/tracks/{t['track_id']}/cover?v={t['updated_at']}",
                    manage_url=f"/community/manage?t={t['track_id']}#key={c.owner_key(s, t['track_id'])}",
                    created_at=datetime.fromisoformat(t["created_at"])) for t in rows]


def link_job(job_id: str, user: dict | None) -> None:
    if user:
        with db.connect() as conn:
            conn.execute("UPDATE jobs SET user_id = ? WHERE job_id = ?", (user["user_id"], job_id))


def link_track(track_id: str, user: dict | None) -> None:
    if user:
        with db.connect() as conn:
            conn.execute("UPDATE tracks SET user_id = ? WHERE track_id = ? AND user_id IS NULL",
                         (user["user_id"], track_id))
