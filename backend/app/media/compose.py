"""Pillow로 정지 이미지 만들기: 흐린 배경, 글자 레이어, 채널별 이미지, 제목 얹은 커버.

글자는 전부 여기서 PNG로 그린다 — ffmpeg drawtext의 한글 글꼴·줄바꿈 문제를 피하고, 숏폼에도 같은 글자 레이어를 얹는다.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    key = (str(path), size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(str(path), size)
    return _FONT_CACHE[key]


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def accent_color(colors: list[str]) -> tuple[int, int, int]:
    """어두운 배경 위에서 보일 강조색: 노트 색 중 가장 밝은 것, 그래도 어두우면 밝게 끌어올림."""
    def lum(c):
        r, g, b = c
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    best = max((hex_rgb(c) for c in colors), key=lum) if colors else (255, 255, 255)
    if lum(best) < 150:
        k = 150 / max(lum(best), 1)
        best = tuple(min(255, int(v * k + 40)) for v in best)
    return best


def cover_fill(cover: Image.Image, w: int, h: int) -> Image.Image:
    """비율이 달라도 빈틈없이 채우도록 잘라서 맞춘다 (object-fit: cover)."""
    scale = max(w / cover.width, h / cover.height)
    img = cover.resize((max(w, round(cover.width * scale)), max(h, round(cover.height * scale))), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def blurred_bg(cover: Image.Image, w: int, h: int, blur: float, darken: float) -> Image.Image:
    small = cover_fill(cover, w // 4, h // 4).filter(ImageFilter.GaussianBlur(blur / 4))  # 작게 흐린 뒤 키우면 빠르고 부드러움
    bg = small.resize((w, h), Image.LANCZOS)
    return ImageEnhance.Brightness(bg).enhance(darken).convert("RGB")


def _wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """한국어는 띄어쓰기 단위로, 한 단어가 너무 길면 글자 단위로 줄바꿈."""
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=f) <= max_w:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = ""
        for ch in word:
            if draw.textlength(cur + ch, font=f) > max_w and cur:
                lines.append(cur)
                cur = ""
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def draw_text(img: Image.Image, text: str, *, font_path: Path, size: int, y: int, max_width: int | None = None,
              color=(255, 255, 255), opacity: float = 1.0, max_lines: int = 2, x_center: int | None = None) -> int:
    """가운데 정렬 글자 + 은은한 그림자. 반환: 마지막 줄 아래 y."""
    if not text:
        return y
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(font_path, size)
    lines = _wrap(d, text, f, max_width or img.width - 120)[:max_lines]
    cx = img.width // 2 if x_center is None else x_center
    line_h = int(size * 1.32)
    alpha = int(255 * opacity)
    for i, line in enumerate(lines):
        w = d.textlength(line, font=f)
        pos = (cx - w / 2, y + i * line_h)
        d.text((pos[0] + 2, pos[1] + 3), line, font=f, fill=(0, 0, 0, int(alpha * 0.45)))
        d.text(pos, line, font=f, fill=(*color, alpha))
    img.alpha_composite(layer) if img.mode == "RGBA" else img.paste(layer, (0, 0), layer)
    return y + len(lines) * line_h


def short_overlay(size: tuple[int, int], *, font_path: Path, tpl: dict, hook: str, title: str, artist: str,
                  accent) -> Image.Image:
    """숏폼 위에 얹을 투명 글자 레이어 (훅 문구·제목·아티스트)."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    h = tpl["hook"]
    draw_text(img, hook, font_path=font_path, size=h["size"], y=h["y"], max_width=h["max_width"])
    t, a = tpl["title"], tpl["artist"]
    draw_text(img, title, font_path=font_path, size=t["size"], y=t["y"], color=accent, max_lines=1)
    draw_text(img, artist, font_path=font_path, size=a["size"], y=a["y"], opacity=a.get("opacity", 1), max_lines=1)
    return img


def channel_image(cover: Image.Image, size: tuple[int, int], layout: str, *, font_path: Path, title: str,
                  artist: str, accent) -> Image.Image:
    w, h = size
    if layout == "square":  # 커버를 꽉 채우고 아래쪽 그라데이션 위에 제목
        img = cover_fill(cover, w, h).convert("RGBA")
        _bottom_gradient(img, int(h * 0.38))
        y = draw_text(img, title, font_path=font_path, size=int(w * 0.06), y=int(h * 0.80), color=accent, max_lines=1)
        draw_text(img, artist, font_path=font_path, size=int(w * 0.036), y=y + 4, opacity=0.85, max_lines=1)
        return img.convert("RGB")
    if layout == "wide":  # 왼쪽 커버, 오른쪽 제목
        img = blurred_bg(cover, w, h, 36, 0.5).convert("RGBA")
        side = int(h * 0.78)
        img.paste(cover_fill(cover, side, side), ((h - side) // 2, (h - side) // 2))
        cx = side + (w - side) // 2 + (h - side) // 4
        y = draw_text(img, title, font_path=font_path, size=int(h * 0.075), y=int(h * 0.40), color=accent,
                      max_width=w - side - 140, x_center=cx)
        draw_text(img, artist, font_path=font_path, size=int(h * 0.045), y=y + 6, opacity=0.85,
                  max_width=w - side - 140, x_center=cx, max_lines=1)
        return img.convert("RGB")
    # poster: 흐린 배경 + 가운데 커버 + 아래 제목
    img = blurred_bg(cover, w, h, 36, 0.5).convert("RGBA")
    side = int(w * 0.82)
    top = int((h - side) * 0.38)
    img.paste(cover_fill(cover, side, side), ((w - side) // 2, top))
    y = draw_text(img, title, font_path=font_path, size=int(w * 0.058), y=top + side + int(w * 0.06), color=accent,
                  max_lines=1)
    draw_text(img, artist, font_path=font_path, size=int(w * 0.038), y=y + 4, opacity=0.85, max_lines=1)
    return img.convert("RGB")


def title_cover(cover: Image.Image, *, font_path: Path, title: str, artist: str, accent) -> Image.Image:
    """발매용 3000px 커버에 제목·아티스트를 얹은 버전 (url_title). 원본(글자 없음)도 따로 남는다."""
    s = cover.width
    img = cover.convert("RGBA")
    _bottom_gradient(img, int(s * 0.32))
    y = draw_text(img, title, font_path=font_path, size=int(s * 0.055), y=int(s * 0.835), color=accent, max_lines=1)
    draw_text(img, artist, font_path=font_path, size=int(s * 0.032), y=y + int(s * 0.004), opacity=0.85, max_lines=1)
    return img.convert("RGB")


def _bottom_gradient(img: Image.Image, height: int) -> None:
    grad = Image.new("L", (1, height))
    for i in range(height):
        grad.putpixel((0, i), int(200 * (i / height) ** 1.6))
    mask = grad.resize((img.width, height))
    shade = Image.new("RGBA", (img.width, height), (0, 0, 0, 255))
    shade.putalpha(mask)
    img.alpha_composite(shade, (0, img.height - height))
