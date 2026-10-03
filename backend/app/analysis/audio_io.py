"""ffmpeg/ffprobe 호출: 길이 확인, Gemini 전송용 압축본 만들기."""
import json
import shutil
import subprocess
from pathlib import Path

from app.core.errors import AppError


def probe_duration(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
            check=True, capture_output=True, text=True,
        ).stdout
        return float(json.loads(out)["format"]["duration"])
    except (subprocess.CalledProcessError, KeyError, ValueError) as e:
        raise AppError("AUDIO_UNREADABLE", "음원 파일을 읽을 수 없어요. mp3나 wav 파일인지 확인해 주세요.", False) from e


def store_original(src: Path, input_dir: Path, *, ext: str | None = None) -> Path:
    """원본 보관: WAV는 FLAC(무손실, 용량 약 절반)으로 바꿔 저장하고, mp3는 그대로 복사한다.

    숏폼 영상은 이 파일로 만들므로 음질을 떨어뜨리지 않는다.
    """
    input_dir.mkdir(parents=True, exist_ok=True)
    ext = (ext or src.suffix).lower()
    if ext == ".wav":
        dst = input_dir / "original.flac"
        try:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "flac", str(dst)],
                           check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            raise AppError("AUDIO_CONVERT_FAILED", "음원을 변환하지 못했어요. 다른 파일로 다시 시도해 주세요.", False) from e
    else:
        dst = input_dir / f"original{ext}"
        shutil.copy2(src, dst)
    return dst


def make_analysis_mp3(src: Path, dst: Path) -> Path:
    """모노·16kHz·64kbps mp3 (ARCHITECTURE.md: Gemini 전송용 압축본)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", "-b:a", "64k", str(dst)],
            check=True, capture_output=True, text=True,
        )
    except subprocess.CalledProcessError as e:
        raise AppError("AUDIO_CONVERT_FAILED", "음원을 변환하지 못했어요. 다른 파일로 다시 시도해 주세요.", False) from e
    return dst
