"""커뮤니티 (DECISIONS #31): 작업의 곡을 공개 목록에 올리고, 듣는 사람의 반응(별점·태그·의견)을 받는다.

- 올린 사람이 고른다: 전곡 공개(full) 또는 하이라이트만(highlight, A&R 노트의 선택 구간) / 의견 공개 또는 비공개.
  비공개여도 올린 사람은 관리 페이지에서 전부 본다.
- 공개 음원·커버는 data/community/<track_id>/ 에 따로 둔다 — 작업 폴더는 7일 뒤 지워져도 곡은 남는다.
  하이라이트만 공개하면 전곡은 이 폴더에 아예 없다 (주소를 알아도 전곡을 못 받게).
- 로그인 없음. 올린 사람은 관리 키(owner key)로 확인한다. 키는 저장하지 않고 track_id의 서명으로 만들므로
  작업이 남아 있는 동안은 작업 화면에서 다시 볼 수 있다.
"""
import base64
import hashlib
import hmac
import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

from app import db
from app.analysis.audio_io import input_args
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline.jobfiles import JobFiles, new_job_id, now_iso
from app.pipeline.limits import _today_start_utc
from app.pipeline import moderation, reports
from app.pipeline.render import cover_file_or_none

CONSENT_VERSION = "community-v1"
TAGS = ["멜로디가 좋아요", "목소리가 좋아요", "가사가 와닿아요", "분위기가 좋아요", "편곡이 좋아요", "또 듣고 싶어요"]
FFMPEG_TIMEOUT_SEC = 180
COVER_PX = 800
FADE_SEC = 0.8
_plays_seen: set[tuple[str, str, str]] = set()  # (접속 IP, track_id, 날짜) — 새로고침으로 재생 수가 늘지 않게


def owner_key(s: Settings, track_id: str) -> str:
    sig = hmac.new(s.download_token_secret.encode(), f"community|{track_id}".encode(), hashlib.sha256).digest()[:18]
    return base64.urlsafe_b64encode(sig).decode()


def check_owner_key(s: Settings, track_id: str, key: str | None) -> None:
    if not key or not hmac.compare_digest(key.strip(), owner_key(s, track_id)):
        raise AppError("OWNER_KEY_MISMATCH", "이 곡을 올린 사람의 관리 링크로 열어 주세요.", False, http_status=403)


def track_dir(s: Settings, track_id: str) -> Path:
    return s.community_dir / track_id


def audio_path(s: Settings, track_id: str) -> Path:
    return track_dir(s, track_id) / "audio.mp3"


def cover_path(s: Settings, track_id: str) -> Path:
    return track_dir(s, track_id) / "cover.jpg"


# ---- 조회 ----

def get_track(track_id: str, *, include_hidden: bool = False) -> dict:
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM tracks WHERE track_id = ?", (track_id,)).fetchone()
    if r is None or (r["status"] != "live" and not include_hidden):
        raise AppError("TRACK_NOT_FOUND", "곡을 찾을 수 없어요. 올린 사람이 내렸을 수 있어요.", False, http_status=404)
    return dict(r)


def track_for_job(job_id: str) -> dict | None:
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM tracks WHERE job_id = ?", (job_id,)).fetchone()
    return dict(r) if r else None


def list_tracks(*, sort: str, genre: str | None, q: str | None, limit: int, offset: int) -> tuple[list[dict], int]:
    where, args = ["status = 'live'"], []
    if genre:
        where.append("genre LIKE ?")
        args.append(f"%{genre}%")
    if q:
        where.append("(title LIKE ? OR artist LIKE ?)")
        args += [f"%{q}%", f"%{q}%"]
    order = {"new": "created_at DESC",
             "popular": "plays + 3 * (SELECT count(*) FROM feedback f WHERE f.track_id = tracks.track_id "
                        "AND f.hidden = 0) DESC, created_at DESC",
             "random": "random()"}[sort]
    cond = " AND ".join(where)
    with db.connect() as conn:
        total = conn.execute(f"SELECT count(*) FROM tracks WHERE {cond}", args).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM tracks WHERE {cond} ORDER BY {order} LIMIT ? OFFSET ?",
                            [*args, limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def feedback_rows(track_id: str, *, include_hidden: bool = False) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM feedback WHERE track_id = ?" + ("" if include_hidden else " AND hidden = 0")
                            + " ORDER BY id DESC", (track_id,)).fetchall()
    return [dict(r) | {"tags": json.loads(r["tags"])} for r in rows]


