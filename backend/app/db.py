"""SQLite(WAL): 작업 상태·이벤트(지표)·동의 기록 (DECISIONS #9, #10).

결과물(음원·노트·커버 등)은 계속 작업 폴더 data/jobs/<job_id>/ 에 파일로 둔다. 여기는 상태와 기록만.
연결은 호출마다 새로 연다 — 동기 라우트는 스레드풀에서 돌고, 쿼리가 작아서 연결 비용이 문제 되지 않는다.
"""
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id     TEXT PRIMARY KEY,
    stage      TEXT NOT NULL,
    step       TEXT,
    error      TEXT,              -- JSON {code, message, retryable}
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage);

CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id  TEXT NOT NULL,
    ts      TEXT NOT NULL,
    event   TEXT NOT NULL,
    payload TEXT NOT NULL         -- JSON
);
CREATE INDEX IF NOT EXISTS events_job ON events(job_id, id);

CREATE TABLE IF NOT EXISTS bands (
    code        TEXT PRIMARY KEY,  -- 초대 코드 (정규화: 대문자, 하이픈 없음)
    name        TEXT NOT NULL,
    daily_limit INTEGER NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    note        TEXT
);

CREATE TABLE IF NOT EXISTS consents (
    job_id  TEXT PRIMARY KEY,
    record  TEXT NOT NULL         -- JSON (동의 항목, 문구 버전, 시각, Gemini 티어)
);
"""

_initialized: set[Path] = set()


@contextmanager
def connect(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    path = Path(db_path or get_settings().db_path)
    if path not in _initialized:
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        if path not in _initialized:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            _migrate(conn)
            _initialized.add(path)
        conn.execute("PRAGMA busy_timeout=10000")
        with conn:  # 블록이 끝나면 commit, 예외면 rollback
            yield conn
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """나중에 추가한 열. 이미 있으면 그대로."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(jobs)")}
    if "client" not in cols:
        conn.execute("ALTER TABLE jobs ADD COLUMN client TEXT")  # 업로드한 IP — 하루 생성 한도용
        conn.execute("CREATE INDEX IF NOT EXISTS jobs_client ON jobs(client, created_at)")
    if "band_code" not in cols:
        conn.execute("ALTER TABLE jobs ADD COLUMN band_code TEXT")  # 올린 밴드 (초대 코드) — 밴드별 한도·통계
        conn.execute("CREATE INDEX IF NOT EXISTS jobs_band ON jobs(band_code, created_at)")


def import_legacy_files(jobs_dir: Path) -> int:
    """DB 도입 전 작업 폴더의 status.json / events.jsonl / consent.json 을 한 번 옮긴다 (이미 있으면 건너뜀)."""
    if not jobs_dir.exists():
        return 0
    imported = 0
    with connect() as conn:
        known = {r["job_id"] for r in conn.execute("SELECT job_id FROM jobs")}
        for d in sorted(p for p in jobs_dir.iterdir() if p.is_dir() and p.name not in known):
            status_p = d / "status.json"
            if not status_p.exists():
                continue
            st = json.loads(status_p.read_text(encoding="utf-8"))
            events = []
            if (d / "events.jsonl").exists():
                events = [json.loads(line) for line in (d / "events.jsonl").read_text(encoding="utf-8").splitlines()
                          if line.strip()]
            created = events[0]["ts"] if events else st["updated_at"]
            conn.execute("INSERT INTO jobs (job_id, stage, step, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                         (d.name, st["stage"], st.get("step"),
                          json.dumps(st["error"], ensure_ascii=False) if st.get("error") else None,
                          created, st["updated_at"]))
            conn.executemany("INSERT INTO events (job_id, ts, event, payload) VALUES (?, ?, ?, ?)",
                             [(d.name, e.pop("ts"), e.pop("event"), json.dumps(e, ensure_ascii=False))
                              for e in events])
            if (d / "consent.json").exists():
                conn.execute("INSERT OR IGNORE INTO consents VALUES (?, ?)",
                             (d.name, (d / "consent.json").read_text(encoding="utf-8")))
            imported += 1
    return imported
