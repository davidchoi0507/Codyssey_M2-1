"""화면 개발용 샘플 JSON 내보내기 — 실제 분석 결과를 API 응답 형식(app/schemas)으로 만든다.

  python -m scripts.export_samples <job_id> [<job_id> ...]
  → data/exports/<job_id>/
      note.json                      GET /jobs/{id}/note
      status_1_measuring.json        GET /jobs/{id}  수치 재는 중
      status_2_listening.json        GET /jobs/{id}  곡 듣는 중 (BPM·파형 먼저 나옴)
      status_3_note_ready.json       GET /jobs/{id}  노트 완료
      status_x_failed.json           GET /jobs/{id}  실패 예시 (재시도 가능)
      song.mp3                       하이라이트 미리 듣기용 음원 (브라우저 재생)
"""
import subprocess
import sys
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.stages import ANALYSIS_STEPS, STAGE_LABELS, Stage
from app.pipeline.jobfiles import JobFiles
from app.schemas.job import EarlyResult, JobStatus, StepStatus
from app.schemas.common import ErrorInfo
from app.schemas.note import ARNote


def _steps(done: int, running: int | None, failed: int | None = None) -> list[StepStatus]:
    out = []
    for i, (key, label) in enumerate(ANALYSIS_STEPS):
        status = "done" if i < done else "running" if i == running else "failed" if i == failed else "pending"
        out.append(StepStatus(key=key, label=label, status=status))
    return out


def export(jf: JobFiles, out_root) -> None:
    out = out_root / jf.job_id
    out.mkdir(parents=True, exist_ok=True)
    feats = jf.read_json(jf.features)
    notes = sorted((jf.root / "note").glob("note_v*.json"), key=lambda p: int(p.stem.split("_v")[1]))
    note = ARNote.model_validate(jf.read_json(notes[-1]))
    early = EarlyResult(bpm=feats["bpm"], duration_sec=feats["duration_sec"],
                        waveform=feats["waveform"], summary=feats["summary"])
    t0 = datetime.now(timezone.utc).replace(microsecond=0)

    def status(name: str, stage: Stage, progress: float, steps, early_on: bool, sec: int,
               label: str | None = None, error: ErrorInfo | None = None) -> None:
        s = JobStatus(job_id=jf.job_id, stage=stage, stage_label=label or STAGE_LABELS[stage],
                      progress=progress, queue_position=None, steps=steps,
                      early=early if early_on else None, error=error, updated_at=t0 + timedelta(seconds=sec))
        (out / name).write_text(s.model_dump_json(indent=1), encoding="utf-8")

    status("status_1_measuring.json", Stage.ANALYZING, 0.15, _steps(1, 1), False, 2, label="수치 재는 중")
    status("status_2_listening.json", Stage.ANALYZING, 0.45, _steps(2, 2), True, 12, label="곡을 듣는 중")
    status("status_3_note_ready.json", Stage.NOTE_READY, 1.0, _steps(4, None), True, 35)
    status("status_x_failed.json", Stage.FAILED, 0.45, _steps(2, None, failed=2), True, 40,
           error=ErrorInfo(code="GEMINI_RATE_LIMIT", message="AI가 잠시 바빠요. 잠시 뒤 다시 시도해 주세요.",
                           retryable=True))
    (out / "note.json").write_text(note.model_dump_json(indent=1), encoding="utf-8")

    # 미리 듣기용 mp3 (실서비스에서는 사용자가 올린 원본을 브라우저가 직접 재생)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(jf.find_original()), "-b:a", "192k",
                    str(out / "song.mp3")], check=True)
    print(f"내보냄: {out}")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    settings = get_settings()
    out_root = settings.data_dir / "exports"
    for job_id in sys.argv[1:]:
        jf = JobFiles(settings.jobs_dir, job_id)
        if not jf.note(1).exists():
            print(f"노트가 없는 작업이라 건너뜀: {job_id}", file=sys.stderr)
            continue
        export(jf, out_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
