"""환경변수 → 설정. 모델명·한도·경로는 전부 여기서만 읽는다."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 종료(예정)된 모델 — 실수로 넣어도 바로 막는다.
FORBIDDEN_MODELS = {"gemini-2.5-flash", "dall-e-3"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 코디세이 (OpenAI 호환)
    codyssey_api_key: str
    codyssey_base_url: str
    codyssey_llm_model: str
    codyssey_llm_model_fast: str | None = None
    codyssey_image_model: str | None = None

    # Gemini (오디오 듣기)
    gemini_api_key: str
    gemini_api_key_backup: str | None = None  # 메인 키의 하루 한도가 찼을 때만 사용
    gemini_model: str
    # 하루 한도(또는 혼잡이 재시도로도 안 풀릴 때) 다음으로 쓸 모델들, 쉼표 구분. 키마다 이 순서를 다 돈다
    gemini_fallback_models: str = "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
    gemini_tier: str = "free"
    gemini_inline_max_mb: float = 15.0  # 이보다 크면 Files API로 업로드

    # 서버
    app_env: str = "dev"
    public_base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"
    playground_enabled: bool = True  # /playground 백엔드 흐름 확인용 페이지 (팀 공유용, 밴드 공개 시 끔)
    data_dir: Path = Path("./data")
    db_path: Path = Path("./data/app.db")
    download_token_secret: str = ""
    download_token_ttl_sec: int = 86400

    # 한도
    max_upload_mb: int = 200  # 10분 24bit/48kHz WAV(약 173MB)까지. 실제 기준은 max_duration_sec
    max_duration_sec: int = 600
    cpu_workers: int = 2
    daily_jobs_per_client: int = 3
    daily_jobs_global: int = 60
    note_edits_per_job: int = 5
    cover_regen_per_job: int = 3
    retention_days: int = 7
    keep_job_ids: str = ""  # 쉼표 구분 — 7일 삭제에서 빼는 작업 (팀 공유 샘플 등)

    # 미디어
    font_path: Path = Path("./app/fonts/NotoSansKR-Bold.ttf")
    highlight_sec: float = 15.0
    canvas_sec: float = 8.0

    # 외부 API 재시도
    api_max_retries: int = Field(default=4, ge=0)

    @field_validator("gemini_model", "codyssey_llm_model", "codyssey_llm_model_fast", "codyssey_image_model")
    @classmethod
    def _not_forbidden(cls, v: str | None) -> str | None:
        if v and v.strip() in FORBIDDEN_MODELS:
            raise ValueError(f"'{v}' 모델은 종료(예정)되어 사용할 수 없어요. .env의 모델명을 바꿔 주세요.")
        return v.strip() if v else v

    @field_validator("gemini_api_key_backup")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        # 빈 값 뒤 같은 줄 주석("KEY=   # 설명")은 dotenv가 값으로 읽는다 → 키가 아니므로 버린다
        v = (v or "").strip()
        return None if not v or v.startswith("#") else v

    @property
    def gemini_models(self) -> list[str]:
        """메인 모델 + 폴백 모델 (중복 제거, 순서 유지)."""
        names = [self.gemini_model] + [m.strip() for m in self.gemini_fallback_models.split(",") if m.strip()]
        bad = [m for m in names if m in FORBIDDEN_MODELS]
        if bad:
            raise ValueError(f"{bad} 모델은 종료(예정)되어 사용할 수 없어요. .env의 GEMINI_FALLBACK_MODELS를 바꿔 주세요.")
        return list(dict.fromkeys(names))

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"


@lru_cache
def get_settings() -> Settings:
    return Settings()
