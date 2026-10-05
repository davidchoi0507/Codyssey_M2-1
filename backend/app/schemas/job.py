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
    created_at: datetime | None = None  # (2026-10-05 추가)
    expires_at: datetime | None = Field(default=None, description="이 시각이 지나면 다음 정리(매일 04:00) 때 삭제. "
                                                                  "삭제에서 빼둔 작업은 null")


class BandJob(BaseModel):
    """GET /band/jobs 의 한 줄 — 작업 ID를 몰라도 밴드 코드로 이어서 열기."""
    job_id: str
    title: str
    artist: str
    stage: str
    stage_label: str
    created_at: datetime
    expires_at: datetime | None = None


class BandJobs(BaseModel):
    band: BandInfo
    jobs: list[BandJob] = Field(description="최근 것부터. 삭제된 작업은 없음")
