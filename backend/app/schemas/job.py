"""작업 상태 API 형식 (GET /jobs/{job_id}, POST /jobs 응답)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ErrorInfo


class BandInfo(BaseModel):
    """GET /band — 초대 코드로 확인한 밴드."""
    name: str
    code: str = Field(description="보기 좋은 형식 (ABCD-EFGH)")
    daily_limit: int
    used_today: int
    remaining_today: int


class JobCreated(BaseModel):
    job_id: str
    status_url: str


class StepStatus(BaseModel):
    key: str
    label: str
    status: Literal["pending", "running", "done", "failed"]


class EarlyResult(BaseModel):
    """librosa 결과 — Gemini보다 먼저 화면에 보여준다."""
    bpm: float
    duration_sec: float
    waveform: list[float]
    summary: str


class JobStatus(BaseModel):
    job_id: str
    stage: str
    stage_label: str
    progress: float
    queue_position: int | None = None
    steps: list[StepStatus]
    early: EarlyResult | None = None
    audio_url: str | None = None  # 하이라이트 미리 듣기·구간 다시 고르기용 (압축본 64kbps 모노). 떠났다 돌아와도 들을 수 있게
    error: ErrorInfo | None = None
    updated_at: datetime
