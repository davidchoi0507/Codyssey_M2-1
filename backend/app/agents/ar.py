"""A&R 에이전트: librosa 수치 + Gemini 듣기 결과 → A&R 노트.

LLM은 해석·키워드·색·커버 방향·후보 이유만 쓰고(ARNoteDraft),
수치·파형·후보 구간처럼 측정값은 코드가 그대로 붙인다 — 숫자를 LLM이 다시 쓰지 않게.
"""
import json
import re

from langchain_core.exceptions import OutputParserException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser

from app.adapters.codyssey_llm import chat_model, model_label
from app.analysis.profile import profile_for_prompt
from app.core.config import Settings
from app.core.errors import AppError
from app.prompts import load_prompt
from app.schemas.analysis import Features, Listening
from app.schemas.common import AIGenerated
from app.schemas.note import (ARNote, ARNoteDraft, CoverDirection, Evidence, Highlight,
                              HighlightCandidate, HighlightRange)

_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


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


async def write_note(settings: Settings, *, job_id: str, features: Features, listening: Listening,
                     song: dict, gemini_model: str, version: int = 1,
                     user_correction: str | None = None) -> tuple[ARNote, dict]:
    # 코디세이 프록시는 response_format(json_schema/json_object)·tools를 지원하지 않는다(400 unsupported_feature).
    # → 프롬프트로 JSON 형식을 지시하고 PydanticOutputParser로 파싱·검증한다.
    llm = chat_model(settings)
    parser = PydanticOutputParser(pydantic_object=ARNoteDraft)
    payload = {
        "song": song,
        "audio_feature_profile": profile_for_prompt(features),
        "listening": listening.model_dump(),
    }
    if user_correction:
        payload["user_correction"] = user_correction
    messages = [SystemMessage(load_prompt("ar_note") + "\n\n" + parser.get_format_instructions()),
                HumanMessage(json.dumps(payload, ensure_ascii=False))]

    candidate_ids = {c.id for c in features.highlight_candidates}
    draft, raw, problems = None, None, []
    # 형식이 어긋나면 한 번만 다시 쓰게 한다 (문제 내용을 알려주고)
    for _ in range(2):
        raw = await llm.ainvoke(messages)
        try:
            draft = parser.parse(raw.content)
            problems = _check_draft(draft, candidate_ids)
        except OutputParserException as e:
            draft, problems = None, [f"JSON 형식 오류: {str(e)[:300]}"]
        if not problems:
            break
        messages += [raw, HumanMessage("형식 문제를 고쳐서 다시 써 줘: " + "; ".join(problems))]
    if draft is None or problems:
        raise AppError("NOTE_BAD_OUTPUT", "A&R 노트를 정리하지 못했어요. 다시 시도해 주세요.", True)

    reasons = {r.id: r.reason for r in draft.candidate_reasons}
    rec = next(c for c in features.highlight_candidates if c.id == draft.recommended_id)
    note = ARNote(
        job_id=job_id,
        version=version,
        interpretation=draft.interpretation,
        evidence=Evidence(bpm=features.bpm, key=features.key, energy_change=features.energy_change),
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
        edits_remaining=settings.note_edits_per_job,
        ai_generated=AIGenerated(models=[f"gemini:{gemini_model}", model_label(settings)]),
    )
    usage = getattr(raw, "usage_metadata", None) or {}
    meta = {"model": model_label(settings), "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens")}
    return note, meta
