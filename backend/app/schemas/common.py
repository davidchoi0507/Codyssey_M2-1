from pydantic import BaseModel


class ErrorInfo(BaseModel):
    """에러 공통 형식 (API_CONTRACT.md)."""
    code: str
    message: str
    retryable: bool


class AIGenerated(BaseModel):
    """AI 생성 표기용 메타데이터 — 사용한 모델명."""
    models: list[str]
    notice: str | None = None
