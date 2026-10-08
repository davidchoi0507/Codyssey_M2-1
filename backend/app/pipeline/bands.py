"""밴드 초대 코드: 밴드마다 코드 하나, 밴드별 하루 업로드 한도 (2026-10-04 사용자 결정, 로그인 대신).

- 화면은 요청 헤더 X-Band-Code 로 코드를 보낸다. 대소문자·하이픈·공백은 구분하지 않는다 (K7QM-3XPA = k7qm3xpa).
- 코드 발급·끄기·한도 변경은 scripts/bands.py (관리자만).
"""
import secrets
import time
from datetime import datetime, timezone

from app import db
from app.core.errors import AppError

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 헷갈리는 0·O·1·I 제외
HEADER = "X-Band-Code"
# 코드 대입 막기: 같은 접속 IP에서 틀린 코드가 이 시간 안에 이만큼 쌓이면 잠시 막는다 (메모리, 재시작하면 비워짐)
FAIL_WINDOW_SEC = 600
MAX_FAILS = 20
_fails: dict[str, list[float]] = {}


def normalize(code: str | None) -> str | None:
    if not code:
        return None
    c = "".join(ch for ch in code.upper() if ch.isalnum())
    return c or None


def display(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def check_attempts(client: str | None) -> None:
    """틀린 코드를 너무 많이 넣은 접속 IP는 잠시 막는다."""
    if not client:
        return
    now = time.monotonic()
    recent = [t for t in _fails.get(client, []) if now - t < FAIL_WINDOW_SEC]
    if recent:
        _fails[client] = recent
    else:
        _fails.pop(client, None)
    if len(recent) >= MAX_FAILS:
        raise AppError("TOO_MANY_ATTEMPTS", "틀린 코드를 너무 많이 입력했어요. 10분 뒤에 다시 시도해 주세요.", True,
                       http_status=429)


def record_fail(client: str | None) -> None:
    if client:
        _fails.setdefault(client, []).append(time.monotonic())


def find_band(code: str | None, client: str | None = None) -> dict | None:
    """활성 밴드 또는 None. 코드가 있는데 틀리거나 꺼져 있으면 INVALID_BAND_CODE.

    client(접속 IP)를 주면 틀린 횟수를 세서 대입 시도를 막는다.
    """
    c = normalize(code)
    if c is None:
        return None
    check_attempts(client)
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM bands WHERE code = ?", (c,)).fetchone()
    if r is None or not r["active"]:
        record_fail(client)
        raise AppError("INVALID_BAND_CODE", "초대 코드를 확인해 주세요. 받은 코드와 다르거나 사용이 끝난 코드예요.", False,
                       http_status=401)
    return dict(r)


def job_band(job_id: str) -> str | None:
    """작업을 올린 밴드의 코드 (코드 없이 올린 작업이면 None)."""
    with db.connect() as conn:
        r = conn.execute("SELECT band_code FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return r["band_code"] if r else None


def used_since(code: str, since_utc_iso: str) -> int:
    with db.connect() as conn:
        return conn.execute("SELECT count(*) FROM jobs WHERE band_code = ? AND created_at >= ?",
                            (code, since_utc_iso)).fetchone()[0]


def job_rows(code: str) -> list[dict]:
    """밴드가 올린 작업 (최근 것부터). 7일이 지나 지워진 작업은 DB에도 없다."""
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT job_id, stage, created_at FROM jobs WHERE band_code = ? ORDER BY created_at DESC", (code,))]


def create_band(name: str, daily_limit: int, note: str | None = None) -> str:
    with db.connect() as conn:
        while True:
            code = new_code()
            if conn.execute("SELECT 1 FROM bands WHERE code = ?", (code,)).fetchone() is None:
                break
        conn.execute("INSERT INTO bands (code, name, daily_limit, active, created_at, note) VALUES (?, ?, ?, 1, ?, ?)",
                     (code, name, daily_limit, datetime.now(timezone.utc).isoformat(timespec="seconds"), note))
    return code
