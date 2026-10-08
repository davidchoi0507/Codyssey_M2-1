"""결과 화면 동작: 항목 재생성, 직접 올린 사진, ZIP.

- 재생성은 항목 하나만 새 버전으로 만들고 이전 버전은 남긴다 (cover-1~3, copy-<채널>, pitch-<언어>).
  항목마다 COVER_REGEN_PER_JOB회. 요청 한 줄(request)을 반영한다.
- 직접 올린 사진(cover-own)은 정사각으로 잘라 3000px로 저장하고, 커버처럼 골라서 렌더링한다 (AI 생성 아님).
- ZIP은 요청할 때 만든다 (채널별 폴더 + 릴리즈 브리프, AI 생성 표기 포함).
"""
import io
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageOps

from app.adapters.codyssey_image import CodysseyImage
from app.agents.copywriter import write_copy
from app.agents.pitch import write_pitch
from app.analysis.labels import display_energy, display_key
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.media.images import save_png, upscale
from app.pipeline.generate import accepted_note, song_duration
from app.pipeline.jobfiles import JobFiles
from app.pipeline.render import SHORT_TEMPLATE, cover_file
from app.pipeline.views import regen_remaining
from app.schemas.package import CHANNELS, VisualPlan

RESULT_STAGES = (Stage.AWAITING_COVER, Stage.DONE, Stage.FAILED)


def _ensure_results(jf: JobFiles) -> None:
    if not jf.accepted.exists() or jf.status()["stage"] not in RESULT_STAGES:
        raise AppError("NOT_READY", "결과물이 만들어진 뒤에 할 수 있어요.", True, http_status=409)


async def regenerate(settings: Settings, jf: JobFiles, item_id: str, request: str | None) -> None:
    _ensure_results(jf)
    request = (request or "").strip() or None
    if request and len(request) > 200:
        raise AppError("INVALID_REQUEST", "요청은 200자 이내로 써 주세요.", False, http_status=422)
    kind, _, key = item_id.partition("-")
    if not ((kind == "cover" and key in ("1", "2", "3")) or (kind == "copy" and key in CHANNELS)
            or (kind == "pitch" and key in ("en", "ko"))):
        raise AppError("ITEM_NOT_FOUND", "다시 만들 수 없는 항목이에요.", False, http_status=404)
    if regen_remaining(settings, jf, item_id) <= 0:
        raise AppError("REGEN_LIMIT", "이 항목은 더 이상 다시 만들 수 없어요.", False, http_status=429)

    note = accepted_note(jf)
    song = jf.read_json(jf.song)
    t = time.monotonic()
    if kind == "cover":
        idx = int(key)
        plan = VisualPlan.model_validate(jf.read_json(jf.cover_prompts(1)))
        prompt = next(c.prompt for c in plan.covers if c.direction_id == f"c{idx}")
        if request:
            prompt += f"\n\nRevision request from the band (may be Korean, follow it): {request}"
        v = (jf.latest_version(lambda i: jf.cover(idx, i)) or 0) + 1
        png, meta = await CodysseyImage(settings).generate(prompt)
        save_png(png, jf.cover(idx, v))
        upscale(jf.cover(idx, v), jf.cover(idx, v, "_3000"), 3000)
    elif kind == "copy":
        prev_v = jf.latest_version(lambda i: jf.channel_copy(key, i)) or 0
        prev = jf.read_json(jf.channel_copy(key, prev_v))["text"] if prev_v else None
        copyset, meta = await write_copy(settings, note, song, song_duration(jf), request=request, previous=prev)
        v = prev_v + 1
        jf.write_json(jf.channel_copy(key, v), getattr(copyset, key).model_dump())
    else:
        prev_v = jf.latest_version(lambda i: jf.pitch(key, i)) or 0
        prev = jf.read_json(jf.pitch(key, prev_v)) if prev_v else None
        listening = jf.read_json(jf.listening)["result"] if jf.listening.exists() else None
        pitch, meta = await write_pitch(settings, note, song, listening, song_duration(jf), request=request, previous=prev)
        v = prev_v + 1
        jf.write_json(jf.pitch(key, v), getattr(pitch, key).model_dump())
    jf.event("item_regenerated", item=item_id, v=v, request=request, sec=round(time.monotonic() - t, 2),
             **{k: meta[k] for k in ("model",) if k in meta})


