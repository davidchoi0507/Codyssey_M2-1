"""작업 상태 API 형식 (GET /jobs/{job_id}, POST /jobs 응답)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import ErrorInfo


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
    error: ErrorInfo | None = None
    updated_at: datetime
