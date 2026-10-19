"""마지막 설문·사용 기록 API 형식 (10/14 회의 추가). 문항 자체는 app/pipeline/survey.py 의 QUESTIONS."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.pipeline.usage import CLIENT_EVENTS


class SurveyQuestion(BaseModel):
    id: str
    type: Literal["choice", "matrix", "text"] = Field(description="choice: options 중 하나 / matrix: rows마다 options 중 하나 "
                                                                   "/ text: 자유 입력(max_length)")
    question: str
    required: bool
    options: dict[str, str] | None = Field(default=None, description="값 → 화면 문구 (choice·matrix)")
    rows: dict[str, str] | None = Field(default=None, description="matrix의 행: 값 → 화면 문구")
    max_length: int | None = None


class SurveyView(BaseModel):
    kind: Literal["release", "community"] = Field(description="release: 발매 준비 작업 / community: 바로 공개한 곡")
    version: str = Field(description="문항 버전 — 문항이 바뀌면 올라간다")
    questions: list[SurveyQuestion]
    answers: dict | None = Field(description="이미 낸 답 (없으면 null). 다시 내면 덮어쓴다")
    answered_at: datetime | None = None


class SurveyAnswer(BaseModel):
    """PUT .../survey — {문항 id: 값}. choice는 options의 키, matrix는 {행: options의 키}, text는 글."""
    answers: dict = Field(examples=[{"satisfaction": "4", "reuse": "5", "assets": {"cover": "as_is", "copy": "minor"},
                                     "improve": "커버를 더 고를 수 있으면 좋겠어요"}])


UsageEventName = Literal[tuple(CLIENT_EVENTS)]  # type: ignore[valid-type]


class UsageEvent(BaseModel):
    """POST /jobs/{job_id}/usage — 화면에서만 일어나는 일 (서버가 모르는 것)."""
    event: UsageEventName = Field(description=" · ".join(f"{k}: {v}" for k, v in CLIENT_EVENTS.items()))
    target: str | None = Field(default=None, max_length=40, description="무엇을 (채널·언어·칸 이름 등)")
