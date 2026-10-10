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
    min_duration_sec: int = 15  # 숏폼 하이라이트(highlight_sec)보다 짧으면 결과물을 못 만든다
    cpu_workers: int = 2
    daily_jobs_per_client: int = 3   # 초대 코드 없이 올릴 때 접속 IP별 (코드 필수면 안 씀)
    daily_jobs_per_band: int = 5     # 밴드(초대 코드)별 기본값 — 밴드마다 bands.daily_limit로 바꿀 수 있음
    daily_jobs_global: int = 60
    band_code_required: bool = False  # true면 곡을 올릴 때 초대 코드(X-Band-Code) 필수 — 밴드 테스트 때 켬
    note_edits_per_job: int = 5
    cover_regen_per_job: int = 3
    cover_candidates: int = Field(default=2, ge=1, le=3)  # 방향마다 만들 후보 수 — 2 이상이면 Gemini가 하나 고름, 1이면 끔
    cover_judge_model: str = "gemini-3.5-flash-lite"  # 커버 고르기 전용 (하루 500회 — 듣기용 상위 모델 한도를 안 씀)
    retention_days: int = 7
    keep_job_ids: str = ""  # 쉼표 구분 — 7일 삭제에서 빼는 작업 (팀 공유 샘플 등)

    # 커뮤니티 (곡 공개·반응)
    community_enabled: bool = True     # /community 페이지와 API
    community_daily_publish_per_client: int = 5
    feedback_daily_per_client: int = 30        # 접속 IP별 하루 반응 수 (전체 곡 합)
    feedback_daily_per_client_track: int = 3   # 한 곡에 같은 IP가 하루 남길 수 있는 반응 수
    # 도배·욕설·광고 방지 (DECISIONS #32)
    form_token_required: bool = True   # 화면이 받은 1회용 제출 토큰 없이는 반응·공개를 받지 않음 (매크로 방지)
    form_min_sec: float = 3.0          # 화면을 연 뒤 이보다 빨리 제출하면 거절
    form_token_ttl_sec: int = 600
    feedback_cooldown_sec: int = 30    # 같은 IP 반응 간격
    feedback_burst_per_min: int = 3    # 1분에 이보다 많으면 burst_block_min분 차단
    burst_block_min: int = 10
    feedback_ip_retention_days: int = 7  # 반응·신고에 남긴 접속 IP를 지우는 기한 (화면에는 안 나감)
    # 신고 (DECISIONS #33)
    report_hide_threshold: int = 3     # 서로 다른 접속에서 이만큼 신고되면 자동 숨김
    report_hide_threshold_stolen: int = 1  # '남의 곡 무단 업로드' 곡 신고는 1번이면 먼저 숨기고 운영자가 확인 (#40)
    fpcalc_path: str = "fpcalc"            # ffmpeg에 chromaprint가 없을 때 쓰는 fpcalc (서버: ~/apps/indie-studio/bin/fpcalc)
    acoustid_api_key: str | None = None    # 알려진 곡 조회 (acoustid.org 앱 키, 비상업 무료). 없으면 이 검사만 건너뜀
    telegram_bot_token: str | None = None  # 운영자 알림 (없으면 로그만)
    telegram_chat_id: str | None = None
    service_end_date: str | None = None    # 서비스 종료일 YYYY-MM-DD (공개 곡 일괄 삭제일, DECISIONS #35) — 화면 안내용

    # 로그인 (DECISIONS #34) — 곡 올리는 사람만. 키가 없으면 그 로그인 버튼은 꺼진다
    kakao_client_id: str | None = None      # REST API 키
    kakao_client_secret: str | None = None
    kakao_admin_key: str | None = None      # 연결 해제 웹훅 확인용 (카카오가 Authorization: KakaoAK <어드민 키>로 보냄)
    kakao_app_id: str | None = None         # 웹훅의 app_id가 우리 앱인지 확인 (1603105)
    google_client_id: str | None = None
    google_client_secret: str | None = None
    auth_dev_login: bool = False            # 로컬 확인용 가짜 로그인 (/auth/dev/login) — 서버에서는 절대 켜지 않음
    session_ttl_days: int = 30
    auth_redirect_origins: str = ""         # 로그인 후 돌아가도 되는 화면 주소 (쉼표). CORS_ORIGINS와 public_base_url은 기본 허용

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
    def auth_origin_list(self) -> list[str]:
        extra = [o.strip().rstrip("/") for o in self.auth_redirect_origins.split(",") if o.strip()]
        return list(dict.fromkeys([self.public_base_url.rstrip("/"), *self.cors_origin_list, *extra]))

    @field_validator("kakao_client_id", "kakao_client_secret", "kakao_admin_key", "kakao_app_id", "google_client_id", "google_client_secret",
                     "telegram_bot_token", "telegram_chat_id", "service_end_date", "acoustid_api_key")
    @classmethod
    def _blank_optional(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return None if not v or v.startswith("#") else v

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def community_dir(self) -> Path:
        return self.data_dir / "community"


@lru_cache
def get_settings() -> Settings:
    return Settings()
