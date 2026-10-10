"""커뮤니티: 곡 공개(작업에서) / 목록·듣기 / 반응 남기기 / 올린 사람 관리 (DECISIONS #31).

공개 API는 로그인 없이 누구나. 올린 사람만 할 수 있는 것(비공개 의견 보기, 설정 변경, 내리기)은 헤더 X-Owner-Key.
"""
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Literal

import tempfile

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.auth import link_track
from app.api.deps import current_user, job_files, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline import community as c
from app.pipeline import moderation, reports
from app.pipeline.jobfiles import JobFiles
from app.pipeline.bands import job_band
from app.pipeline.limits import client_ip
from app.schemas.community import (MAX_INTRO, CommunityMeta, Feedback, FeedbackRequest, FeedbackStats, FormToken,
                                   OwnerView, PublishRequest, ReportRequest, ReportResult, Track, TrackDetail, TrackList,
                                   TrackPatch)
from app.schemas.requests import MAX_GENRE, MAX_TITLE

router = APIRouter(tags=["커뮤니티"])
_TRACK_ID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")
PAGES = Path(__file__).resolve().parent.parent / "community"


def _enabled(s: Settings = Depends(settings)) -> Settings:
    if not s.community_enabled:
        raise AppError("COMMUNITY_DISABLED", "커뮤니티가 잠시 닫혀 있어요.", False, http_status=404)
    return s


def _track_id(track_id: str) -> str:
    if not _TRACK_ID.match(track_id):
        raise AppError("TRACK_NOT_FOUND", "곡을 찾을 수 없어요. 올린 사람이 내렸을 수 있어요.", False, http_status=404)
    return track_id


def _track(t: dict, *, owner: bool = False) -> dict:
    tid = t["track_id"]
    st = c.stats(tid)
    return dict(track_id=tid, title=t["title"], artist=t["artist"], genre=t["genre"], intro=t["intro"],
                listen_mode=t["listen_mode"], clip_sec=t["clip_sec"], comments_public=bool(t["comments_public"]),
                colors=json.loads(t["colors"]), moods=json.loads(t["moods"]),
                cover_url=f"/community/tracks/{tid}/cover?v={t['updated_at']}",
                audio_url=f"/community/tracks/{tid}/audio?v={t['updated_at']}",
                plays=t["plays"], reactions=st["reactions"], ai_usage=t.get("ai_usage") or "none",
                stats=FeedbackStats(**st) if (owner or t["comments_public"]) else None,
                created_at=datetime.fromisoformat(t["created_at"]))


def _feedback(rows: list[dict]) -> list[Feedback]:
    return [Feedback(id=r["id"], created_at=datetime.fromisoformat(r["ts"]), nickname=r["nickname"] or "익명",
                     rating=r["rating"], tags=r["tags"], comment=r["comment"], hidden=bool(r["hidden"]))
            for r in rows]


def _owner_view(s: Settings, t: dict) -> OwnerView:
    key = c.owner_key(s, t["track_id"])
    return OwnerView(**_track(t, owner=True), status=t["status"], job_id=t["job_id"],
                     feedback=_feedback(c.feedback_rows(t["track_id"], include_hidden=True)), owner_key=key,
                     manage_url=f"/community/manage?t={t['track_id']}#key={key}")


def _owned(track_id: str, x_owner_key: str | None, s: Settings) -> dict:
    t = c.get_track(_track_id(track_id), include_hidden=True)
    c.check_owner_key(s, track_id, x_owner_key)
    return t


OwnerKey = Header(default=None, description="곡을 올릴 때 받은 관리 키 (owner_key)")


# ---- 올리기 (작업에서) ----

@router.post("/jobs/{job_id}/community", response_model=OwnerView, summary="곡을 커뮤니티에 올리기 (이미 올렸으면 설정 변경)",
             description="A&R 노트가 나온 뒤부터 가능(하이라이트 구간이 노트에서 정해짐). 커버는 고른 커버 → 첫 AI 커버 → 노트 색 "
                         "그라데이션 순. 전곡 mp3 변환에 몇 초 걸림. 응답의 owner_key·manage_url을 올린 사람에게 꼭 보여 주기.")
