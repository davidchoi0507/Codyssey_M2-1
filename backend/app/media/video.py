"""ffmpeg 영상: 하이라이트 숏폼(9:16, 소리 반응 파형)과 Spotify Canvas(무음 반복).

정지 레이어(흐린 배경·글자)는 compose.py가 PNG로 만들고, 여기서는 움직임(커버 확대)·파형·오디오만 다룬다.
zoompan은 작은 배율에서 픽셀 단위로 떨리므로 커버를 3배로 키운 뒤 확대한다.
"""
import asyncio
import logging
from pathlib import Path

from app.core.errors import AppError

log = logging.getLogger(__name__)


async def _ffmpeg(args: list[str], what: str) -> None:
    proc = await asyncio.create_subprocess_exec("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args,
                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    if proc.returncode != 0:
        log.error("ffmpeg %s 실패: %s", what, err.decode(errors="replace")[-1500:])
        raise AppError("RENDER_ERROR", f"{what}을 만들지 못했어요. 다시 시도해 주세요.", True)


def _zoom(frames: int, expr: str, size: int) -> str:
    return (f"scale={size * 3}:{size * 3},zoompan=z='{expr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={frames}:s={size}x{size}:fps=30")


async def render_short(*, bg: Path, cover: Path, overlay: Path, audio: Path, start: float, duration: float,
                       accent: tuple[int, int, int], tpl: dict, out: Path) -> None:
    w, h = tpl["size"]
    fps = tpl["fps"]
    frames = round(duration * fps)
    c, wv, fd, v = tpl["cover"], tpl["waveform"], tpl["fade"], tpl["video"]
    color = "0x%02X%02X%02X" % accent
    zoom = f"1+{c['zoom_to'] - 1:.4f}*on/{frames}"  # 15초 동안 1.0 → zoom_to
    graph = ";".join([
        f"[1:v]{_zoom(frames, zoom, c['size'])}[cv]",
        f"[3:a]asplit[a1][a2]",
        f"[a1]showwaves=s={w}x{wv['height']}:mode={wv['mode']}:rate={fps}:colors={color}@0.9,format=rgba[wv]",
        f"[0:v][cv]overlay=x={(w - c['size']) // 2}:y={c['y']}[b1]",
        f"[b1][wv]overlay=x=0:y={wv['y']}:shortest=1[b2]",
        f"[b2][2:v]overlay=0:0,format=yuv420p,fade=t=in:d={fd['in']},fade=t=out:st={duration - fd['out']}:d={fd['out']}[vout]",
        f"[a2]afade=t=in:d={fd['in']},afade=t=out:st={duration - fd['out']}:d={fd['out']}[aout]",
    ])
    out.parent.mkdir(parents=True, exist_ok=True)
    await _ffmpeg([
        "-loop", "1", "-framerate", str(fps), "-i", str(bg),
        "-i", str(cover),
        "-loop", "1", "-framerate", str(fps), "-i", str(overlay),
        "-ss", f"{start:.2f}", "-t", f"{duration:.2f}", "-i", str(audio),
        "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]",
        "-t", f"{duration:.2f}", "-r", str(fps),
        "-c:v", "libx264", "-preset", v["preset"], "-crf", str(v["crf"]), "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", v["audio_bitrate"], "-movflags", "+faststart", str(out),
    ], "숏폼 영상")


async def render_canvas(*, bg: Path, cover: Path, tpl: dict, out: Path) -> None:
    w, h = tpl["size"]
    frames = tpl["duration"] * tpl["fps"]
    c, v = tpl["cover"], tpl["video"]
    zoom = f"1+{c['zoom_peak'] - 1:.4f}*sin(PI*on/{frames})"  # 처음·끝이 1.0 → 반복해도 이음매 없음
    graph = (f"[1:v]{_zoom(frames, zoom, c['size'])}[cv];"
             f"[0:v][cv]overlay=x={(w - c['size']) // 2}:y={(h - c['size']) // 2},format=yuv420p[vout]")
    out.parent.mkdir(parents=True, exist_ok=True)
    await _ffmpeg([
        "-loop", "1", "-framerate", str(tpl["fps"]), "-i", str(bg), "-i", str(cover),
        "-filter_complex", graph, "-map", "[vout]", "-frames:v", str(frames), "-r", str(tpl["fps"]), "-an",
        "-c:v", "libx264", "-preset", v["preset"], "-crf", str(v["crf"]), "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(out),
    ], "Canvas 영상")