def stats(track_id: str) -> dict:
    """반응 요약: 수, 평균 별점, 별점 분포, 태그별 수 (숨긴 반응 제외)."""
    rows = feedback_rows(track_id)
    ratings = [r["rating"] for r in rows if r["rating"]]
    tags = {t: 0 for t in TAGS}
    for r in rows:
        for t in r["tags"]:
            if t in tags:
                tags[t] += 1
    return {"reactions": len(rows), "comments": sum(1 for r in rows if r["comment"]),
            "rating_avg": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "rating_count": len(ratings), "rating_dist": {str(i): ratings.count(i) for i in range(1, 6)},
            "tags": tags}


def count_play(track_id: str, client: str) -> int:
    get_track(track_id)
    key = (client, track_id, date.today().isoformat())
    with db.connect() as conn:
        if key not in _plays_seen:
            _plays_seen.add(key)
            conn.execute("UPDATE tracks SET plays = plays + 1 WHERE track_id = ?", (track_id,))
        return conn.execute("SELECT plays FROM tracks WHERE track_id = ?", (track_id,)).fetchone()[0]


# ---- 올리기·바꾸기·내리기 ----

def check_public_text(title: str, artist: str, intro: str | None) -> None:
    """공개되는 글 검사 — 제목·아티스트는 금칙어·광고, 소개는 금칙어만 (자기 SNS·음원 링크는 허용, DECISIONS #32)."""
    moderation.check_text(title, field="곡 제목")
    moderation.check_text(artist, field="아티스트 이름")
    moderation.check_text(intro, field="곡 소개", allow_links=True)


def publish(s: Settings, jf: JobFiles, *, listen_mode: str, comments_public: bool, intro: str | None,
            client: str, band_code: str | None, user_id: str | None = None) -> dict:
    """작업의 곡을 공개한다. 이미 올렸으면 설정만 바꾼다 (공개 방식이 바뀌면 음원을 다시 만든다)."""
    song = jf.read_json(jf.song)
    check_public_text(song.get("title", ""), song.get("artist", ""),
                      intro if intro is not None else song.get("description"))
    if existing := track_for_job(jf.job_id):
        return update(s, existing["track_id"], listen_mode=listen_mode, comments_public=comments_public, intro=intro,
                      jf=jf)
    with db.connect() as conn:
        today = conn.execute("SELECT count(*) FROM tracks WHERE client = ? AND created_at >= ?",
                             (client, _today_start_utc())).fetchone()[0]
    if today >= s.community_daily_publish_per_client:
        raise AppError("DAILY_LIMIT", f"하루에 {s.community_daily_publish_per_client}곡까지 공개할 수 있어요.", False,
                       http_status=429)
    note = _note(jf)
    track_id = new_job_id()
    tdir = track_dir(s, track_id)
    try:
        clip_start, clip_sec = _build_audio(jf, note, listen_mode, audio_path(s, track_id))
        _build_cover(jf, note, cover_path(s, track_id))
        now = now_iso()
        consent = {"version": CONSENT_VERSION, "agreed_at": now,
                   "items": ["자작곡이거나 공개할 권리가 있음", "커뮤니티 공개 (직접 내릴 때까지 보관)",
                             "듣는 사람의 반응 수집"]}
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO tracks (track_id, job_id, title, artist, genre, intro, listen_mode, clip_start, clip_sec, "
                "comments_public, colors, moods, band_code, client, consent, created_at, updated_at, user_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (track_id, jf.job_id, song.get("title", ""), song.get("artist", ""), song.get("genre") or "",
                 (intro if intro is not None else song.get("description")) or "", listen_mode, clip_start, clip_sec,
                 int(comments_public), json.dumps(note.get("colors", []) if note else []),
                 json.dumps(note.get("mood_keywords", []) if note else [], ensure_ascii=False),
                 band_code, client, json.dumps(consent, ensure_ascii=False), now, now, user_id))
    except Exception:
        shutil.rmtree(tdir, ignore_errors=True)
        raise
    jf.event("community_published", track_id=track_id, listen_mode=listen_mode, comments_public=comments_public)
    return get_track(track_id)


