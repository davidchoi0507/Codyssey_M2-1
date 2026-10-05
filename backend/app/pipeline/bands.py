"""밴드 초대 코드: 밴드마다 코드 하나, 밴드별 하루 업로드 한도 (2026-10-04 사용자 결정, 로그인 대신).

- 화면은 요청 헤더 X-Band-Code 로 코드를 보낸다. 대소문자·하이픈·공백은 구분하지 않는다 (K7QM-3XPA = k7qm3xpa).
- 코드 발급·끄기·한도 변경은 scripts/bands.py (관리자만).
"""
import secrets
from datetime import datetime, timezone

from app import db
from app.core.errors import AppError

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 헷갈리는 0·O·1·I 제외
HEADER = "X-Band-Code"


def normalize(code: str | None) -> str | None:
    if not code:
        return None
    c = "".join(ch for ch in code.upper() if ch.isalnum())
    return c or None


def display(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def find_band(code: str | None) -> dict | None:
    """활성 밴드 또는 None. 코드가 있는데 틀리거나 꺼져 있으면 INVALID_BAND_CODE."""
    c = normalize(code)
    if c is None:
        return None
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM bands WHERE code = ?", (c,)).fetchone()
    if r is None or not r["active"]:
        raise AppError("INVALID_BAND_CODE", "초대 코드를 확인해 주세요. 받은 코드와 다르거나 사용이 끝난 코드예요.", False,
                       http_status=401)
    return dict(r)


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
