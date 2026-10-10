"""작업 폴더 → API 응답 형식 (상태, 패키지). API와 CLI 내보내기가 같이 쓴다."""
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path

import yaml

from app.core.config import Settings, get_settings
from app.core.stages import ANALYSIS_STEPS, QUEUED_LABEL, STAGE_LABELS, Stage
from app.pipeline.jobfiles import JobFiles
from app.pipeline import release_info, rights
from app.pipeline.release import release_plan, submission_check
from app.pipeline.render import SHORT_TEMPLATE, TEMPLATES, cover_file_or_none
from app.schemas.common import AIGenerated, ErrorInfo
from app.schemas.job import EarlyResult, JobStatus, StepStatus
from app.schemas.package import (CHANNELS, ChannelOut, CoverItem, CoverVersion, EditorialOut, Package, PitchOut,
                                  VideoItem)

_STEP_PROGRESS = {"measure": 0.15, "listen": 0.45, "note": 0.8}
VIDEO_CHANNELS = ("tiktok", "instagram")  # 숏폼(9:16)을 올리는 채널 — 틱톡, 인스타 릴스


def expires_at(job_id: str, created_at: str) -> datetime | None:
    """7일 삭제(scripts/cleanup.py)와 같은 기준. 삭제에서 빼둔 작업(KEEP_JOB_IDS)은 None."""
    s = get_settings()
    if job_id in {j.strip() for j in s.keep_job_ids.split(",")}:
        return None
    return datetime.fromisoformat(created_at) + timedelta(days=s.retention_days)


def job_status(jf: JobFiles, queue_position: int | None = None,
               url_for: Callable[[Path], str] | None = None) -> JobStatus:
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
                     audio_url=url_for(jf.analysis_mp3) if url_for and jf.analysis_mp3.exists() else None,
                     error=ErrorInfo(**st["error"]) if st.get("error") else None,
                     updated_at=datetime.fromisoformat(st["updated_at"]),
                     created_at=datetime.fromisoformat(st["created_at"]),
                     expires_at=expires_at(jf.job_id, st["created_at"]),
                     retries=sum(1 for e in jf.events() if e["event"] == "retry"))


def regen_remaining(settings: Settings, jf: JobFiles, item_id: str, events: list[dict] | None = None) -> int:
    used = sum(1 for e in (events if events is not None else jf.events())
               if e["event"] == "item_regenerated" and e.get("item") == item_id)
    return max(settings.cover_regen_per_job - used, 0)


def build_package(jf: JobFiles, settings: Settings, url_for: Callable[[Path], str],
                  zip_url: str | None = None) -> Package:
    st = jf.status()
    events = jf.events()
    models: set[str] = set()
    for e in events:
        if e.get("model") and e["event"] in ("cover_generated", "visual_meta", "copy_meta", "pitch_meta", "note_meta",
                                            "item_regenerated", "cover_judged", "editorial_meta"):
            models.add(e["model"])
    if jf.listening.exists():
        models.add("gemini:" + jf.read_json(jf.listening)["meta"]["model"])
    sel = jf.read_json(jf.selected_cover) if jf.selected_cover.exists() else None
    requests = {(e["item"], e["v"]): e.get("request") for e in events if e["event"] == "item_regenerated"}

    def link(p: Path) -> str | None:
        return url_for(p) if p.exists() else None

    covers = []
    for item_id, direction_id, path in [(f"cover-{i}", f"c{i}", lambda v, s="", i=i: jf.cover(i, v, s)) for i in (1, 2, 3)]             + [("cover-own", "own", lambda v, s="": jf.own_cover(v, s))]:
        versions = [CoverVersion(v=v, url=url_for(path(v)), url_3000=link(path(v, "_3000")),
                                 url_title=link(path(v, "_title")), request=requests.get((item_id, v)))
                    for v in range(1, (jf.latest_version(path) or 0) + 1)]
        if versions:
            picked = sel is not None and sel["item_id"] == item_id
            covers.append(CoverItem(item_id=item_id, direction_id=direction_id, versions=versions, selected=picked,
                                    selected_v=sel["v"] if picked else None,
                                    regenerate_remaining=0 if item_id == "cover-own"
                                    else regen_remaining(settings, jf, item_id, events)))

    short = jf.video(f"short_{SHORT_TEMPLATE}")
    image_specs = yaml.safe_load((TEMPLATES / "channel_images.yaml").read_text(encoding="utf-8"))
    channels = {}
    for ch in CHANNELS:
        v = jf.latest_version(lambda i: jf.channel_copy(ch, i))
        if v:
            d = jf.read_json(jf.channel_copy(ch, v))
            images = {ratio: url_for(jf.channel_image(ch, ratio)) for ratio in image_specs.get(ch, {})
                      if jf.channel_image(ch, ratio).exists()}
            channels[ch] = ChannelOut(item_id=f"copy-{ch}", text=d["text"], hashtags=d.get("hashtags") or None,
                                      hook=d.get("hook"), images=images or None, v=v,
                                      request=requests.get((f"copy-{ch}", v)),
                                      video=url_for(short) if ch in VIDEO_CHANNELS and short.exists() else None,
                                      regenerate_remaining=regen_remaining(settings, jf, f"copy-{ch}", events))

    pitch = {}
    for lang in ("en", "ko"):
        v = jf.latest_version(lambda i: jf.pitch(lang, i))
        if v:
            d = jf.read_json(jf.pitch(lang, v))
            pitch[lang] = PitchOut(item_id=f"pitch-{lang}", subject=d["subject"], body=d["body"], v=v,
                                   request=requests.get((f"pitch-{lang}", v)),
                                   regenerate_remaining=regen_remaining(settings, jf, f"pitch-{lang}", events))

    videos = []
    for name, kind, template, duration in ((f"short_{SHORT_TEMPLATE}", "short", SHORT_TEMPLATE, settings.highlight_sec),
                                           ("canvas", "canvas", None, settings.canvas_sec)):
        if jf.video(name).exists():
            videos.append(VideoItem(item_id=f"short-{template}" if kind == "short" else "canvas", kind=kind,
                                    template=template, url=url_for(jf.video(name)), duration=duration))

    editorial = None
    ev = jf.latest_version(jf.editorial)
    if ev:
        d = jf.read_json(jf.editorial(ev))
        editorial = EditorialOut(spotify_ko=d["spotify_ko"], spotify_en=d["spotify_en"], dsp_intro_ko=d["dsp_intro_ko"],
                                 tags=d["tags"], v=ev, request=requests.get(("editorial", ev)),
                                 regenerate_remaining=regen_remaining(settings, jf, "editorial", events))

    song = jf.read_json(jf.song)
    duration = float(jf.read_json(jf.features)["duration_sec"]) if jf.features.exists() else 0.0
    info, saved = release_info.load(jf)
    answers = rights.load(jf)
    check = submission_check(jf, song, sel, cover_file_or_none(jf, sel["item_id"], sel["v"]) if sel else None, duration,
                             release_info=release_info.checks(info) if saved else None,
                             rights=rights.evaluate(answers) if answers else None)

    return Package(job_id=jf.job_id, stage=st["stage"], covers=covers, videos=videos, channels=channels, pitch=pitch,
                   zip_url=zip_url if st["stage"] == Stage.DONE else None,
                   ai_generated=AIGenerated(notice="이 결과물은 AI로 생성되었습니다.", models=sorted(models)),
                   editorial=editorial, release_plan=release_plan(song), submission_check=check)
