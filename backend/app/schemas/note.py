"""A&R 노트 형식 (API_CONTRACT.md). 10/7 이후 필드 추가만."""
from pydantic import BaseModel, Field

from app.schemas.common import AIGenerated


class Evidence(BaseModel):
    bpm: float
    key: str
    energy_change: str


class CoverDirection(BaseModel):
    id: str
    text: str


class HighlightCandidate(BaseModel):
    id: str
    start: float
    end: float
    reason: str


class HighlightRange(BaseModel):
    start: float
    end: float


class Highlight(BaseModel):
    candidates: list[HighlightCandidate]
    recommended_id: str
    selected: HighlightRange


class ARNote(BaseModel):
    job_id: str
    version: int
    interpretation: str
    evidence: Evidence
    mood_keywords: list[str]
    colors: list[str]
    cover_directions: list[CoverDirection]
    highlight: Highlight
    waveform: list[float]
    user_correction: str | None = None
    edits_remaining: int
    ai_generated: AIGenerated


# ---- A&R 에이전트가 직접 채우는 부분 (나머지는 코드가 조립) ----

class CandidateReason(BaseModel):
    id: str
    reason: str = Field(description="화면에 보일 한 줄 이유 (한국어)")


class ARNoteDraft(BaseModel):
    interpretation: str = Field(description="해석 1~2문장. 근거 수치(BPM·에너지 변화 등)를 문장 안에 포함")
    energy_change: str = Field(description="근거로 쓸 에너지 변화 요약 (Audio Feature Profile 값 그대로)")
    mood_keywords: list[str] = Field(description="무드 키워드 정확히 5개 (한국어 한 단어)")
    colors: list[str] = Field(description="곡 색 정확히 3개, #RRGGBB")
    cover_directions: list[str] = Field(description="서로 다른 커버 방향 정확히 3개 (소재 + 화풍, 한 줄씩)")
    candidate_reasons: list[CandidateReason] = Field(description="하이라이트 후보 각각의 이유")
    recommended_id: str = Field(description="추천 하이라이트 후보 id")
