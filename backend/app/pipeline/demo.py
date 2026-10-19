"""체험 모드 (10/17 팀 결정): 곡 없이도 전체 흐름을 해 볼 수 있게, 예시 곡(201의 AI 곡)으로 작업을 만든다.

- 분석(librosa·Gemini 듣기)과 A&R 노트 v1은 미리 만들어 둔 것(data/demo/)을 복사 → 기다리지 않고 바로 노트.
  run_analysis는 결과 파일이 있으면 단계를 건너뛰므로 그대로 note_ready가 된다.
- 노트 수락 뒤 커버·카피·영상 생성은 실제로 돈다 (체험한 사람이 결과물을 직접 받아 볼 수 있게).
- 커뮤니티 공개는 막는다 (DEMO_NO_PUBLISH) — 예시 곡은 이미 커뮤니티에 올라가 있고, 남의 곡을 올리는 셈이 된다.
- 예시 곡 파일은 커밋하지 않는다(음원 커밋 금지). 서버에서 한 번 만든다:
  python -m scripts.make_demo <예시 곡의 작업 ID>
"""
import os
import shutil

from app import db
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.jobfiles import JobFiles, new_job_id, now_iso

MARKER = "demo.json"  # 작업 폴더에 있으면 체험 작업
_JSON = ("song.json", "features.json", "listening.json", "note_v1.json")


def template_dir(s: Settings):
    return s.data_dir / "demo"


def _template_original(s: Settings):
    found = sorted(template_dir(s).glob("original.*"))
    return found[0] if found else None


def available(s: Settings) -> bool:
    d = template_dir(s)
    return _template_original(s) is not None and (d / "analysis.mp3").exists() and all((d / n).exists() for n in _JSON)


def is_demo(jf: JobFiles) -> bool:
    return (jf.root / MARKER).exists()


def check_not_demo(jf: JobFiles) -> None:
    if is_demo(jf):
        raise AppError("DEMO_NO_PUBLISH", "체험용 예시 곡은 커뮤니티에 올릴 수 없어요. 내 곡을 올리면 공개할 수 있어요.", False,
                       http_status=403)


def _link_or_copy(src, dst) -> None:
    """음원은 읽기만 하므로 하드 링크로 디스크를 아낀다 (작업을 지워도 예시 곡은 남음)."""
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def create_demo_job(s: Settings) -> JobFiles:
    if not available(s):
        raise AppError("DEMO_UNAVAILABLE", "지금은 체험 모드를 준비 중이에요. 잠시 뒤 다시 시도해 주세요.", True, http_status=503)
    src = template_dir(s)
    jf = JobFiles(s.jobs_dir, new_job_id())
    (jf.root / "input").mkdir(parents=True)
    (jf.root / "analysis").mkdir()
    (jf.root / "note").mkdir()
    original = _template_original(s)
    _link_or_copy(original, jf.root / "input" / original.name)
    _link_or_copy(src / "analysis.mp3", jf.analysis_mp3)
    shutil.copy2(src / "song.json", jf.song)
    shutil.copy2(src / "features.json", jf.features)
    shutil.copy2(src / "listening.json", jf.listening)
    note = jf.read_json(src / "note_v1.json")
    note["job_id"] = jf.job_id
    jf.write_json(jf.note(1), note)
    jf.write_json(jf.root / MARKER, {"at": now_iso()})
    # 체험한 사람은 곡을 올리지 않았으므로 자작곡 확약·음원 전송 동의는 해당 없음. 기록만 남긴다
    jf.save_consent({"demo": True, "version": "demo", "at": now_iso(),
                     "service_end_date": s.service_end_date, "retention_mode": s.retention_mode})
    jf.set_status(Stage.UPLOADED)
    with db.connect() as conn:
        conn.execute("UPDATE jobs SET demo = 1 WHERE job_id = ?", (jf.job_id,))
    jf.event("uploaded", source="demo", stored=original.name)
    return jf


def build_template(s: Settings, job_id: str) -> list[str]:
    """이미 노트까지 끝난 작업 → data/demo/. 노트는 AI가 처음 쓴 v1 (수정 횟수는 처음 값으로)."""
    jf = JobFiles(s.jobs_dir, job_id)
    original = jf.find_original()
    missing = [p.name for p in (jf.analysis_mp3, jf.song, jf.features, jf.listening, jf.note(1)) if not p.exists()]
    if original is None or missing:
        raise SystemExit(f"작업 {job_id}에 필요한 파일이 없어요: {missing or '원본 음원'}")
    dst = template_dir(s)
    tmp = dst.with_name("demo.tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    shutil.copy2(original, tmp / original.name)
    for p in (jf.analysis_mp3, jf.song, jf.features, jf.listening):
        shutil.copy2(p, tmp / p.name)
    note = jf.read_json(jf.note(1))
    note.update(user_correction=None, edits_remaining=s.note_edits_per_job)
    jf.write_json(tmp / "note_v1.json", note)
    shutil.rmtree(dst, ignore_errors=True)
    tmp.rename(dst)
    return sorted(p.name for p in dst.iterdir())
