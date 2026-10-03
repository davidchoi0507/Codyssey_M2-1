"""LLM 프롬프트에 넣을 수치 요약 (Gemini·A&R 에이전트 공용)."""
from app.schemas.analysis import Features


def profile_for_prompt(f: Features) -> dict:
    """프롬프트용 요약 — 800점 파형 같은 화면용 값은 빼고, 곡선은 5초 단위로 줄인다."""
    ec = f.energy_curve
    return {
        "duration_sec": f.duration_sec,
        "bpm": f.bpm,
        "bpm_alternatives": f.bpm_alternatives,
        "key": f.key,
        "key_confidence": f.key_confidence,
        "loudness_db_mean": f.loudness_db_mean,
        "energy_change": f.energy_change,
        "energy_peak": f.energy_peak,
        "energy_per_5s": [round(sum(ec[i:i + 5]) / len(ec[i:i + 5]), 2) for i in range(0, len(ec), 5)],
        "sections": [s.model_dump() for s in f.sections],
        "highlight_candidates": [c.model_dump() for c in f.highlight_candidates],
    }
