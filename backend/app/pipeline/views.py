"""작업 폴더 → API 응답 형식 (상태, 패키지). API와 CLI 내보내기가 같이 쓴다."""
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.core.stages import ANALYSIS_STEPS, QUEUED_LABEL, STAGE_LABELS, Stage
from app.pipeline.jobfiles import JobFiles
from app.schemas.common import AIGenerated, ErrorInfo
from app.schemas.job import EarlyResult, JobStatus, StepStatus
from app.schemas.package import CHANNELS, ChannelOut, CoverItem, CoverVersion, Package

_STEP_PROGRESS = {"measure": 0.15, "listen": 0.45, "note": 0.8}


def job_status(jf: JobFiles, queue_position: int | None = None) -> JobStatus:
    """queue_position: 분석 자리를 기다리는 순번 (JobRunner.queue_position). CLI 내보내기는 None."""
    st = jf.status()
    stage, step = Stage(st["stage"]), st.get("step")
    keys = [k for k, _ in ANALYSIS_STEPS]

    if stage == Stage.UPLOADED:
        done, running, progress = 1, None, 0.05
    elif stage == Stage.ANALYZING and step in keys:
        done, running, progress = keys.index(step), keys.index(step), _STEP_PROGRESS.get(step, 0.1)
    elif stage == Stage.FAILED and step in keys:
        done, running, progress = keys.index(step), None, _STEP_PROGRESS.get(step, 0.1)
    else:  # note_ready 이후 (생성 단계 실패 포함): 분석 단계는 모두 끝남
        done, running, progress = len(keys), None, 1.0

    steps = []
    for i, (key, label) in enumerate(ANALYSIS_STEPS):
        if i < done:
            s = "done"
        elif i == running:
            s = "running"
        elif stage == Stage.FAILED and step == key:
            s = "failed"
        else:
            s = "pending"
        steps.append(StepStatus(key=key, label=label, status=s))

    early = None
    if jf.features.exists():
        f = jf.read_json(jf.features)
        early = EarlyResult(bpm=f["bpm"], duration_sec=f["duration_sec"], waveform=f["waveform"], summary=f["summary"])
    label = dict(ANALYSIS_STEPS).get(step) if stage == Stage.ANALYZING else STAGE_LABELS[stage]
    if queue_position:
        label = QUEUED_LABEL.format(n=queue_position)
    return JobStatus(job_id=jf.job_id, stage=stage, stage_label=label or STAGE_LABELS[stage], progress=progress,
                     queue_position=queue_position, steps=steps, early=early,
                     error=ErrorInfo(**st["error"]) if st.get("error") else None,
                     updated_at=datetime.fromisoformat(st["updated_at"]))


def build_package(jf: JobFiles, settings: Settings, url_for: Callable[[Path], str]) -> Package:
    st = jf.status()
    models: set[str] = set()
    for e in jf.events():
        if e.get("model") and e["event"] in ("cover_generated", "visual_meta", "copy_meta", "note_meta"):
            models.add(e["model"])
    if jf.listening.exists():
        models.add("gemini:" + jf.read_json(jf.listening)["meta"]["model"])

    covers = []
    for idx in (1, 2, 3):
        versions = []
        for v in range(1, 100):
            p = jf.cover(idx, v)
            if not p.exists():
                break
            big, titled = jf.cover(idx, v, "_3000"), jf.cover(idx, v, "_title")
            versions.append(CoverVersion(v=v, url=url_for(p), url_3000=url_for(big) if big.exists() else None,
                                         url_title=url_for(titled) if titled.exists() else None))
        if versions:
            covers.append(CoverItem(item_id=f"cover-{idx}", direction_id=f"c{idx}", versions=versions,
                                    selected=False, regenerate_remaining=settings.cover_regen_per_job))

    channels = {}
    for ch in CHANNELS:
        p = jf.channel_copy(ch, 1)
        if p.exists():
            d = jf.read_json(p)
            channels[ch] = ChannelOut(item_id=f"copy-{ch}", text=d["text"], hashtags=d.get("hashtags") or None,
                                      hook=d.get("hook"), images=None)

    return Package(job_id=jf.job_id, stage=st["stage"], covers=covers, channels=channels,
                   ai_generated=AIGenerated(notice="이 결과물은 AI로 생성되었습니다.", models=sorted(models)))
