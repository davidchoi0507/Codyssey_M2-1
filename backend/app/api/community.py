"""커뮤니티: 곡 공개(작업에서) / 목록·듣기 / 반응 남기기 / 올린 사람 관리 (DECISIONS #31).

공개 API는 로그인 없이 누구나. 올린 사람만 할 수 있는 것(비공개 의견 보기, 설정 변경, 내리기)은 헤더 X-Owner-Key.
"""
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.deps import job_files, settings
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline import community as c
from app.pipeline.jobfiles import JobFiles
from app.pipeline.bands import job_band
from app.pipeline.limits import client_ip
from app.schemas.community import (CommunityMeta, Feedback, FeedbackRequest, FeedbackStats, OwnerView,
                                   PublishRequest, Track, TrackDetail, TrackList, TrackPatch)

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
                plays=t["plays"], reactions=st["reactions"],
                stats=FeedbackStats(**st) if (owner or t["comments_public"]) else None,
                created_at=datetime.fromisoformat(t["created_at"]))


def _feedback(rows: list[dict]) -> list[Feedback]:
    return [Feedback(id=r["id"], created_at=datetime.fromisoformat(r["ts"]), nickname=r["nickname"] or "익명",
                     rating=r["rating"], tags=r["tags"], comment=r["comment"], hidden=bool(r["hidden"]))
            for r in rows]


def _owner_view(s: Settings, t: dict) -> OwnerView:
    key = c.owner_key(s, t["track_id"])
    return OwnerView(**_track(t, owner=True), job_id=t["job_id"],
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
    t = c.publish(s, jf, listen_mode=body.listen_mode, comments_public=body.comments_public, intro=body.intro,
                  client=client_ip(request), band_code=job_band(jf.job_id))
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
                         consent_version=c.CONSENT_VERSION)


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
                       nickname=body.nickname, client=client_ip(request))
    return _feedback([r])[0]


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
    return _page("index.html")


@router.get("/community/manage", include_in_schema=False)
def page_manage(_: Settings = Depends(_enabled)) -> FileResponse:
    return _page("manage.html")