def publish(body: PublishRequest, request: Request, jf: JobFiles = Depends(job_files),
            s: Settings = Depends(_enabled)) -> OwnerView:
    if not (body.consent_rights and body.consent_public):
        raise AppError("CONSENT_REQUIRED", "공개하려면 필수 동의 두 가지에 모두 체크해 주세요.", False, http_status=422)
    user = current_user(request)
    t = c.publish(s, jf, listen_mode=body.listen_mode, comments_public=body.comments_public, intro=body.intro,
                  client=client_ip(request), band_code=job_band(jf.job_id), user_id=user["user_id"] if user else None,
                  ai_usage=body.ai_usage, confirm_original=body.confirm_original)
    link_track(t["track_id"], user)
    return _owner_view(s, t)


@router.post("/community/tracks", response_model=OwnerView, status_code=201,
             summary="(10/10 추가) AI 분석 없이 곡만 바로 공개 — 반응만 궁금한 사람",
             description="음원(mp3·wav, 15초~10분)과 제목·아티스트만으로 공개. 하이라이트는 clip_start(초)를 주거나 비우면 "
                         "에너지가 가장 큰 15초. 커버는 선택(jpg·png) — 없으면 색 그라데이션. 원본은 남기지 않는다. "
                         "form_token·website는 반응 남기기와 같은 매크로 방지. 로그인했으면 '내 곡'에 들어간다.")
async def publish_direct(
    request: Request,
    file: UploadFile = File(description="음원 mp3·wav"),
    cover: UploadFile | None = File(default=None, description="커버 jpg·png (선택, 10MB 이하)"),
    title: str = Form(max_length=MAX_TITLE), artist: str = Form(max_length=MAX_TITLE),
    genre: str = Form("", max_length=MAX_GENRE), intro: str = Form("", max_length=MAX_INTRO),
    listen_mode: Literal["full", "highlight"] = Form("highlight"),
    clip_start: float | None = Form(None, ge=0), comments_public: bool = Form(True),
    consent_rights: bool = Form(description="자작곡이거나 공개할 권리가 있음 — 필수"),
    consent_public: bool = Form(description="커뮤니티 공개·직접 내릴 때까지 보관·반응 수집 — 필수"),
    form_token: str | None = Form(None, max_length=100), website: str | None = Form(None, max_length=200),
    ai_usage: Literal["none", "tool", "generated"] = Form("none", description="음원에 AI를 썼는지 — generated면 'AI 활용' 표시"),
    confirm_original: bool = Form(False, description="409 KNOWN_SONG_MATCH 뒤 '직접 만든 곡이 맞다'고 확인하고 다시 보낼 때 true"),
    s: Settings = Depends(_enabled),
) -> OwnerView:
    if not (consent_rights and consent_public):
        raise AppError("CONSENT_REQUIRED", "공개하려면 필수 동의 두 가지에 모두 체크해 주세요.", False, http_status=422)
    if not title.strip() or not artist.strip():
        raise AppError("INVALID_REQUEST", "곡 제목과 아티스트 이름을 넣어 주세요.", False, http_status=422)
    moderation.check_form(s, form_token, website)
    client = client_ip(request)
    user = current_user(request)
    limit = s.max_upload_mb * 1024 * 1024
    image = await cover.read(10 * 1024 * 1024 + 1) if cover is not None and cover.filename else None
    if image is not None and len(image) > 10 * 1024 * 1024:
        raise AppError("IMAGE_TOO_LARGE", "커버 이미지는 10MB 이하로 올려 주세요.", False, http_status=413)
    s.data_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=s.data_dir) as tmp:
        src = Path(tmp) / "upload"
        written = 0
        with src.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > limit:
                    raise AppError("UPLOAD_TOO_LARGE", f"{s.max_upload_mb}MB 이하 파일만 올릴 수 있어요.", False,
                                   http_status=413)
                out.write(chunk)
        t = c.publish_direct(s, src, filename=file.filename or "", title=title, artist=artist, genre=genre,
                             intro=intro, listen_mode=listen_mode, clip_start=clip_start,
                             comments_public=comments_public, client=client,
                             user_id=user["user_id"] if user else None, image=image, ai_usage=ai_usage,
                             confirm_original=confirm_original)
    return _owner_view(s, t)


