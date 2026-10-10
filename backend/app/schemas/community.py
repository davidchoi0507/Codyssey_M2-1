"""커뮤니티 API 형식 (API_CONTRACT.md 10/9 커뮤니티 메모). 새 기능이라 화면 확정 전까지 필드가 바뀔 수 있음."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ListenMode = Literal["full", "highlight"]
AIUsage = Literal["none", "tool", "generated"]
MAX_INTRO = 500
MAX_COMMENT = 500
MAX_NICKNAME = 20


class PublishRequest(BaseModel):
    """POST /jobs/{job_id}/community — 작업의 곡을 커뮤니티에 올리기 (이미 올렸으면 설정 변경)."""
    listen_mode: ListenMode = Field(description="full: 전곡 공개 / highlight: 하이라이트(A&R 노트의 선택 구간, 약 15초)만")
    comments_public: bool = Field(description="true: 의견을 누구나 봄 / false: 올린 사람만 봄 (별점·태그 요약도 같이 숨김)")
    intro: str | None = Field(default=None, max_length=MAX_INTRO, description="목록에 보일 한 줄 소개. 없으면 업로드 때 곡 소개")
    consent_rights: bool = Field(description="자작곡이거나 공개할 권리가 있음 — 필수")
    consent_public: bool = Field(description="커뮤니티 공개, 직접 내릴 때까지 보관(작업의 7일 삭제와 별도) — 필수")
    ai_usage: AIUsage | None = Field(default=None, description="(10/10 추가) 음원에 AI를 썼는지: none 안 씀 · tool 도구로만 · "
                                                              "generated AI가 곡·목소리를 만듦 → 곡에 'AI 활용' 표시. 없으면 권리 자가진단 답")
    confirm_original: bool = Field(default=False, description="(10/10 추가) 409 KNOWN_SONG_MATCH(알려진 곡과 비슷)를 받은 뒤 "
                                                              "'직접 만든 곡이 맞다'고 확인하고 다시 보낼 때 true")


class TrackPatch(BaseModel):
    """PATCH /community/tracks/{track_id} (X-Owner-Key). 모든 필드 선택."""
    listen_mode: ListenMode | None = Field(default=None, description="바꾸려면 원본 작업이 남아 있어야 함(7일)")
    comments_public: bool | None = None
    intro: str | None = Field(default=None, max_length=MAX_INTRO)


class FeedbackRequest(BaseModel):
    """POST /community/tracks/{track_id}/feedback — 별점·태그·의견 중 하나 이상."""
    rating: int | None = Field(default=None, ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=6, description="GET /community/meta 의 tags 중에서")
    comment: str | None = Field(default=None, max_length=MAX_COMMENT)
    nickname: str | None = Field(default=None, max_length=MAX_NICKNAME, description="없으면 '익명'")
    form_token: str | None = Field(default=None, max_length=100,
                                   description="(10/10 추가) GET /community/form-token 으로 받은 1회용 토큰 — 반응 입력칸을 열 때 받고, "
                                               "보낼 때마다 새로 받는다. 받은 뒤 3초 안에 보내면 거절(매크로 방지)")
    website: str | None = Field(default=None, max_length=200,
                                description="(10/10 추가) 함정 칸 — 화면에 안 보이게 두고 항상 비워 보낸다. 값이 있으면 봇으로 보고 거절")


class FeedbackStats(BaseModel):
    reactions: int
    comments: int
    rating_avg: float | None
    rating_count: int
    rating_dist: dict[str, int] = Field(description='{"1": 0, ..., "5": 3}')
    tags: dict[str, int]


class Feedback(BaseModel):
    id: int
    created_at: datetime
    nickname: str
    rating: int | None
    tags: list[str]
    comment: str | None
    hidden: bool = Field(default=False, description="올린 사람 화면에서만 의미 있음")


class Track(BaseModel):
    track_id: str
    title: str
    artist: str
    genre: str
    intro: str
    listen_mode: ListenMode
    clip_sec: float = Field(description="공개 음원 길이(초)")
    comments_public: bool
    colors: list[str]
    moods: list[str]
    cover_url: str
    audio_url: str
    plays: int
    reactions: int
    ai_usage: str = Field(default="none", description="(10/10 추가) none · tool · generated — generated면 화면에 'AI 활용' 표시")
    stats: FeedbackStats | None = Field(description="comments_public=false면 null (올린 사람 화면에는 항상 있음)")
    created_at: datetime


class TrackList(BaseModel):
    tracks: list[Track]
    total: int


class TrackDetail(Track):
    feedback: list[Feedback] = Field(description="공개된 의견 (comments_public=false면 빈 목록)")


class OwnerView(Track):
    """올린 사람 화면: 비공개 의견까지 전부 + 관리 링크."""
    status: str = Field(default="live", description="(10/10 추가) live 공개 중 · reported 신고 누적으로 숨겨짐(운영자 확인 중) · "
                                                    "hidden 운영자가 내림")
    job_id: str | None
    feedback: list[Feedback]
    stats: FeedbackStats
    owner_key: str
    manage_url: str = Field(description="관리 페이지 주소 (키는 # 뒤라 서버 로그·다른 사이트로 안 감). 잃어버리면 작업이 남아 있는 7일 안에 "
                                        "GET /jobs/{job_id}/community 로 다시 볼 수 있음")


class CommunityMeta(BaseModel):
    tags: list[str]
    listen_modes: dict[str, str]
    consent_version: str
    report_reasons: dict[str, str] = Field(default_factory=dict, description="(10/10 추가) 신고 사유 값 → 화면 문구")
    service_end_date: str | None = Field(default=None, description="(10/10 추가) 서비스 종료일 — 이날 공개 곡을 모두 지움")


class FormToken(BaseModel):
    token: str
    min_sec: float = Field(description="받은 뒤 이 시간이 지나야 보낼 수 있음")
    ttl_sec: int


class ReportRequest(BaseModel):
    reason: Literal["abuse", "ad", "stolen", "other"] = Field(
        description="abuse 욕설·비하 · ad 광고·도배 · stolen 남의 곡 무단 · other 기타")
    detail: str | None = Field(default=None, max_length=300)


class ReportResult(BaseModel):
    reported: bool
    hidden: bool = Field(description="이번 신고로 기준을 넘어 숨겨졌는지")
    message: str
