"""작업 폴더 data/jobs/<job_id>/ 의 경로와 기록 (ARCHITECTURE.md '작업 파일 구조').

DB(SQLite)가 붙기 전까지 단계 상태·지표는 이 폴더의 status.json / events.jsonl에 남긴다.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from ulid import ULID


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

    @property
    def song(self) -> Path:
        return self.root / "song.json"

    @property
    def consent(self) -> Path:
        return self.root / "consent.json"

    # 기록
    def write_json(self, path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(path)  # 반쯤 쓴 파일이 남지 않게

    def read_json(self, path: Path):
        return json.loads(path.read_text(encoding="utf-8"))

    def event(self, event: str, **payload) -> None:
        """지표 자동 기록 (나중에 events 테이블로 옮김)."""
        self.root.mkdir(parents=True, exist_ok=True)
        with (self.root / "events.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": now_iso(), "event": event, **payload}, ensure_ascii=False) + "\n")

    def set_status(self, stage: str, *, step: str | None = None, error: dict | None = None) -> None:
        self.write_json(self.root / "status.json",
                        {"job_id": self.job_id, "stage": stage, "step": step, "error": error,
                         "updated_at": now_iso()})