@router.get("/jobs/{job_id}/community", response_model=OwnerView, summary="이 작업으로 올린 곡 (관리 키 다시 보기)")
def job_track(jf: JobFiles = Depends(job_files), s: Settings = Depends(_enabled)) -> OwnerView:
    t = c.track_for_job(jf.job_id)
    if t is None:
        raise AppError("NOT_PUBLISHED", "아직 커뮤니티에 올리지 않은 곡이에요.", False, http_status=404)
    return _owner_view(s, t)


# ---- 공개 (누구나) ----

@router.get("/community/meta", response_model=CommunityMeta, summary="반응 태그 목록·공개 방식 이름")
def meta(_: Settings = Depends(_enabled)) -> CommunityMeta:
    return CommunityMeta(tags=c.TAGS, listen_modes={"full": "전곡 공개", "highlight": "하이라이트만"},
                         consent_version=c.CONSENT_VERSION, report_reasons=reports.REASONS,
                         service_end_date=_.service_end_date)


@router.get("/community/form-token", response_model=FormToken, summary="(10/10 추가) 반응·바로 공개용 1회용 제출 토큰",
            description="입력칸을 열 때 받고, 보낼 때 form_token으로 같이 보낸다. 한 번 쓰면 끝 — 다음 제출 전에 다시 받는다.")
def form_token(s: Settings = Depends(_enabled)) -> FormToken:
    return FormToken(token=moderation.issue_form_token(s), min_sec=s.form_min_sec, ttl_sec=s.form_token_ttl_sec)


@router.get("/community/tracks", response_model=TrackList, summary="곡 목록 (최신·인기·랜덤, 장르·검색)")
def tracks(sort: Literal["new", "popular", "random"] = "new", genre: str | None = Query(None, max_length=50),
           q: str | None = Query(None, max_length=50), limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0),
           _: Settings = Depends(_enabled)) -> TrackList:
    rows, total = c.list_tracks(sort=sort, genre=genre, q=q, limit=limit, offset=offset)
    return TrackList(tracks=[Track(**_track(t)) for t in rows], total=total)


@router.get("/community/tracks/{track_id}", response_model=TrackDetail, summary="곡 하나 + 공개된 의견")
def track(track_id: str, _: Settings = Depends(_enabled)) -> TrackDetail:
    t = c.get_track(_track_id(track_id))
    fb = _feedback(c.feedback_rows(track_id)) if t["comments_public"] else []
    return TrackDetail(**_track(t), feedback=fb)


def _file(path: Path, media_type: str) -> FileResponse:
    if not path.is_file():
        raise AppError("FILE_NOT_FOUND", "파일을 찾을 수 없어요.", False, http_status=404)
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/community/tracks/{track_id}/audio", summary="공개 음원 mp3 (전곡 또는 하이라이트, Range 지원)")
def audio(track_id: str, s: Settings = Depends(_enabled)) -> FileResponse:
    c.get_track(_track_id(track_id))
    return _file(c.audio_path(s, track_id), "audio/mpeg")


@router.get("/community/tracks/{track_id}/cover", summary="커버 800px JPEG")
def cover(track_id: str, s: Settings = Depends(_enabled)) -> FileResponse:
    c.get_track(_track_id(track_id))
    return _file(c.cover_path(s, track_id), "image/jpeg")


@router.post("/community/tracks/{track_id}/play", response_model=dict, summary="재생 수 +1 (같은 접속은 하루 한 번)",
             description="재생 버튼을 누를 때 한 번 호출. 응답 {plays}")
def play(track_id: str, request: Request, _: Settings = Depends(_enabled)) -> dict:
    return {"plays": c.count_play(_track_id(track_id), client_ip(request))}


@router.post("/community/tracks/{track_id}/feedback", response_model=Feedback, summary="반응 남기기 (별점·태그·의견)",
             description="로그인 없음. 같은 접속은 한 곡에 하루 3번, 전체 하루 30번까지. comments_public=false인 곡이면 "
                         "올린 사람만 보고, 화면에는 '올린 사람에게만 전달돼요'라고 안내.")
