"""Pillow 이미지 처리: 커버 마감(색 보정·입자), 업스케일 (Real-ESRGAN 도입 전 폴백)."""
import io
import zlib
from pathlib import Path

import numpy as np
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


def _rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


# finish별 (입자 세기, 검은색 띄우기, 종이 톤 섞기). 1024px 원본 기준 — 3000px로 키우면 입자가 필름처럼 부드러워진다.
_FINISH = {"film": (7.0, 10.0, 0.0), "print": (11.0, 4.0, 0.06), "clean": (0.0, 0.0, 0.0)}
_PAPER = np.array([244, 238, 226], dtype=np.float32)


def finish_cover(path: Path, colors: list[str], kind: str = "film", strength: float = 0.07) -> None:
    """AI 이미지 특유의 매끈함을 줄이는 마감: 노트 색으로 은은한 스플릿 톤(어두운 곳은 가장 어두운 색, 밝은 곳은 가장
    밝은 색 쪽으로) + finish별 입자·검은색 띄우기·종이 톤. 같은 파일은 항상 같은 결과(입자 시드 = 파일 이름)."""
    grain, lift, paper = _FINISH.get(kind, _FINISH["film"])
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB"), dtype=np.float32)
    lum = (a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None] / 255.0
    if len(colors) >= 2:
        pal = sorted((_rgb(c) for c in colors), key=lambda c: float(c @ np.array([0.2126, 0.7152, 0.0722])))
        dark, light = pal[0], pal[-1]
        a = a + strength * ((1 - lum) * (dark - a) + lum * (light - a))
    if lift:
        a = lift + a * (1 - lift / 255.0)
    if paper:
        a = a + paper * lum * (_PAPER - a)
    if grain:
        rng = np.random.default_rng(zlib.crc32(path.name.encode()))
        noise = rng.normal(0.0, grain, a.shape[:2]).astype(np.float32)[..., None]
        a = a + noise * (0.5 + 2.0 * lum * (1 - lum))  # 중간 밝기에 입자가 더 보이게 (필름처럼)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path, "PNG")
