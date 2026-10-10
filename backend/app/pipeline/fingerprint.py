"""소리 지문 (Chromaprint): 커뮤니티에 남의 곡·이미 올라온 곡을 올리는 것 막기 (2026-10-10, DECISIONS #40).

- 우리 커뮤니티 안 중복: 공개한 곡마다 원본 전체의 지문(정수 배열)을 저장해 두고, 새로 올릴 때 비교한다.
  하이라이트만 공개한 곡도 원본 전체 지문을 남기므로 다른 구간을 잘라 올려도 잡힌다. 같은 올린 사람(로그인 사용자 또는 같은 접속)은 예외.
- 알려진 곡: AcoustID(MusicBrainz 공개 DB) 조회. 비상업 무료 — ACOUSTID_API_KEY가 있을 때만. 국내 곡은 DB에 적을 수 있다.
지문은 ffmpeg의 chromaprint 출력(개발 Docker 이미지에 포함) 또는 fpcalc로 만든다. 둘 다 없으면 이 검사는 건너뛴다(로그).
비교는 지문 값의 비트 차이 비율(BER) — 같은 녹음이면 0.1 안팎, 다른 곡이면 0.5 근처.
"""
import json
import logging
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import httpx
import numpy as np

from app import db
from app.analysis.audio_io import CONVERT_TIMEOUT_SEC, input_args, run_ffmpeg
from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)
MATCH_BER = 0.25           # 이보다 작으면 같은 녹음으로 본다
MIN_OVERLAP = 70           # 비교할 최소 겹침 (지문 값 약 7.4개/초 → 약 10초)
ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
ACOUSTID_MIN_SCORE = 0.8


def _fpcalc() -> str | None:
    return shutil.which(get_settings().fpcalc_path)


@lru_cache
def _ffmpeg_has_chromaprint() -> bool:
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-muxers"], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    return " chromaprint " in out


def available() -> bool:
    return _ffmpeg_has_chromaprint() or _fpcalc() is not None