MAX_OWN_IMAGE_MB = 20
MAX_OWN_IMAGE_PIXELS = 40_000_000  # 약 6300×6300. 열 때 가로×세로×3바이트를 쓰므로 메모리 상한 역할


def save_own_image(jf: JobFiles, data: bytes) -> int:
    """밴드가 올린 사진 → 정사각 가운데 자르기 → 1024 미리보기 + 3000px. 반환: 버전."""
    _ensure_results(jf)
    if len(data) > MAX_OWN_IMAGE_MB * 1024 * 1024:
        raise AppError("IMAGE_TOO_LARGE", f"사진은 {MAX_OWN_IMAGE_MB}MB 이하만 올릴 수 있어요.", False, http_status=413)
    invalid = AppError("INVALID_IMAGE", "이미지 파일(jpg·png)만 올릴 수 있어요.", False, http_status=422)
    try:
        img = Image.open(io.BytesIO(data))  # 아직 픽셀을 풀지 않음 — 형식·크기만 읽는다
    except Exception as e:
        raise invalid from e
    if img.format not in ("JPEG", "PNG"):
        raise invalid
    if img.width * img.height > MAX_OWN_IMAGE_PIXELS:
        raise AppError("IMAGE_TOO_LARGE", "사진 해상도가 너무 커요. 가로·세로 6000px 이하로 줄여서 올려 주세요.", False,
                       http_status=413)
    try:
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as e:
        raise invalid from e
    if min(img.size) < 800:
        raise AppError("IMAGE_TOO_SMALL", "가로·세로 800px 이상인 사진을 올려 주세요.", False, http_status=422)
    side = min(img.size)
    img = img.crop(((img.width - side) // 2, (img.height - side) // 2,
                    (img.width + side) // 2, (img.height + side) // 2))
    v = (jf.latest_version(lambda i: jf.own_cover(i)) or 0) + 1
    jf.own_cover(v).parent.mkdir(parents=True, exist_ok=True)
    img.resize((1024, 1024), Image.LANCZOS).save(jf.own_cover(v), "PNG")
    img.resize((3000, 3000), Image.LANCZOS).save(jf.own_cover(v, "_3000"), "PNG", optimize=True)
    jf.event("own_image_uploaded", v=v, size=list(img.size))
    return v


def zip_entries(jf: JobFiles, package, models: list[str]) -> tuple[str, list[tuple[str, Path | str]]]:
    """ZIP에 넣을 (폴더 안 경로, 파일 또는 글) 목록과 최상위 폴더 이름. ZIP 만들기와 패키지의 ZIP 정보가 같이 쓴다."""
    if jf.status()["stage"] != Stage.DONE:
        raise AppError("NOT_READY", "커버를 고르고 영상까지 만들어진 뒤에 받을 수 있어요.", True, http_status=409)
    song = jf.read_json(jf.song)
    note = accepted_note(jf)
    sel = jf.read_json(jf.selected_cover)
    prefix = _safe(f"{song.get('artist', '')} - {song.get('title', '')}".strip(" -")) or jf.job_id

    cover = cover_file(jf, sel["item_id"], sel["v"])
    entries: list[tuple[str, Path | str]] = [
        ("cover/cover_3000.png", cover),
        ("cover/cover_3000_title.png", cover.with_name(cover.name.replace("_3000", "_title"))),
        ("video/short_15s.mp4", jf.video(f"short_{SHORT_TEMPLATE}")),
        ("video/spotify_canvas_8s.mp4", jf.video("canvas")),
    ]
    for ch, c in package.channels.items():
        text = c.text + ("\n\n" + " ".join(c.hashtags) if c.hashtags else "")
        if c.hook:
            text = f"[영상 위 훅 문구] {c.hook}\n\n" + text
        if c.video:
            text = "[올릴 영상] video/short_15s.mp4\n\n" + text
        entries.append((f"{ch}/post.txt", text))
        entries += [(f"{ch}/{p.name}", p) for p in sorted((jf.root / "channels" / ch).glob("image_*.png"))]
    for lang, m in package.pitch.items():
        entries.append((f"pitch/pitch_{lang}.txt", f"Subject: {m.subject}\n\n{m.body}"))
    entries.append(("RELEASE_BRIEF.md", _brief(song, note, models)))
    return prefix, [(arc, src) for arc, src in entries if isinstance(src, str) or src.exists()]


def zip_info(jf: JobFiles, package) -> tuple[list[str], int]:
    """패키지 화면용: ZIP에 들어갈 파일 목록과 대략의 용량(바이트, 압축 전)."""
    _, entries = zip_entries(jf, package, package.ai_generated.models)
    size = sum(len(src.encode("utf-8")) if isinstance(src, str) else src.stat().st_size for _, src in entries)
    return [arc for arc, _ in entries], size


def build_zip(jf: JobFiles, package, models: list[str]) -> Path:
    """선택한 커버·영상·채널 글·이미지·피칭 메일 + 릴리즈 브리프를 묶는다. 매번 새로 만든다 (몇 초)."""
    prefix, entries = zip_entries(jf, package, models)
    out = jf.root / "package.zip"
    tmp = out.with_suffix(".zip.tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for arc, src in entries:
            if isinstance(src, str):
                z.writestr(f"{prefix}/{arc}", src)
            else:
                z.write(src, f"{prefix}/{arc}", compress_type=zipfile.ZIP_STORED)  # png·mp4는 이미 압축돼 있음
    tmp.replace(out)
    jf.event("zip_built", size_mb=round(out.stat().st_size / 1024 / 1024, 1))
    return out


def _safe(name: str) -> str:
    return "".join(ch for ch in name if ch not in '\\/:*?"<>|').strip()[:80]


def _brief(song: dict, note, models: list[str]) -> str:
    sel = note.highlight.selected
    lines = [
        f"# {song.get('title', '')} — {song.get('artist', '')}", "",
        "## A&R 노트", note.interpretation, "",
        f"- 무드: {' · '.join(note.mood_keywords)}",
        f"- 색: {' '.join(note.colors)}",
        f"- 근거: {note.evidence.bpm:g} BPM · {display_key(note.evidence.key)} · {display_energy(note.evidence.energy_change)}",
        f"- 하이라이트: {int(sel.start // 60)}:{int(sel.start % 60):02d} ~ {int(sel.end // 60)}:{int(sel.end % 60):02d}",
    ]
    if note.user_correction:
        lines.append(f"- 밴드가 고친 해석: {note.user_correction}")
    lines += ["", "## 들어 있는 것",
              "- cover/ : 발매용 3000px 커버 (글자 없음 / 제목 얹은 버전)",
              "- video/ : 하이라이트 숏폼 15초(9:16), Spotify Canvas 8초(무음 반복)",
              "- instagram/ tiktok/ threads/ x/ : 채널별 글(post.txt)과 이미지",
              "- pitch/ : 큐레이터 피칭 메일 (영어·한국어). [대괄호] 부분은 직접 채워 주세요",
              "", "## AI 생성 표기",
              "이 패키지의 해석·이미지·글은 AI로 생성되었습니다. 플랫폼에 올릴 때 AI 생성 표기 정책을 확인해 주세요.",
              f"사용 모델: {', '.join(models)}", ""]
    return "\n".join(lines)
