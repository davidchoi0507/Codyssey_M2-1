"""사용자에게 보이는 에러. 메시지는 한국어, 재시도 가능 여부 포함 (API 에러 공통 형식)."""


class AppError(Exception):
    def __init__(self, code: str, message: str, retryable: bool, *, stage: str | None = None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.retryable = retryable
        self.stage = stage

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}
