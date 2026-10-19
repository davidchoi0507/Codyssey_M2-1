"""ffmpeg/ffprobe 호출: 길이 확인, Gemini 전송용 압축본 만들기.

보안: 올라온 파일은 ffmpeg가 내용으로 형식을 추측하지 않게 입력 형식을 확장자로 고정하고(-f), 로컬 파일만 열게 한다.
이름만 .mp3인 재생목록(HLS·concat) 파일로 서버가 다른 URL·파일을 열게 만드는 것을 막는다. 모든 호출에 시간 제한.
"""
import json
import shutil
import subprocess
from pathlib import Path

from app.core.errors import AppError

PROBE_TIMEOUT_SEC = 30
CONVERT_TIMEOUT_SEC = 300
_FORMATS = {".mp3": "mp3", ".wav": "wav", ".flac": "flac"}
_UNREADABLE = ("AUDIO_UNREADABLE", "음원 파일을 읽을 수 없어요. mp3나 wav 파일인지 확인해 주세요.")


def input_args(path: Path, ext: str | None = None) -> list[str]:
    """ffmpeg/ffprobe의 '-i 파일' 앞부분: 형식 고정 + 로컬 파일만."""
    fmt = _FORMATS.get((ext or path.suffix).lower())
    if fmt is None:
        raise AppError(*_UNREADABLE, False)
    return ["-protocol_whitelist", "file", "-f", fmt, "-i", str(path)]


def _frame_sync(b: bytes) -> bool:
    return len(b) >= 2 and b[0] == 0xFF and b[1] & 0xE0 == 0xE0


def check_magic(path: Path, ext: str) -> None:
    """파일 앞부분이 실제 mp3·wav인지 (확장자만 바꾼 다른 파일 거절).

    mp3는 ID3 태그 뒤에 곧바로 MPEG 프레임이 와야 한다 — 태그 뒤에 재생목록을 숨기면
    형식을 고정하지 않은 라이브러리(librosa의 audioread 폴백 등)가 재생목록으로 읽을 수 있다.
    """
    ext = ext.lower()
    with path.open("rb") as f:
        head = f.read(12)
        if ext == ".wav":
            ok = head[:4] in (b"RIFF", b"RF64") and head[8:12] == b"WAVE"
        elif ext == ".mp3" and head[:3] == b"ID3" and len(head) >= 10:
            size = 10 + ((head[6] & 0x7F) << 21 | (head[7] & 0x7F) << 14 | (head[8] & 0x7F) << 7 | (head[9] & 0x7F))
            size += 10 if head[5] & 0x10 else 0  # footer
            f.seek(size)
            rest = f.read(65536)
            # 태그 뒤 0으로 채운 여백이 남는 인코더가 있어 짧게 건너뛴다
            ok = _frame_sync(rest.lstrip(b"\x00"))
        else:
            ok = ext == ".mp3" and _frame_sync(head)
    if not ok:
        raise AppError(*_UNREADABLE, False)


def run_ffmpeg(args: list[str], timeout: int, *, text: bool = True) -> subprocess.CompletedProcess:
    """시간 제한을 넘기면 실패로 본다 (깨진 파일이 작업 처리기를 붙잡지 않게)."""
    try:
        return subprocess.run(args, check=True, capture_output=True, text=text, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise subprocess.CalledProcessError(-1, args, stderr=f"timeout {timeout}s") from e


def probe_duration(path: Path, ext: str | None = None) -> float:
    try:
        out = run_ffmpeg(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json",
                          *input_args(path, ext)], PROBE_TIMEOUT_SEC).stdout
        return float(json.loads(out)["format"]["duration"])
    except (subprocess.CalledProcessError, KeyError, ValueError) as e:
        raise AppError(*_UNREADABLE, False) from e


def store_original(src: Path, input_dir: Path, *, ext: str | None = None) -> Path:
    """원본 보관: WAV는 FLAC(무손실, 용량 약 절반)으로 바꿔 저장하고, mp3는 그대로 복사한다.

    숏폼 영상은 이 파일로 만들므로 음질을 떨어뜨리지 않는다.
    """
    input_dir.mkdir(parents=True, exist_ok=True)
    ext = (ext or src.suffix).lower()
    if ext == ".wav":
        dst = input_dir / "original.flac"
        try:
            run_ffmpeg(["ffmpeg", "-v", "error", "-y", *input_args(src, ext), "-c:a", "flac", str(dst)],
                       CONVERT_TIMEOUT_SEC)
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
        run_ffmpeg(["ffmpeg", "-v", "error", "-y", *input_args(src), "-ac", "1", "-ar", "16000", "-b:a", "64k", str(dst)],
                   CONVERT_TIMEOUT_SEC)
    except subprocess.CalledProcessError as e:
        raise AppError("AUDIO_CONVERT_FAILED", "음원을 변환하지 못했어요. 다른 파일로 다시 시도해 주세요.", False) from e
    return dst
