"""사용자에게 보이는 에러. 메시지는 한국어, 재시도 가능 여부 포함 (API 에러 공통 형식)."""


class AppError(Exception):
    def __init__(self, code: str, message: str, retryable: bool, *, http_status: int = 400,
                 stage: str | None = None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.retryable = retryable
        self.http_status = http_status
        self.stage = stage

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


def not_ready(planned: str) -> AppError:
    """API 계약에는 있지만 아직 구현 전인 엔드포인트."""
    return AppError("NOT_IMPLEMENTED", f"아직 준비 중인 기능이에요 (예정: {planned}).", False, http_status=501)
