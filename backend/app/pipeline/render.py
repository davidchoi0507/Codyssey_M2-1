"""렌더링 파이프라인 (커버 선택 후): 숏폼·Canvas·채널별 이미지·제목 얹은 커버 → done.

- CPU를 많이 쓰므로 분석과 같은 대기열 자리(CPU_WORKERS)를 쓴다 (runner.start_render).
- 다른 커버를 고르면 지금 결과(영상·채널 이미지)를 renders/<커버>_v<버전>/ 에 보관하고, 고른 커버의 보관본이 있으면
  꺼내 온다 → 1번→2번→1번처럼 다시 고르면 바로 끝난다. 있는 파일은 건너뛰므로 없는 것만 새로 만든다.
- AI는 쓰지 않는다 (Pillow·ffmpeg만). 글(채널 글·피칭)은 커버와 무관해서 어떤 커버를 골라도 같다.
"""
import asyncio
import logging
import shutil
import tempfile
import time
from pathlib import Path

import yaml
from PIL import Image

from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.media import compose
from app.media.video import render_canvas, render_short
from app.pipeline.generate import accepted_note
from app.pipeline.jobfiles import JobFiles, now_iso

log = logging.getLogger(__name__)
TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
SHORT_TEMPLATE = "calm"


def load_template(name: str) -> dict:
    return yaml.safe_load((TEMPLATES / f"{name}.yaml").read_text(encoding="utf-8"))


def cover_file(jf: JobFiles, item_id: str, v: int, suffix: str = "_3000") -> Path:
    """item_id(cover-1~3, cover-own) + 버전 → 파일. 없으면 COVER_NOT_FOUND."""
    if item_id == "cover-own":
        p = jf.own_cover(v, suffix)
    elif item_id in ("cover-1", "cover-2", "cover-3"):
        p = jf.cover(int(item_id[-1]), v, suffix)
    else:
        p = None
    if p is None or not p.exists():
        raise AppError("COVER_NOT_FOUND", "고른 커버를 찾을 수 없어요. 목록을 새로 고쳐 주세요.", False, http_status=404)
    return p


def select_cover(jf: JobFiles, item_id: str, v: int | None) -> dict:
    """선택을 기록하고 (다른 커버면) 렌더링 결과를 바꿔 끼운다. 렌더링 시작은 runner가."""
    st = jf.status()["stage"]
    if st not in (Stage.AWAITING_COVER, Stage.DONE, Stage.FAILED) or not jf.accepted.exists():
        raise AppError("NOT_READY_TO_SELECT", "커버 3종이 만들어진 뒤에 고를 수 있어요.", True, http_status=409)
    if v is None:
        v = jf.latest_version(lambda i: cover_file_or_none(jf, item_id, i))
    cover_file(jf, item_id, v or 0)  # 존재 확인
    sel = {"item_id": item_id, "v": v, "at": now_iso()}
    prev = jf.read_json(jf.selected_cover) if jf.selected_cover.exists() else None
    if prev and (prev["item_id"], prev["v"]) != (item_id, v):
        _swap_renders(jf, _key(prev), _key(sel))
    jf.write_json(jf.selected_cover, sel)
    jf.event("cover_selected", item=item_id, v=v)
    return sel


def cover_file_or_none(jf: JobFiles, item_id: str, v: int) -> Path | None:
    try:
        return cover_file(jf, item_id, v)
    except AppError:
        return None


def _key(sel: dict) -> str:
    return f"{sel['item_id']}_v{sel['v']}"


def _render_outputs(root: Path) -> list[Path]:
    """커버마다 달라지는 결과 (제목 커버는 커버 파일별로 이름이 달라서 제외)."""
    return [*(root / "video").glob("*.mp4"), *(root / "channels").glob("*/image_*.png")]


def _swap_renders(jf: JobFiles, prev_key: str, new_key: str) -> None:
    stash = jf.root / "renders"
    for p in _render_outputs(jf.root):
        dest = stash / prev_key / p.relative_to(jf.root)
        dest.parent.mkdir(parents=True, exist_ok=True)
        p.replace(dest)
    cached = stash / new_key
    if cached.exists():
        for p in _render_outputs(cached):
            dest = jf.root / p.relative_to(cached)
            dest.parent.mkdir(parents=True, exist_ok=True)
            p.replace(dest)
        shutil.rmtree(cached, ignore_errors=True)


