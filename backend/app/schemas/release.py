"""발매 준비 API 형식 (2026-10-10 추가): 발매 정보 입력 · 권리 자가진단 · 유통사 · 제출 준비표 · 발매 안내."""
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.package import CheckItem

CreditRole = Literal["작사", "작곡", "편곡", "보컬", "연주", "프로듀서", "믹싱", "마스터링", "기타"]


class Credit(BaseModel):
    role: CreditRole
    legal_name: str = Field(default="", max_length=50, description="실명 — 유통사·저작권 등록에 필요 (화면에는 안 나감)")
    stage_name: str = Field(default="", max_length=50, description="활동명 — 플랫폼 크레딧에 보이는 이름")


class ReleaseInfo(BaseModel):
    """PUT /jobs/{job_id}/release-info — 처음엔 업로드 때 넣은 곡 정보로 채워져 있다. 모든 필드를 한 번에 보낸다."""
    album: str = Field(default="", max_length=100, description="앨범명 (싱글이면 보통 곡 제목과 같게)")
    title: str = Field(default="", max_length=100, description="곡 제목 — 피처링·버전·Explicit을 넣지 않은 순수 제목")
    version: str = Field(default="", max_length=50, description="버전 (예: Acoustic Ver., Inst.) — 없으면 비움")
    artist: str = Field(default="", max_length=100, description="메인 아티스트 (기존 발매와 똑같은 철자)")
    featuring: list[str] = Field(default_factory=list, max_length=5, description="피처링 아티스트 (제목에 쓰지 않고 따로)")
    genre_primary: str = Field(default="", max_length=50)
    genre_secondary: str = Field(default="", max_length=50)
    language: str = Field(default="ko", max_length=20, description="제목·가사 언어: ko, en, ja, ... / instrumental(연주곡)")
    explicit: bool | None = Field(default=None, description="19금 가사 여부. null = 아직 안 정함")
    release_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    release_time: str = Field(default="18:00", pattern=r"^\d{2}:\d{2}$", description="국내는 오후 6시 발매가 흔함")
    credits: list[Credit] = Field(default_factory=list, max_length=20)
    lyrics: str = Field(default="", max_length=5000, description="복사 가능한 텍스트 (연주곡이면 비움)")
    copyright_holder: str = Field(default="", max_length=100, description="© 작사·작곡 권리자 (보통 본인 이름)")
    recording_holder: str = Field(default="", max_length=100, description="℗ 음원(녹음) 권리자 (보통 본인 이름)")
    isrc: str = Field(default="", max_length=15, description="이미 받은 ISRC가 있으면 (없으면 유통사가 발급)")
    previous_release: str = Field(default="", max_length=300,
                                  description="이전에 낸 곡이 있으면 그 곡의 Spotify·멜론 링크 — 같은 아티스트 페이지로 묶이게")


class Suggestion(BaseModel):
    """자동 교정 제안 — 화면에서 [적용]을 누르면 fields를 release-info에 덮어써서 다시 저장."""
    id: str
    message: str
    fields: dict = Field(description="바꿀 필드와 값")


class ReleaseInfoView(BaseModel):
    info: ReleaseInfo
    saved: bool = Field(description="false면 아직 저장 전 (업로드 정보로 채운 초안)")
    checks: list[CheckItem]
    suggestions: list[Suggestion]


RightsAnswer = dict[str, str]


class RightsQuestion(BaseModel):
    id: str
    question: str
    help: str = ""
    options: dict[str, str] = Field(description="값 → 화면 문구")


class RightsResult(BaseModel):
    answers: RightsAnswer
    complete: bool
    items: list[CheckItem] = Field(description="group=rights. fail이면 이대로는 발매·공개하면 안 됨")
    documents: list[str] = Field(description="챙겨 둘 서류·기록")


class DistributorProfile(BaseModel):
    id: str
    name: str
    kind: str
    signup: str
    stores: str
    melon: str
    lead_time: str
    lead_days: int = Field(description="발매일 기준 최소 며칠 전에 올려야 하는지 (검사용 권장값)")
    cost: str
    audio: str
    cover: str
    ai_policy: str
    extras: str = ""
    caution: str = ""
    sources: list[str]
    checked_at: str = Field(description="조사 기준일")


class DistributorCheck(BaseModel):
    distributor: DistributorProfile
    items: list[CheckItem]
    counts: dict[str, int]
    sheet_url: str = Field(description="제출 준비표 CSV (엑셀에서 열림) — 유통사 입력 순서대로 정리")


class GuideRecommendRequest(BaseModel):
    where: Literal["domestic", "global", "both"] = Field(description="국내(멜론 등) / 해외(Spotify 등) / 둘 다")
    budget: Literal["free", "paid_ok"] = Field(description="무료로 시작 / 돈을 조금 써도 됨")
    ai_audio: bool = Field(default=False, description="음원 제작에 AI를 썼는지")
    first_release: bool = True


class GuideRecommendation(BaseModel):
    plan: list[str] = Field(description="추천 유통사 id (1~2곳)")
    title: str
    reasons: list[str]
    cautions: list[str]