def update(s: Settings, track_id: str, *, listen_mode: str | None = None, comments_public: bool | None = None,
           intro: str | None = None, jf: JobFiles | None = None) -> dict:
    t = get_track(track_id)
    sets: dict = {}
    if listen_mode and listen_mode != t["listen_mode"]:
        if jf is None and t["job_id"]:
            from app.api.deps import find_job  # 순환 import 피하기
            try:
                jf = find_job(t["job_id"])
            except AppError:
                jf = None
        if jf is None or jf.find_original() is None:
            raise AppError("SOURCE_GONE", "원본 작업이 7일이 지나 삭제되어 공개 방식을 바꿀 수 없어요. "
                           "곡을 내리고 새로 올려 주세요.", False, http_status=409)
        sets["clip_start"], sets["clip_sec"] = _build_audio(jf, _note(jf), listen_mode, audio_path(s, track_id))
        sets["listen_mode"] = listen_mode
    if comments_public is not None:
        sets["comments_public"] = int(comments_public)
    if intro is not None:
        moderation.check_text(intro, field="곡 소개", allow_links=True)
        sets["intro"] = intro
    if sets:
        sets["updated_at"] = now_iso()
        with db.connect() as conn:
            conn.execute(f"UPDATE tracks SET {', '.join(f'{k} = ?' for k in sets)} WHERE track_id = ?",
                         [*sets.values(), track_id])
    return get_track(track_id)


def remove(s: Settings, track_id: str) -> None:
    """곡·반응·파일을 모두 지운다 (올린 사람이 내릴 때)."""
    with db.connect() as conn:
        conn.execute("DELETE FROM feedback WHERE track_id = ?", (track_id,))
        conn.execute("DELETE FROM tracks WHERE track_id = ?", (track_id,))
    shutil.rmtree(track_dir(s, track_id), ignore_errors=True)


# ---- 반응 ----

def add_feedback(s: Settings, track_id: str, *, rating: int | None, tags: list[str], comment: str | None,
                 nickname: str | None, client: str, form_token: str | None = None, honeypot: str | None = None) -> dict:
    get_track(track_id)
    comment = (comment or "").strip() or None
    nickname = (nickname or "").strip() or None
    tags = [t for t in dict.fromkeys(tags) if t in TAGS]
    if rating is None and not tags and not comment:
        raise AppError("EMPTY_FEEDBACK", "별점·태그·의견 중 하나는 남겨 주세요.", False, http_status=422)
    # 도배·욕설·광고 방지 (DECISIONS #32) — 걸리면 거절하고 이유를 알려 준다
    moderation.check_form(s, form_token, honeypot)
    moderation.check_text(nickname, field="닉네임")
    moderation.check_text(comment, field="한마디")
    moderation.check_meaningful(comment)
    moderation.check_duplicate(client, comment)
    moderation.check_rate(s, client)
    since = _today_start_utc()
    with db.connect() as conn:
        mine = conn.execute("SELECT count(*) FROM feedback WHERE client = ? AND ts >= ?", (client, since)).fetchone()[0]
        mine_here = conn.execute("SELECT count(*) FROM feedback WHERE client = ? AND track_id = ? AND ts >= ?",
                                 (client, track_id, since)).fetchone()[0]
        if mine_here >= s.feedback_daily_per_client_track or mine >= s.feedback_daily_per_client:
            raise AppError("FEEDBACK_LIMIT", "오늘은 반응을 충분히 남겼어요. 내일 다시 들려 주세요.", False, http_status=429)
        cur = conn.execute("INSERT INTO feedback (track_id, ts, nickname, rating, tags, comment, client) "
                           "VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (track_id, now_iso(), nickname, rating,
                            json.dumps(tags, ensure_ascii=False), comment, client))
        fid = cur.lastrowid
    if suspects := moderation.spread_suspects(comment):
        reports.auto_hide_spam(suspects, track_id)
    return next(r for r in feedback_rows(track_id, include_hidden=True) if r["id"] == fid)