def feedback(track_id: str, body: FeedbackRequest, request: Request, s: Settings = Depends(_enabled)) -> Feedback:
    r = c.add_feedback(s, _track_id(track_id), rating=body.rating, tags=body.tags, comment=body.comment,
                       nickname=body.nickname, client=client_ip(request), form_token=body.form_token,
                       honeypot=body.website)
    return _feedback([r])[0]


@router.post("/community/tracks/{track_id}/report", response_model=ReportResult, summary="(10/10 추가) 곡 신고",
             description="로그인 없음. 서로 다른 접속에서 3번이면 자동으로 숨기고 운영자에게 알린다. 같은 접속의 중복 신고는 한 번으로.")
def report_track(track_id: str, body: ReportRequest, request: Request, s: Settings = Depends(_enabled)) -> ReportResult:
    return ReportResult(**reports.report(s, _track_id(track_id), None, body.reason, body.detail, client_ip(request)))


@router.post("/community/tracks/{track_id}/feedback/{feedback_id}/report", response_model=ReportResult,
             summary="(10/10 추가) 반응(한마디) 신고")
def report_feedback(track_id: str, feedback_id: int, body: ReportRequest, request: Request,
                    s: Settings = Depends(_enabled)) -> ReportResult:
    return ReportResult(**reports.report(s, _track_id(track_id), feedback_id, body.reason, body.detail,
                                         client_ip(request)))


# ---- 올린 사람 (X-Owner-Key) ----

@router.get("/community/tracks/{track_id}/owner", response_model=OwnerView, summary="올린 사람 화면: 비공개 의견까지 전부")
def owner(track_id: str, x_owner_key: str | None = OwnerKey, s: Settings = Depends(_enabled)) -> OwnerView:
    return _owner_view(s, _owned(track_id, x_owner_key, s))


@router.patch("/community/tracks/{track_id}", response_model=OwnerView, summary="공개 방식·의견 공개·소개 바꾸기")
def patch(track_id: str, body: TrackPatch, x_owner_key: str | None = OwnerKey,
          s: Settings = Depends(_enabled)) -> OwnerView:
    _owned(track_id, x_owner_key, s)
    return _owner_view(s, c.update(s, track_id, **body.model_dump(exclude_none=True)))


@router.delete("/community/tracks/{track_id}", response_model=dict, summary="곡 내리기 (음원·커버·반응 모두 삭제)")
def delete(track_id: str, x_owner_key: str | None = OwnerKey, s: Settings = Depends(_enabled)) -> dict:
    _owned(track_id, x_owner_key, s)
    c.remove(s, track_id)
    return {"deleted": track_id}


class HideRequest(BaseModel):
    hidden: bool = True


@router.post("/community/tracks/{track_id}/feedback/{feedback_id}/hide", response_model=dict,
             summary="의견 숨기기/다시 보이기 (올린 사람)")
def hide(track_id: str, feedback_id: int, body: HideRequest, x_owner_key: str | None = OwnerKey,
         s: Settings = Depends(_enabled)) -> dict:
    _owned(track_id, x_owner_key, s)
    c.hide_feedback(track_id, feedback_id, body.hidden)
    return {"id": feedback_id, "hidden": body.hidden}


# ---- 임시 화면 (팀장 화면 전까지) ----

def _page(name: str) -> FileResponse:
    return FileResponse(PAGES / name, headers={"Cache-Control": "no-cache"})


@router.get("/community", include_in_schema=False)
def page_feed(_: Settings = Depends(_enabled)) -> FileResponse:
    """10/10부터 전체 흐름 시안(/studio)의 커뮤니티 화면으로 (예전 /community#곡ID 주소도 그대로 열림)."""
    return FileResponse(PAGES.parent / "studio" / "index.html", headers={"Cache-Control": "no-cache"})


@router.get("/community/manage", include_in_schema=False)
def page_manage(_: Settings = Depends(_enabled)) -> FileResponse:
    return _page("manage.html")
