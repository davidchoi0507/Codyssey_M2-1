"""A&R 에이전트: librosa 수치 + Gemini 듣기 결과 → A&R 노트.

LLM은 해석·키워드·색·커버 방향·후보 이유만 쓰고(ARNoteDraft),
수치·파형·후보 구간처럼 측정값은 코드가 그대로 붙인다 — 숫자를 LLM이 다시 쓰지 않게.
"""
import re

from app.adapters.codyssey_llm import chat_model, model_label
from app.agents.llm_json import ask_json
from app.analysis.labels import display_energy, display_key
from app.analysis.profile import profile_for_prompt
from app.core.config import Settings
from app.prompts import load_prompt
from app.schemas.analysis import Features, Listening
from app.schemas.common import AIGenerated
from app.schemas.note import (ARNote, ARNoteDraft, CoverDirection, Evidence, Highlight,
                              HighlightCandidate, HighlightRange)

_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
_FORMAL_ENDING = re.compile(r"니다(?=[.!?\s]|$)")  # 합니다체 — 노트 글은 해요체로 통일 (2026-10-08 사용자 요청)


def _check_draft(d: ARNoteDraft, candidate_ids: set[str]) -> list[str]:
    problems = []
    if len(d.mood_keywords) != 5:
        problems.append(f"mood_keywords {len(d.mood_keywords)}개")
    if len(d.colors) != 3 or not all(_HEX.match(c) for c in d.colors):
        problems.append(f"colors 형식 오류 {d.colors}")
    if len(d.cover_directions) != 3:
        problems.append(f"cover_directions {len(d.cover_directions)}개")
    if d.recommended_id not in candidate_ids:
        problems.append(f"recommended_id '{d.recommended_id}'가 후보에 없음")
    if {r.id for r in d.candidate_reasons} != candidate_ids:
        problems.append("candidate_reasons가 후보와 맞지 않음")
    return problems



def _style_problems(d: ARNoteDraft) -> list[str]:
    formal = [t for t in [d.interpretation, *(r.reason for r in d.candidate_reasons)] if _FORMAL_ENDING.search(t)]
    return [f"문장 끝을 해요체(~해요, ~예요)로 통일해야 함 — 합니다체 사용: {formal[0][:40]}"] if formal else []


def _note_check(candidate_ids: set[str]):
    """형식 검사 + 말투 검사. 말투는 첫 답에서만 고쳐 달라고 한다 — 말투 때문에 작업이 실패하지 않게."""
    calls = {"n": 0}

    def check(d: ARNoteDraft) -> list[str]:
        calls["n"] += 1
        return _check_draft(d, candidate_ids) + (_style_problems(d) if calls["n"] == 1 else [])
    return check


def _perceived_bpm(features: Features, listening: Listening) -> float:
    """Gemini가 고른 체감 BPM을 측정값·반/두 배 후보 중 가장 가까운 값으로 맞춘다 (엉뚱한 숫자 방지)."""
    options = [features.bpm, *features.bpm_alternatives]
    if listening.perceived_bpm is None:
        return features.bpm
    return min(options, key=lambda b: abs(b - listening.perceived_bpm))

async def write_note(settings: Settings, *, job_id: str, features: Features, listening: Listening,
                     song: dict, gemini_model: str, version: int = 1,
                     user_correction: str | None = None, previous_interpretation: str | None = None,
                     edits_remaining: int | None = None) -> tuple[ARNote, dict]:
    payload = {
        "song": song,
        "audio_feature_profile": profile_for_prompt(features),
        "listening": listening.model_dump(),
    }
    if user_correction:
        payload["user_correction"] = user_correction
        if previous_interpretation:
            payload["previous_interpretation"] = previous_interpretation
    candidate_ids = {c.id for c in features.highlight_candidates}
    draft, usage = await ask_json(chat_model(settings), load_prompt("ar_note"), payload, ARNoteDraft,
                                  check=_note_check(candidate_ids), what="A&R 노트")

    reasons = {r.id: r.reason for r in draft.candidate_reasons}
    rec = next(c for c in features.highlight_candidates if c.id == draft.recommended_id)
    note = ARNote(
        job_id=job_id,
        version=version,
        interpretation=draft.interpretation,
        evidence=Evidence(bpm=_perceived_bpm(features, listening), bpm_measured=features.bpm,
                          key=display_key(features.key), energy_change=display_energy(features.energy_change)),
        mood_keywords=draft.mood_keywords,
        colors=[c.upper() for c in draft.colors],
        cover_directions=[CoverDirection(id=f"c{i}", text=t) for i, t in enumerate(draft.cover_directions, 1)],
        highlight=Highlight(
            candidates=[HighlightCandidate(id=c.id, start=c.start, end=c.end, reason=reasons[c.id])
                        for c in features.highlight_candidates],
            recommended_id=rec.id,
            selected=HighlightRange(start=rec.start, end=rec.end),
        ),
        waveform=features.waveform,
        user_correction=user_correction,
        genre_heard=listening.genre_feel or None,
        edits_remaining=settings.note_edits_per_job if edits_remaining is None else edits_remaining,
        ai_generated=AIGenerated(models=[f"gemini:{gemini_model}", model_label(settings)]),
    )
    return note, {"model": model_label(settings), **usage}