def hide_feedback(track_id: str, feedback_id: int, hidden: bool = True) -> None:
    with db.connect() as conn:
        n = conn.execute("UPDATE feedback SET hidden = ? WHERE id = ? AND track_id = ?",
                         (int(hidden), feedback_id, track_id)).rowcount
    if not n:
        raise AppError("FEEDBACK_NOT_FOUND", "반응을 찾을 수 없어요.", False, http_status=404)


# ---- 파일 만들기 ----

def _note(jf: JobFiles) -> dict | None:
    """수락한 노트, 없으면 최신 노트 (하이라이트 구간·색·무드)."""
    v = jf.read_json(jf.accepted)["version"] if jf.accepted.exists() else jf.latest_note_version()
    return jf.read_json(jf.note(v)) if v else None


def _build_audio(jf: JobFiles, note: dict | None, mode: str, out: Path) -> tuple[float | None, float]:
    """공개용 mp3 (192kbps). highlight면 노트의 선택 구간만 잘라 앞뒤를 살짝 줄인다."""
    src = jf.find_original()
    if src is None:
        raise AppError("SOURCE_GONE", "원본 음원이 없어요. 7일이 지나 삭제되었을 수 있어요.", False, http_status=409)
    duration = float(jf.read_json(jf.features)["duration_sec"]) if jf.features.exists() else None
    if mode == "highlight":
        if not note:
            raise AppError("NOTE_REQUIRED", "하이라이트 구간은 A&R 노트가 나온 뒤에 정해져요. 분석이 끝난 뒤 올려 주세요.",
                           False, http_status=409)
        sel = note["highlight"]["selected"]
        start, sec = float(sel["start"]), float(sel["end"]) - float(sel["start"])
        cut = ["-ss", f"{start:.2f}", "-t", f"{sec:.2f}"]
        fade = ["-af", f"afade=t=in:d={FADE_SEC},afade=t=out:st={max(sec - FADE_SEC, 0):.2f}:d={FADE_SEC}"]
    else:
        if duration is None:
            raise AppError("NOT_READY", "곡 분석이 끝난 뒤에 올릴 수 있어요.", True, http_status=409)
        start, sec, cut, fade = None, duration, [], []
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name("audio.part.mp3")
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *cut, *input_args(src), *fade,
            "-map_metadata", "-1", "-vn", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", str(tmp)]
    try:
        subprocess.run(args, check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SEC)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        tmp.unlink(missing_ok=True)
        raise AppError("PUBLISH_ERROR", "공개용 음원을 만들지 못했어요. 다시 시도해 주세요.", True) from e
    tmp.replace(out)
    return start, round(sec, 2)


def _build_cover(jf: JobFiles, note: dict | None, out: Path) -> None:
    """고른 커버 → 첫 번째 AI 커버 → 노트 색 그라데이션 순으로 800px JPEG."""
    src = None
    if jf.selected_cover.exists():
        sel = jf.read_json(jf.selected_cover)
        src = cover_file_or_none(jf, sel["item_id"], sel["v"])
    if src is None:
        v = jf.latest_version(lambda i: cover_file_or_none(jf, "cover-1", i))
        src = cover_file_or_none(jf, "cover-1", v) if v else None
    out.parent.mkdir(parents=True, exist_ok=True)
    if src is not None:
        Image.open(src).convert("RGB").resize((COVER_PX, COVER_PX), Image.LANCZOS).save(out, "JPEG", quality=88)
        return
    colors = (note or {}).get("colors") or ["#2b2d42", "#8d99ae", "#edf2f4"]
    _gradient(colors).save(out, "JPEG", quality=88)


