"""작업 만들기 (업로드 API와 CLI 공용): 형식·길이·크기 확인 → 원본 저장(WAV는 FLAC) → 곡 정보·동의 기록."""
from pathlib import Path

from app.analysis.audio_io import probe_duration, store_original
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.jobfiles import JobFiles, new_job_id, now_iso

ALLOWED_EXT = {".mp3", ".wav"}
REQUIRED_CONSENTS = ("consent_original", "consent_privacy", "consent_external_ai")


def check_consent(consent: dict) -> None:
    if not all(consent.get(k) for k in REQUIRED_CONSENTS):
        raise AppError("CONSENT_REQUIRED",
                       "필수 동의(자작곡 확약, 개인정보 7일 보관, 음원의 Gemini 전송·학습 가능성 고지)가 필요해요.", False)
    if not consent.get("consent_version"):
        raise AppError("CONSENT_REQUIRED", "동의 문구 버전이 없어요.", False)


def create_job(settings: Settings, src: Path, *, filename: str, song: dict, consent: dict, source: str,
               enforce_size: bool = True) -> JobFiles:
    """src는 이미 디스크에 있는 파일 (업로드 임시 파일 또는 CLI 경로). src는 지우지 않는다."""
    check_consent(consent)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise AppError("UNSUPPORTED_FORMAT", "mp3나 wav 파일만 올릴 수 있어요.", False)
    size_mb = src.stat().st_size / 1024 / 1024
    if enforce_size and size_mb > settings.max_upload_mb:
        raise AppError("UPLOAD_TOO_LARGE", f"{settings.max_upload_mb}MB 이하 파일만 올릴 수 있어요.", False,
                       http_status=413)
    duration = probe_duration(src)
    if duration > settings.max_duration_sec:
        raise AppError("TOO_LONG", f"{settings.max_duration_sec // 60}분 이하 곡만 처리할 수 있어요.", False)

    jf = JobFiles(settings.jobs_dir, new_job_id())
    # 확장자는 원래 파일명 기준 (업로드 임시 파일엔 확장자가 없을 수 있음)
    stored = store_original(src, jf.root / "input", ext=ext)
    jf.write_json(jf.song, song)
    jf.write_json(jf.consent, {**{k: bool(consent.get(k)) for k in (*REQUIRED_CONSENTS, "consent_showcase")},
                               "version": consent["consent_version"], "at": now_iso(),
                               "gemini_tier": settings.gemini_tier})
    jf.set_status(Stage.UPLOADED)
    jf.event("uploaded", size_mb=round(size_mb, 1), stored=stored.name,
             stored_mb=round(stored.stat().st_size / 1024 / 1024, 1), duration_sec=round(duration, 1), source=source)
    return jf