def compute(src: Path, ext: str | None = None) -> dict | None:
    """{"raw": [int...], "b64": "AQAA…", "duration": 초}. 도구가 없거나 실패하면 None."""
    try:
        if _ffmpeg_has_chromaprint():
            base = ["ffmpeg", "-hide_banner", "-loglevel", "error", *input_args(src, ext), "-vn"]
            raw = run_ffmpeg([*base, "-f", "chromaprint", "-fp_format", "raw", "-"], CONVERT_TIMEOUT_SEC, text=False).stdout
            b64 = run_ffmpeg([*base, "-f", "chromaprint", "-fp_format", "base64", "-"], CONVERT_TIMEOUT_SEC).stdout.strip()
            dur = float(json.loads(run_ffmpeg(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json",
                                               *input_args(src, ext)], 30).stdout)["format"]["duration"])
            arr = np.frombuffer(raw[: len(raw) // 4 * 4], dtype="<i4").astype(np.int64).tolist()
            return {"raw": arr, "b64": b64, "duration": dur} if arr else None
        if fpcalc := _fpcalc():
            # fpcalc는 파일 형식을 내용으로 판단 — 업로드는 check_magic으로 mp3·wav임을 이미 확인했다
            out = subprocess.run([fpcalc, "-length", "0", "-json", str(src)], capture_output=True, text=True,
                                 timeout=CONVERT_TIMEOUT_SEC, check=True).stdout
            d = json.loads(out)
            raw = subprocess.run([fpcalc, "-length", "0", "-raw", "-json", str(src)], capture_output=True, text=True,
                                 timeout=CONVERT_TIMEOUT_SEC, check=True).stdout
            return {"raw": json.loads(raw)["fingerprint"], "b64": d["fingerprint"], "duration": float(d["duration"])}
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError, OSError) as e:
        log.warning("소리 지문을 만들지 못함: %s", e)
        return None
    log.warning("소리 지문 도구가 없어 중복·알려진 곡 검사를 건너뜀 (ffmpeg chromaprint 또는 fpcalc 필요)")
    return None


# ---- 비교 ----

def _popcount(x: np.ndarray) -> np.ndarray:
    return np.unpackbits(x.astype("<u4").view(np.uint8).reshape(-1, 4), axis=1).sum(axis=1)


def best_ber(a: list[int], b: list[int]) -> float:
    """두 지문에서 가장 잘 맞는 위치의 비트 차이 비율 (0이면 같음, 0.5 근처면 무관). 겹침이 짧으면 1.0."""
    if len(a) < MIN_OVERLAP or len(b) < MIN_OVERLAP:
        return 1.0
    q, t = (np.array(a, dtype=np.int64) & 0xFFFFFFFF, np.array(b, dtype=np.int64) & 0xFFFFFFFF)
    if len(q) > len(t):
        q, t = t, q
    # 후보 위치 찾기: 위쪽 20비트가 같은 값끼리 위치 차이를 투표 (재인코딩해도 위쪽 비트는 잘 유지됨)
    index: dict[int, list[int]] = {}
    for j, v in enumerate((t >> 12).tolist()):
        index.setdefault(v, []).append(j)
    votes: dict[int, int] = {}
    for i, v in enumerate((q >> 12).tolist()):
        for j in index.get(v, ())[:20]:
            votes[j - i] = votes.get(j - i, 0) + 1
    offsets = [o for o, _ in sorted(votes.items(), key=lambda kv: -kv[1])[:5]] or [0]
    best = 1.0
    for off in offsets:
        lo_q, lo_t = max(0, -off), max(0, off)
        n = min(len(q) - lo_q, len(t) - lo_t)
        if n < MIN_OVERLAP:
            continue
        diff = _popcount(q[lo_q:lo_q + n] ^ t[lo_t:lo_t + n])
        best = min(best, float(diff.sum()) / (32 * n))
    return best


def find_duplicate(fp: dict, *, user_id: str | None, client: str) -> dict | None:
    """공개 중인 다른 사람의 곡 가운데 같은 녹음이 있으면 그 곡 {track_id, title, artist, ber}."""
    with db.connect() as conn:
        rows = conn.execute("SELECT f.track_id, f.fp, t.title, t.artist, t.user_id, t.client FROM track_fingerprints f "
                            "JOIN tracks t ON t.track_id = f.track_id WHERE t.status IN ('live', 'reported')").fetchall()
    for r in rows:
        same_owner = (user_id and r["user_id"] == user_id) or (client and r["client"] == client)
        if same_owner:
            continue
        ber = best_ber(fp["raw"], json.loads(r["fp"]))
        if ber < MATCH_BER:
            return {"track_id": r["track_id"], "title": r["title"], "artist": r["artist"], "ber": round(ber, 3)}
    return None


def save(track_id: str, fp: dict) -> None:
    with db.connect() as conn:
        conn.execute("INSERT OR REPLACE INTO track_fingerprints (track_id, fp, duration) VALUES (?, ?, ?)",
                     (track_id, json.dumps(fp["raw"]), fp["duration"]))


def delete(track_id: str) -> None:
    with db.connect() as conn:
        conn.execute("DELETE FROM track_fingerprints WHERE track_id = ?", (track_id,))


# ---- 알려진 곡 (AcoustID) ----

def lookup_known(s: Settings, fp: dict) -> dict | None:
    """AcoustID에서 같은 녹음을 찾으면 {title, artist, score}. 키가 없거나 실패·없음이면 None (공개를 막지 않는다)."""
    if not s.acoustid_api_key or not fp.get("b64"):
        return None
    try:
        r = httpx.post(ACOUSTID_URL, data={"client": s.acoustid_api_key, "meta": "recordings", "format": "json",
                                           "duration": int(fp["duration"]), "fingerprint": fp["b64"]}, timeout=10)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("AcoustID 조회 실패: %s", e)
        return None
    for res in sorted(data.get("results") or [], key=lambda x: -x.get("score", 0)):
        if res.get("score", 0) < ACOUSTID_MIN_SCORE:
            break
        for rec in res.get("recordings") or []:
            if rec.get("title"):
                artists = ", ".join(a.get("name", "") for a in rec.get("artists") or [])
                return {"title": rec["title"], "artist": artists, "score": round(res["score"], 2)}
    return None