async def run_render(settings: Settings, jf: JobFiles) -> None:
    sel = jf.read_json(jf.selected_cover)
    note = accepted_note(jf)
    song = jf.read_json(jf.song)
    title, artist = song.get("title", ""), song.get("artist", "")
    font = settings.font_path
    accent = compose.accent_color(note.colors)
    tiktok = jf.latest_version(lambda v: jf.channel_copy("tiktok", v))
    hook = (jf.read_json(jf.channel_copy("tiktok", tiktok)).get("hook") if tiktok else None) or " · ".join(note.mood_keywords[:2])
    src_cover = cover_file(jf, sel["item_id"], sel["v"])
    original = jf.find_original()

    jf.set_status(Stage.RENDERING, step="render")
    jf.event("step_start", step="render")
    t = time.monotonic()
    try:
        cover = await asyncio.to_thread(lambda: Image.open(src_cover).convert("RGB"))
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            short_tpl, canvas_tpl = load_template(f"short_{SHORT_TEMPLATE}"), load_template("canvas")

            def stills() -> None:
                """정지 레이어·채널 이미지·제목 커버 (Pillow, 스레드에서)."""
                w, h = short_tpl["size"]
                b = short_tpl["background"]
                compose.blurred_bg(cover, w, h, b["blur"], b["darken"]).save(tmp / "short_bg.png")
                cover.resize((short_tpl["cover"]["size"],) * 2, Image.LANCZOS).save(tmp / "cover_s.png")
                compose.short_overlay((w, h), font_path=font, tpl=short_tpl, hook=hook, title=title, artist=artist,
                                      accent=accent).save(tmp / "short_overlay.png")
                cw, ch = canvas_tpl["size"]
                cb = canvas_tpl["background"]
                compose.blurred_bg(cover, cw, ch, cb["blur"], cb["darken"]).save(tmp / "canvas_bg.png")
                cover.resize((canvas_tpl["cover"]["size"],) * 2, Image.LANCZOS).save(tmp / "cover_c.png")
                for channel, ratios in load_template("channel_images").items():
                    for ratio, spec in ratios.items():
                        out = jf.channel_image(channel, ratio)
                        if not out.exists():
                            out.parent.mkdir(parents=True, exist_ok=True)
                            compose.channel_image(cover, tuple(spec["size"]), spec["layout"], font_path=font,
                                                  title=title, artist=artist, accent=accent).save(out, optimize=True)
                titled = src_cover.with_name(src_cover.name.replace("_3000", "_title"))
                if not titled.exists():
                    compose.title_cover(cover, font_path=font, title=title, artist=artist,
                                        accent=accent).save(titled, optimize=True)

            await asyncio.to_thread(stills)
            sel_range = note.highlight.selected
            jobs = []
            if not jf.video(f"short_{SHORT_TEMPLATE}").exists():
                jobs.append(render_short(bg=tmp / "short_bg.png", cover=tmp / "cover_s.png",
                                         overlay=tmp / "short_overlay.png", audio=original, start=sel_range.start,
                                         duration=sel_range.end - sel_range.start, accent=accent, tpl=short_tpl,
                                         out=jf.video(f"short_{SHORT_TEMPLATE}")))
            if not jf.video("canvas").exists():
                jobs.append(render_canvas(bg=tmp / "canvas_bg.png", cover=tmp / "cover_c.png", tpl=canvas_tpl,
                                          out=jf.video("canvas")))
            await asyncio.gather(*jobs)
    except AppError as e:
        jf.fail(e.to_dict())
        jf.event("failed", step="render", code=e.code, message=e.message)
        raise
    except Exception as e:
        log.exception("렌더링 중 예상하지 못한 오류")
        err = AppError("INTERNAL", "영상·이미지를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.", True)
        jf.fail(err.to_dict())
        jf.event("failed", step="render", code=err.code, message=repr(e))
        raise err from e
    jf.event("step_end", step="render", sec=round(time.monotonic() - t, 2), ok=True, item=sel["item_id"])
    jf.set_status(Stage.DONE)
