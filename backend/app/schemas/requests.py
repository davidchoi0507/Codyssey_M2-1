"""API 요청 본문 형식 (API_CONTRACT.md)."""
from pydantic import BaseModel, Field

from app.schemas.note import CoverDirection


class JobInfoPatch(BaseModel):
    """기다리는 동안 추가 입력 (PATCH /jobs/{job_id}/info). 모든 필드 선택."""
    lyrics: str | None = None
    description: str | None = None
    genre: str | None = None
    channels: list[str] | None = Field(default=None, description="홍보할 채널 (instagram, tiktok, threads, x)")
    release_date: str | None = Field(default=None, description="발매일 YYYY-MM-DD")


class NotePatch(BaseModel):
    """A&R 노트 수정 (PATCH /jobs/{job_id}/note). correction이 있으면 해석을 다시 쓴다."""
    correction: str | None = Field(default=None, description="한 줄 수정 요청, 예: '터지는 게 아니라 체념이야'")
    mood_keywords: list[str] | None = None
    colors: list[str] | None = None
    cover_directions: list[CoverDirection] | None = None
    highlight_start: float | None = Field(default=None, description="하이라이트 시작(초). 길이는 15초 고정")


class AcceptRequest(BaseModel):
    version: int | None = Field(default=None, description="수락할 노트 버전. 없으면 최신")


class CoverSelect(BaseModel):
    item_id: str = Field(description="cover-1 ~ cover-3")
    v: int | None = Field(default=None, description="버전. 없으면 최신")


class RegenerateRequest(BaseModel):
    request: str | None = Field(default=None, description="요청 한 줄, 예: '더 어둡게, 사람 없이'")