def _gradient(colors: list[str]) -> Image.Image:
    rgb = [tuple(int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) for c in colors[:3]]
    if len(rgb) == 1:
        rgb *= 2
    img = Image.new("RGB", (COVER_PX, COVER_PX))
    draw = ImageDraw.Draw(img)
    seg = (COVER_PX - 1) / (len(rgb) - 1)
    for y in range(COVER_PX):
        i = min(int(y / seg), len(rgb) - 2)
        t = (y - i * seg) / seg
        draw.line([(0, y), (COVER_PX, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(rgb[i], rgb[i + 1])))
    return img


# ---- AI 분석 없이 곡만 바로 공개 (03 기획서 I — 반응만 궁금한 사람) ----

DIRECT_CONSENT_ITEMS = ["자작곡이거나 공개할 권리가 있음", "커뮤니티 공개 (직접 내릴 때까지 보관)", "듣는 사람의 반응 수집"]


def _loudest_window(src: Path, ext: str, sec: float) -> float:
    """에너지가 가장 큰 sec초 구간의 시작 (AI 노트가 없을 때 하이라이트). 8kHz 모노로 디코딩해 1초 단위 RMS."""
    import numpy as np  # 무거운 import는 이 기능을 쓸 때만

    from app.analysis.audio_io import CONVERT_TIMEOUT_SEC, run_ffmpeg
    pcm = run_ffmpeg(["ffmpeg", "-v", "error", *input_args(src, ext), "-ac", "1", "-ar", "8000", "-f", "f32le", "-"],
                     CONVERT_TIMEOUT_SEC, text=False).stdout
    y = np.frombuffer(pcm, dtype=np.float32)
    n = len(y) // 8000
    win = int(sec)
    if n <= win:
        return 0.0
    rms = np.sqrt((y[:n * 8000].reshape(n, 8000) ** 2).mean(axis=1))
    sums = np.convolve(rms, np.ones(win), mode="valid")
    return float(np.argmax(sums))


def _encode(src: Path, ext: str, out: Path, start: float | None, sec: float | None) -> None:
    cut = ["-ss", f"{start:.2f}", "-t", f"{sec:.2f}"] if start is not None and sec is not None else []
    fade = ["-af", f"afade=t=in:d={FADE_SEC},afade=t=out:st={max(sec - FADE_SEC, 0):.2f}:d={FADE_SEC}"] if cut else []
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name("audio.part.mp3")
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *cut, *input_args(src, ext), *fade,
            "-map_metadata", "-1", "-vn", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", str(tmp)]
    try:
        subprocess.run(args, check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SEC)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        tmp.unlink(missing_ok=True)
        raise AppError("PUBLISH_ERROR", "공개용 음원을 만들지 못했어요. 다시 시도해 주세요.", True) from e
    tmp.replace(out)


def _title_colors(title: str) -> list[str]:
    """커버를 안 올렸을 때 그라데이션 색 — 제목마다 다르게, 같은 제목이면 같게."""
    h = int(hashlib.sha256(title.encode()).hexdigest(), 16)
    palettes = [["#1b1f3b", "#53354a", "#e84545"], ["#0b3954", "#087e8b", "#bfd7ea"], ["#2d1e2f", "#c9706b", "#f2d0a4"],
                ["#22223b", "#4a4e69", "#c9ada7"], ["#003049", "#d62828", "#fcbf49"], ["#1d3557", "#457b9d", "#a8dadc"],
                ["#283618", "#606c38", "#dda15e"], ["#3d0066", "#8f00ff", "#ffd6ff"]]
    return palettes[h % len(palettes)]


def publish_direct(s: Settings, src: Path, *, filename: str, title: str, artist: str, genre: str, intro: str,
                   listen_mode: str, clip_start: float | None, comments_public: bool, client: str,
                   user_id: str | None, image: bytes | None) -> dict:
    """업로드한 음원을 AI 분석 없이 바로 공개. 원본은 남기지 않는다 (공개용 mp3·커버만 커뮤니티 폴더에)."""
    from app.analysis.audio_io import check_magic, probe_duration
    from app.pipeline.intake import ALLOWED_EXT

    check_public_text(title, artist, intro)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise AppError("UNSUPPORTED_FORMAT", "mp3나 wav 파일만 올릴 수 있어요.", False)
    check_magic(src, ext)
    duration = probe_duration(src, ext)
    if duration > s.max_duration_sec:
        raise AppError("TOO_LONG", f"{s.max_duration_sec // 60}분 이하 곡만 올릴 수 있어요.", False)
    if round(duration, 1) < s.min_duration_sec:
        raise AppError("TOO_SHORT", f"{s.min_duration_sec}초 이상인 곡만 올릴 수 있어요.", False)
    with db.connect() as conn:
        today = conn.execute("SELECT count(*) FROM tracks WHERE client = ? AND created_at >= ?",
                             (client, _today_start_utc())).fetchone()[0]
    if today >= s.community_daily_publish_per_client:
        raise AppError("DAILY_LIMIT", f"하루에 {s.community_daily_publish_per_client}곡까지 공개할 수 있어요.", False,
                       http_status=429)
    track_id = new_job_id()
    tdir = track_dir(s, track_id)
    sec = s.highlight_sec
    try:
        if listen_mode == "highlight":
            start = clip_start if clip_start is not None else _loudest_window(src, ext, sec)
            start = round(max(0.0, min(start, duration - sec)), 2)
            _encode(src, ext, audio_path(s, track_id), start, sec)
            clip_start, clip_sec = start, sec
        else:
            _encode(src, ext, audio_path(s, track_id), None, None)
            clip_start, clip_sec = None, round(duration, 2)
        colors = _title_colors(title)
        if image:
            _cover_from_upload(image, cover_path(s, track_id))
        else:
            _gradient(colors).save(cover_path(s, track_id), "JPEG", quality=88)
        now = now_iso()
        consent = {"version": CONSENT_VERSION, "agreed_at": now, "items": DIRECT_CONSENT_ITEMS}
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO tracks (track_id, job_id, title, artist, genre, intro, listen_mode, clip_start, clip_sec, "
                "comments_public, colors, moods, band_code, client, consent, created_at, updated_at, user_id, source) "
                "VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?, ?, ?, ?, ?, 'direct')",
                (track_id, title.strip(), artist.strip(), genre.strip(), intro.strip(), listen_mode, clip_start, clip_sec,
                 int(comments_public), json.dumps(colors), client, json.dumps(consent, ensure_ascii=False), now, now,
                 user_id))
    except Exception:
        shutil.rmtree(tdir, ignore_errors=True)
        raise
    return get_track(track_id)


def _cover_from_upload(data: bytes, out: Path) -> None:
    import io

    from PIL import ImageOps
    try:
        im = Image.open(io.BytesIO(data))
        if im.format not in ("JPEG", "PNG"):
            raise ValueError(im.format)
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:  # noqa: BLE001 — 어떤 이유든 이미지로 못 읽으면 같은 안내
        raise AppError("IMAGE_UNREADABLE", "커버 이미지는 jpg·png만 올릴 수 있어요.", False) from e
    if min(im.size) < 300:
        raise AppError("IMAGE_TOO_SMALL", "커버 이미지는 300px 이상이어야 해요.", False)
    ImageOps.fit(im, (COVER_PX, COVER_PX), Image.LANCZOS).save(out, "JPEG", quality=88)
