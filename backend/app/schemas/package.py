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
    request: str | None = Field(default=None, description="이 버전을 다시 만들 때 밴드가 쓴 요청 한 줄 (첫 버전·요청 없이 재생성은 null)")


class CoverItem(BaseModel):
    item_id: str = Field(description="cover-1~3 (AI), cover-own (직접 올린 사진)")
    direction_id: str = Field(description="노트 커버 방향 id (c1~c3), 직접 올린 사진은 own")
    versions: list[CoverVersion]
    selected: bool = False
    selected_v: int | None = Field(default=None, description="선택한 버전 (selected일 때)")
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
    images: dict[str, str] | None = Field(default=None, description="비율 → 이미지 링크 (커버 선택 후 렌더링되면 생김)")
    video: str | None = Field(default=None, description="(tiktok·instagram) 이 채널에 올릴 숏폼 영상 링크 = videos의 short (릴스·틱톡)")
    v: int = 1
    regenerate_remaining: int | None = None
    request: str | None = Field(default=None, description="최신 버전(v)을 다시 만들 때 밴드가 쓴 요청 한 줄 (첫 버전·요청 없이 재생성은 null)")


class PitchOut(BaseModel):
    item_id: str
    subject: str
    body: str
    v: int = 1
    regenerate_remaining: int | None = None
    request: str | None = Field(default=None, description="최신 버전(v)을 다시 만들 때 밴드가 쓴 요청 한 줄 (첫 버전·요청 없이 재생성은 null)")


class Package(BaseModel):
    job_id: str
    stage: str
    covers: list[CoverItem] = []
    videos: list[VideoItem] = []
    channels: dict[str, ChannelOut] = {}
    pitch: dict[str, PitchOut] = {}
    zip_url: str | None = None
    zip_files: list[str] | None = Field(default=None, description="ZIP에 들어갈 파일 (done일 때)")
    zip_size_bytes: int | None = Field(default=None, description="ZIP 대략 용량 (done일 때, 압축 전 합계)")
    ai_generated: AIGenerated


# ---- 에이전트 출력 (내부) ----

class CoverPrompt(BaseModel):
    direction_id: str = Field(description="커버 방향 id (c1~c3)")
    recipe: str | None = Field(default=None, description="고른 레시피 이름 (예: film_snapshot)")
    prompt: str = Field(description="이미지 생성 프롬프트 (영어)")
    finish: Literal["film", "print", "clean"] = Field(default="film", description="후처리: film | print | clean")
    title_layout: Literal["bottom", "top_left", "bottom_left"] = Field(
        default="bottom", description="발매용 커버에서 제목 자리: bottom | top_left | bottom_left")


class VisualPlan(BaseModel):
    covers: list[CoverPrompt] = Field(description="커버 방향마다 하나씩, 정확히 3개")


class ChannelCopy(BaseModel):
    text: str = Field(description="게시글 본문")
    hashtags: list[str] = Field(default_factory=list, description="#을 포함한 해시태그")
    hook: str | None = Field(default=None, description="(틱톡만) 영상 위에 올릴 짧은 훅 문구")


class PitchMail(BaseModel):
    subject: str = Field(description="메일 제목")
    body: str = Field(description="메일 본문 (줄바꿈 포함, 자리표시 그대로)")


class PitchSet(BaseModel):
    en: PitchMail = Field(description="영어 메일 (해외 큐레이터용)")
    ko: PitchMail = Field(description="한국어 메일 (국내 큐레이터·블로그·라디오용)")


class CopySet(BaseModel):
    instagram: ChannelCopy
    tiktok: ChannelCopy
    threads: ChannelCopy
    x: ChannelCopy
