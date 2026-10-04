"""분석 단계 내부 결과 (features.json, listening.json). API로 직접 나가지 않는다."""
from pydantic import BaseModel, Field


class HighlightCandidateFeature(BaseModel):
    id: str
    start: float
    end: float
    score: float
    energy: float = Field(description="창 안 평균 에너지 (곡 전체 대비 0~1)")
    repetition: float = Field(description="반복성 (후렴 추정, 0~1)")
    rise: float = Field(description="창 시작 직전 대비 에너지 상승 (0~1)")
    reason: str = Field(description="수치 기반 근거 문장")


class Section(BaseModel):
    start: float
    end: float
    energy: float = Field(description="구간 평균 에너지 (곡 전체 대비 0~1)")


class Features(BaseModel):
    duration_sec: float
    bpm: float
    bpm_alternatives: list[float] = Field(description="반/두 배 후보 — 체감 템포가 다를 수 있음")
    key: str
    key_confidence: float
    loudness_db_mean: float
    energy_curve: list[float] = Field(description="1초 단위 RMS, 곡 최대값 대비 0~1")
    energy_change: str = Field(description="에너지가 가장 크게 오르는 지점 요약")
    energy_peak: str = Field(description="에너지가 가장 높은 구간 (클라이맥스 후보)")
    sections: list[Section]
    waveform: list[float] = Field(description="화면용 파형 peak 요약 (약 800점, 0~1)")
    highlight_candidates: list[HighlightCandidateFeature]
    summary: str


class EmotionPoint(BaseModel):
    start: float = Field(description="초")
    end: float = Field(description="초")
    emotion: str = Field(description="이 구간의 감정·분위기 (한국어)")


class Listening(BaseModel):
    """Gemini가 곡을 직접 듣고 낸 결과. response_schema로 형식 고정."""
    overall_impression: str = Field(description="곡 전체를 들은 인상 2~3문장 (한국어)")
    emotional_arc: list[EmotionPoint] = Field(description="시간대별 감정 흐름 4~8개")
    instrumentation: list[str] = Field(description="들리는 악기·사운드 요소")
    vocal_texture: str = Field(description="보컬 유무와 질감. 보컬이 없으면 '보컬 없음'")
    lyrics_gist: str = Field(description="가사 요지. 사용자 가사가 있으면 그것을 우선, 알아듣기 어려우면 '알 수 없음'")
    genre_feel: str = Field(description="들리는 장르·스타일 감각")
    # 이전에 저장된 듣기 결과(필드 없음)도 읽히도록 선택값
    perceived_bpm: float | None = Field(default=None, description="실제로 들리는 체감 템포. Profile의 bpm 또는 bpm_alternatives 값 중 하나를 그대로 쓴다")
    recommended_highlight_id: str = Field(description="하이라이트 후보 id 중 하나")
    recommendation_reason: str = Field(description="그 후보를 고른 이유 (실제로 들은 내용 기반)")
    candidate_notes: list["CandidateNote"] = Field(description="후보마다 그 구간에서 실제로 들리는 것")


class CandidateNote(BaseModel):
    id: str = Field(description="하이라이트 후보 id")
    note: str = Field(description="그 구간에서 실제로 들리는 것 한 줄")


Listening.model_rebuild()
