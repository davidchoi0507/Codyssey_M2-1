"""작업 폴더 data/jobs/<job_id>/ 의 경로와 기록 (ARCHITECTURE.md '작업 파일 구조').

결과물은 이 폴더에 파일로, 단계 상태·지표(events)·동의 기록은 SQLite(app/db.py)에 남긴다.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from ulid import ULID

from app import db


def new_job_id() -> str:
    return str(ULID())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobFiles:
    def __init__(self, jobs_dir: Path, job_id: str):
        self.job_id = job_id
        self.root = jobs_dir / job_id

    # 입력
    def find_original(self) -> Path | None:
        found = sorted((self.root / "input").glob("original.*"))
        return found[0] if found else None

    @property
    def analysis_mp3(self) -> Path:
        return self.root / "input" / "analysis.mp3"

    # 분석·노트
    @property
    def features(self) -> Path:
        return self.root / "analysis" / "features.json"

    @property
    def listening(self) -> Path:
        return self.root / "analysis" / "listening.json"

    def note(self, version: int) -> Path:
        return self.root / "note" / f"note_v{version}.json"

    def latest_note_version(self) -> int | None:
        vs = [int(p.stem.split("_v")[1]) for p in (self.root / "note").glob("note_v*.json")]
        return max(vs) if vs else None

    @property
    def accepted(self) -> Path:
        """수락한 노트 버전 (생성은 이 버전 기준)."""
        return self.root / "note" / "accepted.json"

    # 생성 결과
    def cover_prompts(self, version: int) -> Path:
        return self.root / "covers" / f"prompts_v{version}.json"

    def cover(self, idx: int, version: int, suffix: str = "") -> Path:
        """cover_{1..3}_v{n}.png / suffix "_3000" 업스케일 / "_title" 제목 오버레이."""
        return self.root / "covers" / f"cover_{idx}_v{version}{suffix}.png"

    def own_cover(self, version: int, suffix: str = "") -> Path:
        """밴드가 직접 올린 사진 (정사각으로 잘라 3000px). item_id = cover-own."""
        return self.root / "covers" / f"own_v{version}{suffix}.png"

    @property
    def selected_cover(self) -> Path:
        """선택한 커버 {item_id, v, at} — 렌더링 기준."""
        return self.root / "covers" / "selected.json"

    def video(self, name: str) -> Path:
        """short_{template}.mp4 / canvas.mp4"""
        return self.root / "video" / f"{name}.mp4"

    def channel_image(self, channel: str, ratio: str) -> Path:
        return self.root / "channels" / channel / f"image_{ratio.replace(':', 'x')}.png"

    def latest_version(self, path_for_version) -> int | None:
        """path_for_version(v)가 있는 가장 큰 v (재생성으로 버전이 늘어나는 항목용)."""
        v = None
        for i in range(1, 100):
            p = path_for_version(i)
            if p is None or not p.exists():
                break
            v = i
        return v

    def channel_copy(self, channel: str, version: int) -> Path:
        return self.root / "channels" / channel / f"copy_v{version}.json"

    def pitch(self, lang: str, version: int) -> Path:
        return self.root / "pitch" / f"pitch_{lang}_v{version}.json"

    @property
    def song(self) -> Path:
        return self.root / "song.json"

    # 기록
    def write_json(self, path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(path)  # 반쯤 쓴 파일이 남지 않게

    def read_json(self, path: Path):
        return json.loads(path.read_text(encoding="utf-8"))

    def exists(self) -> bool:
        with db.connect() as conn:
            return conn.execute("SELECT 1 FROM jobs WHERE job_id = ?", (self.job_id,)).fetchone() is not None

    def status(self) -> dict:
        """{job_id, stage, step, error, updated_at} — 없는 작업이면 KeyError."""
        with db.connect() as conn:
            r = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (self.job_id,)).fetchone()
        if r is None:
            raise KeyError(self.job_id)
        return {"job_id": r["job_id"], "stage": r["stage"], "step": r["step"],
                "error": json.loads(r["error"]) if r["error"] else None, "updated_at": r["updated_at"]}

    def event(self, event: str, **payload) -> None:
        """지표 자동 기록 (events 테이블)."""
        with db.connect() as conn:
            conn.execute("INSERT INTO events (job_id, ts, event, payload) VALUES (?, ?, ?, ?)",
                         (self.job_id, now_iso(), event, json.dumps(payload, ensure_ascii=False)))

    def events(self) -> list[dict]:
        with db.connect() as conn:
            rows = conn.execute("SELECT ts, event, payload FROM events WHERE job_id = ? ORDER BY id",
                                (self.job_id,)).fetchall()
        return [{"ts": r["ts"], "event": r["event"], **json.loads(r["payload"])} for r in rows]

    def save_consent(self, record: dict) -> None:
        with db.connect() as conn:
            conn.execute("INSERT OR REPLACE INTO consents VALUES (?, ?)",
                         (self.job_id, json.dumps(record, ensure_ascii=False)))

    def fail(self, error: dict) -> None:
        """실패 기록 — 진행 중이던 단계(step)를 남겨서 화면이 어느 단계에서 멈췄는지 보여줄 수 있게."""
        self.set_status("failed", step=self.status()["step"], error=error)

    def set_status(self, stage: str, *, step: str | None = None, error: dict | None = None) -> None:
        now = now_iso()
        err = json.dumps(error, ensure_ascii=False) if error else None
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO jobs (job_id, stage, step, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(job_id) DO UPDATE SET "
                "stage = excluded.stage, step = excluded.step, error = excluded.error, updated_at = excluded.updated_at",
                (self.job_id, str(stage), step, err, now, now))
