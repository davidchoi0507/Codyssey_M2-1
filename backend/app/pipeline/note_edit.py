"""A&R 노트 수정·다시 듣기 (PATCH /jobs/{id}/note, POST /jobs/{id}/note/relisten).

- 수정할 때마다 새 버전(note_v{n+1}.json)을 만들고 이전 버전은 남긴다. 수락 전(note_ready)에만 고칠 수 있다.
- 한 줄 수정(correction)이 있으면 A&R 에이전트가 해석을 다시 쓰고, 직접 편집한 필드는 그 위에 덮어쓴다.
- 횟수 제한: 수정(PATCH 1회)과 다시 듣기를 합쳐 작업당 NOTE_EDITS_PER_JOB회 (PROJECT_BRIEF). 다시 듣기가 실패하면 되돌려준다.
"""
import logging
import re
import time

from app.adapters.gemini import GeminiListener
from app.agents.ar import write_note
from app.core.config import Settings
from app.core.errors import AppError
from app.core.stages import Stage
from app.pipeline.jobfiles import JobFiles
from app.schemas.analysis import Features, Listening
from app.schemas.note import ARNote, HighlightRange
from app.schemas.requests import NotePatch

log = logging.getLogger(__name__)
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
EDIT_EVENTS = ("note_edited", "relisten_requested")


def edits_remaining(settings: Settings, jf: JobFiles) -> int:
    ev = [e["event"] for e in jf.events()]
    used = sum(ev.count(k) for k in EDIT_EVENTS) - ev.count("relisten_failed")
    return max(settings.note_edits_per_job - used, 0)


def relisten_pending(jf: JobFiles) -> bool:
    """다시 듣기를 요청했는데 끝(relistened/relisten_failed)이 기록되지 않음 — 서버 재시작 복구용."""
    for e in reversed(jf.events()):
        if e["event"] in ("relistened", "relisten_failed"):
            return False
        if e["event"] == "relisten_requested":
            return True
    return False


def latest_note(jf: JobFiles) -> ARNote:
    v = jf.latest_note_version()
    if v is None:
        raise AppError("NOTE_NOT_READY", "아직 A&R 노트가 준비되지 않았어요.", True, http_status=409)
    return ARNote.model_validate(jf.read_json(jf.note(v)))


def ensure_editable(settings: Settings, jf: JobFiles) -> int:
    """고칠 수 있는 상태인지 확인하고 남은 횟수를 돌려준다."""
    if jf.accepted.exists():
        raise AppError("NOTE_LOCKED", "이미 수락한 노트는 고칠 수 없어요.", False, http_status=409)
    if jf.status()["stage"] != Stage.NOTE_READY:
        raise AppError("NOTE_NOT_READY", "노트가 준비된 뒤에 고칠 수 있어요.", True, http_status=409)
    remaining = edits_remaining(settings, jf)
    if remaining <= 0:
        raise AppError("NOTE_EDIT_LIMIT", f"노트 수정·다시 듣기는 작업당 {settings.note_edits_per_job}번까지예요.",
                       False, http_status=429)
    return remaining


def _check_patch(patch: NotePatch, note: ARNote, duration: float, highlight_sec: float) -> None:
    """AI를 부르거나 횟수를 쓰기 전에 형식부터 확인한다."""
    problems = []
    if patch.correction is not None and not patch.correction.strip():
        problems.append("수정 문장이 비어 있어요")
    if patch.correction and len(patch.correction) > 200:
        problems.append("수정 문장은 200자 이내로 써 주세요")
    if patch.mood_keywords is not None and not (1 <= len(patch.mood_keywords) <= 5
                                                and all(0 < len(k.strip()) <= 20 for k in patch.mood_keywords)):
        problems.append("키워드는 1~5개, 각각 20자 이내예요")
    if patch.colors is not None and not (len(patch.colors) == 3 and all(_HEX.match(c) for c in patch.colors)):
        problems.append("색은 #RRGGBB 형식으로 정확히 3개예요")
    if patch.cover_directions is not None:
        ids = {c.id for c in note.cover_directions}
        if not patch.cover_directions or any(c.id not in ids or not c.text.strip() for c in patch.cover_directions):
            problems.append(f"커버 방향 id는 {', '.join(sorted(ids))} 중 하나이고 내용이 있어야 해요")
    if patch.highlight_start is not None and not (0 <= patch.highlight_start <= max(duration - highlight_sec, 0)):
        problems.append(f"하이라이트 시작은 0~{int(max(duration - highlight_sec, 0))}초 사이예요")
    if not patch.model_dump(exclude_none=True):
        problems.append("고칠 내용이 없어요")
    if problems:
        raise AppError("INVALID_NOTE_EDIT", " / ".join(problems), False, http_status=422)


def _keep_user_choices(new: ARNote, old: ARNote) -> ARNote:
    """AI가 노트를 다시 써도 밴드가 직접 고른 하이라이트 구간은 유지한다 (추천 후보와 다르면 직접 고른 것)."""
    rec = next((c for c in old.highlight.candidates if c.id == old.highlight.recommended_id), None)
    picked = old.highlight.selected
    if rec is None or (picked.start, picked.end) == (rec.start, rec.end):
        return new
    return new.model_copy(update={"highlight": new.highlight.model_copy(update={"selected": picked})})


