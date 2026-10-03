"""결과 패키지 형식 (GET /jobs/{job_id}/package, API_CONTRACT.md). 10/7 이후 필드 추가만."""
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import AIGenerated

CHANNELS = ("instagram", "tiktok", "threads", "x")


class CoverVersion(BaseModel):
    v: int
    url: str
    url_3000: str | None = None
    url_title: str | None = None


class CoverItem(BaseModel):
    item_id: str
    direction_id: str
    versions: list[CoverVersion]
    selected: bool = False
    regenerate_remaining: int


class VideoItem(BaseModel):
    item_id: str
    kind: Literal["short", "canvas"]
    template: str | None = None
    url: str
    duration: float


class ChannelOut(BaseModel):
    item_id: str
    text: str
    hashtags: list[str] | None = None
    hook: str | None = None
    images: dict[str, str] | None = None


class PitchOut(BaseModel):
    item_id: str
    subject: str
    body: str


class Package(BaseModel):
    job_id: str
    stage: str
    covers: list[CoverItem] = []
    videos: list[VideoItem] = []
    channels: dict[str, ChannelOut] = {}
    pitch: dict[str, PitchOut] = {}
    zip_url: str | None = None
    ai_generated: AIGenerated


# ---- 에이전트 출력 (내부) ----

class CoverPrompt(BaseModel):
    direction_id: str = Field(description="커버 방향 id (c1~c3)")
    prompt: str = Field(description="이미지 생성 프롬프트 (영어)")


class VisualPlan(BaseModel):
    covers: list[CoverPrompt] = Field(description="커버 방향마다 하나씩, 정확히 3개")


class ChannelCopy(BaseModel):
    text: str = Field(description="게시글 본문")
    hashtags: list[str] = Field(default_factory=list, description="#을 포함한 해시태그")
    hook: str | None = Field(default=None, description="(틱톡만) 영상 위에 올릴 짧은 훅 문구")


class CopySet(BaseModel):
    instagram: ChannelCopy
    tiktok: ChannelCopy
    threads: ChannelCopy
    x: ChannelCopy
