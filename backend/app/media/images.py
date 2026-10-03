"""Pillow 이미지 처리: 업스케일 (Real-ESRGAN 도입 전 폴백)."""
import io
from pathlib import Path

from PIL import Image


def save_png(data: bytes, path: Path) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(io.BytesIO(data))
    img.save(path, "PNG")
    return img.size


def upscale(src: Path, dst: Path, size: int = 3000) -> None:
    """정사각 커버를 size×size로 (LANCZOS). 발매 플랫폼 커버 권장 규격 3000px."""
    with Image.open(src) as img:
        img.convert("RGB").resize((size, size), Image.LANCZOS).save(dst, "PNG", optimize=True)