def _apply_direct_edits(note: ARNote, patch: NotePatch, highlight_sec: float) -> ARNote:
    update = {}
    if patch.mood_keywords is not None:
        update["mood_keywords"] = [k.strip() for k in patch.mood_keywords]
    if patch.colors is not None:
        update["colors"] = [c.upper() for c in patch.colors]
    if patch.cover_directions is not None:
        texts = {c.id: c.text.strip() for c in patch.cover_directions}
        update["cover_directions"] = [c.model_copy(update={"text": texts.get(c.id, c.text)})
                                      for c in note.cover_directions]
    if patch.highlight_start is not None:
        start = round(patch.highlight_start, 2)
        update["highlight"] = note.highlight.model_copy(
            update={"selected": HighlightRange(start=start, end=round(start + highlight_sec, 2))})
    return note.model_copy(update=update)


async def edit_note(settings: Settings, jf: JobFiles, patch: NotePatch) -> ARNote:
    remaining = ensure_editable(settings, jf)
    note = latest_note(jf)
    features = Features.model_validate(jf.read_json(jf.features))
    _check_patch(patch, note, features.duration_sec, settings.highlight_sec)
    version = note.version + 1

    if patch.correction:
        saved = jf.read_json(jf.listening)
        t = time.monotonic()
        new, meta = await write_note(
            settings, job_id=jf.job_id, features=features, listening=Listening.model_validate(saved["result"]),
            song=jf.read_json(jf.song), gemini_model=saved["meta"]["model"], version=version,
            user_correction=patch.correction.strip(), previous_interpretation=note.interpretation,
            edits_remaining=remaining - 1)
        jf.event("note_meta", version=version, sec=round(time.monotonic() - t, 2), **meta)
        new = _keep_user_choices(new, note)
    else:
        new = note.model_copy(update={"version": version, "edits_remaining": remaining - 1})

    new = _apply_direct_edits(new, patch, settings.highlight_sec)
    jf.write_json(jf.note(version), new.model_dump())
    if jf.status().get("error"):
        jf.set_status(Stage.NOTE_READY)  # 지난 다시 듣기 실패 표시는 지운다
    jf.event("note_edited", version=version, fields=sorted(patch.model_dump(exclude_none=True)),
             correction=patch.correction)
    return new


async def run_relisten(settings: Settings, jf: JobFiles) -> ARNote:
    """Gemini가 다시 듣고(가사 등 추가 입력 반영) 새 노트 버전을 쓴다. 대기열 자리 안에서 실행된다.

    새 듣기 결과가 나오기 전까지 이전 결과(listening.json)를 지우지 않는다 — 실패하거나 서버가 꺼져도
    이전 노트로 돌아갈 수 있게. 실패하면 횟수를 돌려준다.
    """
    features = Features.model_validate(jf.read_json(jf.features))
    note = latest_note(jf)
    version = note.version + 1
    try:
        jf.set_status(Stage.ANALYZING, step="listen")
        jf.event("step_start", step="listen", relisten=True)
        t = time.monotonic()
        listening, gemini_meta = await GeminiListener(settings).listen(jf.analysis_mp3, features,
                                                                       jf.read_json(jf.song))
        jf.event("step_end", step="listen", sec=round(time.monotonic() - t, 2), ok=True, relisten=True)

        jf.set_status(Stage.ANALYZING, step="note")
        t = time.monotonic()
        # 밴드가 앞서 고친 해석(user_correction)은 다시 들어도 유지한다
        new, llm_meta = await write_note(
            settings, job_id=jf.job_id, features=features, listening=listening, song=jf.read_json(jf.song),
            gemini_model=gemini_meta["model"], version=version, edits_remaining=edits_remaining(settings, jf),
            user_correction=note.user_correction, previous_interpretation=note.interpretation)
        jf.event("note_meta", version=version, sec=round(time.monotonic() - t, 2), **llm_meta)
        new = _keep_user_choices(new, note)
    except AppError as e:
        jf.event("relisten_failed", code=e.code, message=e.message)
        # 이전 노트는 그대로 쓸 수 있으므로 작업은 실패로 두지 않고, 에러만 보여준 채 노트 확인 대기로 돌린다
        jf.set_status(Stage.NOTE_READY, error=e.to_dict())
        raise
    except Exception as e:
        log.exception("다시 듣기 중 예상하지 못한 오류")
        err = AppError("INTERNAL", "다시 듣는 중 문제가 생겼어요. 이전 노트는 그대로 있어요.", True)
        jf.event("relisten_failed", code=err.code, message=repr(e))
        jf.set_status(Stage.NOTE_READY, error=err.to_dict())
        raise err from e

    prev = jf.listening.with_name(f"listening_before_v{version}.json")
    jf.listening.replace(prev)
    jf.write_json(jf.listening, {"result": listening.model_dump(), "meta": gemini_meta})
    jf.write_json(jf.note(version), new.model_dump())
    jf.set_status(Stage.NOTE_READY)
    jf.event("relistened", version=version)
    return new
