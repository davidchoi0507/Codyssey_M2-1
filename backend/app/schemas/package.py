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


class EditorialOut(BaseModel):
    item_id: str = "editorial"
    spotify_ko: str = Field(description="Spotify for Artists 에디토리얼 피칭 곡 설명 (한국어, 500자 이내)")
    spotify_en: str = Field(description="같은 내용 영어판 (500자 이내)")
    dsp_intro_ko: str = Field(description="국내 음원 사이트 앨범 소개글 — [작사/작곡/편곡: ] 자리표시는 직접 채움")
    tags: dict[str, list[str]] = Field(description="Spotify 피칭 화면에서 고를 항목 추천: genres·moods·instruments (영어)")
    v: int = 1
    regenerate_remaining: int | None = None
    request: str | None = None


class ReleaseStep(BaseModel):
    d: int = Field(description="발매일 기준 일수 (-28 = 4주 전, 0 = 발매일)")
    label: str = Field(description="D-28 / D-day / D+7")
    date: str | None = Field(default=None, description="실제 날짜 YYYY-MM-DD (발매일이 있을 때)")
    title: str
    detail: str
    items: list[str] = Field(default_factory=list, description="이 단계에서 쓰는 결과물 item_id (editorial, short, copy-x 등)")
    status: Literal["past", "today", "upcoming"] | None = Field(default=None, description="발매일이 있을 때 오늘 기준")


class ReleasePlan(BaseModel):
    release_date: str | None = None
    today: str
    steps: list[ReleaseStep]
    warnings: list[str] = Field(default_factory=list)


class CheckItem(BaseModel):
    group: Literal["meta", "audio", "cover", "rights", "extra", "dist"] = Field(
        description="meta 곡 정보 · audio 음원 · cover 커버 · rights 권리 · extra 유통과 별개 · dist 유통사별 (10/10 추가)")
    id: str
    label: str
    status: Literal["ok", "warn", "fail", "todo"] = Field(description="ok 통과 · warn 확인 필요 · fail 고쳐야 함 · todo 직접 확인")
    detail: str


class SubmissionCheck(BaseModel):
    items: list[CheckItem]
    counts: dict[str, int]
    notice: str


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
    editorial: EditorialOut | None = Field(default=None, description="(10/9 추가) 에디토리얼 피칭 — 예전 작업은 null, "
                                                                    "regenerate item_id=editorial로 만들 수 있음")
    release_plan: ReleasePlan | None = Field(default=None, description="(10/9 추가) 발매 캘린더 — 발매일(PATCH /info)로 계산")
    submission_check: SubmissionCheck | None = Field(default=None, description="(10/9 추가) 유통사 제출 전 검수")


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


class EditorialTags(BaseModel):
    genres: list[str] = Field(default_factory=list, description="장르 1~3개 (영어)")
    moods: list[str] = Field(default_factory=list, description="무드 1~3개 (영어)")
    instruments: list[str] = Field(default_factory=list, description="들린 악기 1~5개 (영어)")


class EditorialSet(BaseModel):
    spotify_ko: str = Field(description="Spotify for Artists 에디토리얼 피칭 곡 설명 (한국어, 500자 이내)")
    spotify_en: str = Field(description="같은 내용 영어판 (500자 이내)")
    dsp_intro_ko: str = Field(description="국내 음원 사이트 앨범 소개글 (한국어)")
    tags: EditorialTags


class CopySet(BaseModel):
    instagram: ChannelCopy
    tiktok: ChannelCopy
    threads: ChannelCopy
    x: ChannelCopy
