"""librosa 분석: BPM, 키, 에너지 곡선, 구간, 파형 요약, 하이라이트 후보.

CPU 작업이므로 프로세스 풀에서 `analyze_file`을 호출한다 (인자·반환은 pickle 가능한 값만).
"""
import librosa
import numpy as np

from app.schemas.analysis import Features, HighlightCandidateFeature, Section

SR = 22050
HOP = 512
WAVEFORM_POINTS = 800

# Krumhansl-Schmuckler 키 프로파일
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def fmt_time(sec: float) -> str:
    m, s = divmod(int(round(sec)), 60)
    return f"{m}:{s:02d}"


def _per_second(x: np.ndarray, n_sec: int) -> np.ndarray:
    """프레임 단위 값(마지막 축)을 1초 단위 평균으로."""
    fps = SR / HOP
    cols = []
    for i in range(n_sec):
        a = int(i * fps)
        b = max(int((i + 1) * fps), a + 1)
        cols.append(x[..., a:b].mean(axis=-1))
    return np.stack(cols, axis=-1)


def _norm01(x: np.ndarray) -> np.ndarray:
    lo, hi = float(np.min(x)), float(np.max(x))
    return np.zeros_like(x, dtype=float) if hi - lo < 1e-9 else (x - lo) / (hi - lo)


def _smooth(x: np.ndarray, win: int) -> np.ndarray:
    if win <= 1:
        return x
    k = np.ones(win) / win
    return np.convolve(np.pad(x, (win // 2, win - 1 - win // 2), mode="edge"), k, mode="valid")


def _estimate_key(chroma: np.ndarray) -> tuple[str, float]:
    profile = chroma.mean(axis=1)
    best, best_r, scores = "C major", -2.0, []
    for i in range(12):
        for mode, tmpl in (("major", _MAJOR), ("minor", _MINOR)):
            r = float(np.corrcoef(profile, np.roll(tmpl, i))[0, 1])
            scores.append(r)
            if r > best_r:
                best, best_r = f"{_PITCHES[i]} {mode}", r
    # 신뢰도: 1등과 2등 상관계수 차이 (작으면 나란한조·5도 관계와 헷갈리는 중)
    top2 = sorted(scores, reverse=True)[:2]
    return best, round(float(top2[0] - top2[1]), 3)


def _waveform_peaks(y: np.ndarray, n: int) -> list[float]:
    chunks = np.array_split(np.abs(y), n)
    peaks = np.array([c.max() if len(c) else 0.0 for c in chunks])
    peaks = peaks / (peaks.max() or 1.0)
    return [round(float(p), 3) for p in peaks]


def _energy_change(energy: np.ndarray) -> str:
    """에너지가 가장 크게 오르는 지점: 앞 20초 평균 대비 뒤 20초 평균 비율이 최대인 시점."""
    w = 20
    if len(energy) < 2 * w + 1:
        return "곡이 짧아 에너지 변화를 따로 측정하지 않음"
    best_t, best_ratio = 0, 0.0
    for t in range(w, len(energy) - w):
        ratio = energy[t:t + w].mean() / max(energy[t - w:t].mean(), 1e-6)
        if ratio > best_ratio:
            best_t, best_ratio = t, float(ratio)
    if best_ratio < 1.2:
        return f"뚜렷한 에너지 상승 없이 고르게 유지 (최대 상승 {best_ratio:.1f}배)"
    return f"{fmt_time(best_t)} 이후 RMS 약 {best_ratio:.1f}배"


def _energy_peak(energy: np.ndarray) -> str:
    """최고 에너지 구간: 5초 평활 곡선의 최댓값 주변에서 최댓값의 90% 이상이 이어지는 범위."""
    i = int(np.argmax(energy))
    thr = 0.9 * energy[i]
    a, b = i, i
    while a > 0 and energy[a - 1] >= thr:
        a -= 1
    while b < len(energy) - 1 and energy[b + 1] >= thr:
        b += 1
    return f"{fmt_time(a)}~{fmt_time(b + 1)} 구간이 곡에서 에너지가 가장 높음"


def _sections(chroma_s: np.ndarray, energy: np.ndarray, duration: float) -> list[Section]:
    n = chroma_s.shape[1]
    k = int(np.clip(round(duration / 30), 3, 10))
    if n <= k:
        return [Section(start=0.0, end=round(duration, 1), energy=round(float(energy.mean()), 3))]
    bounds = [int(b) for b in librosa.segment.agglomerative(chroma_s, k)] + [n]
    out = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        if b > a:
            out.append(Section(start=float(a), end=float(min(b, duration)),
                               energy=round(float(energy[a:b].mean()), 3)))
    return out


def _highlights(energy: np.ndarray, repetition: np.ndarray, beats: np.ndarray,
                win: int, duration: float) -> list[HighlightCandidateFeature]:
    """15초 창을 1초씩 이동하며 에너지 + 반복성(후렴 추정) + 상승을 점수화 → 겹치지 않는 상위 3개."""
    n = len(energy)
    if n <= win:
        return [HighlightCandidateFeature(id="h1", start=0.0, end=round(duration, 1), score=1.0, energy=1.0,
                                          repetition=0.0, rise=0.0, reason="곡 전체가 하이라이트 길이보다 짧음")]
    rows = []
    for s in range(0, n - win + 1):
        before = energy[max(0, s - 5):s].mean() if s > 0 else energy[0]
        rows.append((s, energy[s:s + win].mean(), repetition[s:s + win].mean(),
                     max(0.0, energy[s:s + 3].mean() - before)))
    arr = np.array(rows, dtype=float)
    e_n, r_n, rise_n = _norm01(arr[:, 1]), _norm01(arr[:, 2]), _norm01(arr[:, 3])
    score = 0.5 * e_n + 0.3 * r_n + 0.2 * rise_n

    # 후보끼리 최소 2창(30초) 떨어지게 — 바로 이어진 구간 3개는 고르는 의미가 없다.
    # 곡이 짧아 3개가 안 나오면 간격을 1창으로 줄여 한 번 더 채운다.
    picked: list[int] = []
    order = np.argsort(-score)
    for gap in (2 * win, win):
        for idx in order:
            if len(picked) == 3:
                break
            if all(abs(arr[idx, 0] - arr[p, 0]) >= gap for p in picked):
                picked.append(int(idx))
    picked.sort(key=lambda i: arr[i, 0])

    out = []
    for i, idx in enumerate(picked, 1):
        start = float(arr[idx, 0])
        # 박에 맞춰 시작점 보정 (±1초 안의 가장 가까운 박)
        near = beats[np.abs(beats - start) <= 1.0] if len(beats) else beats
        if len(near):
            start = float(near[np.argmin(np.abs(near - start))])
        start = round(max(0.0, min(start, duration - win)), 2)
        e, r, rise = float(e_n[idx]), float(r_n[idx]), float(rise_n[idx])
        top_pct = max(1, int(round(100 * (e_n > e).mean())) or 1)
        parts = [f"에너지 상위 {top_pct}%"]
        if r >= 0.6:
            parts.append("곡 안에서 반복되는 구간(후렴 추정)")
        if rise >= 0.6:
            parts.append("직전보다 에너지가 확 오르는 지점")
        out.append(HighlightCandidateFeature(
            id=f"h{i}", start=start, end=round(start + win, 2), score=round(float(score[idx]), 3),
            energy=round(e, 3), repetition=round(r, 3), rise=round(rise, 3), reason=", ".join(parts),
        ))
    return out


def _summary(bpm: float, duration: float, change: str, peak: str) -> str:
    """진행 화면에 먼저 보여줄 한 줄 (사용자용 — 전문 용어·신뢰도 낮은 키는 뺀다)."""
    parts = [f"{round(bpm)} BPM", fmt_time(duration)]
    if "이후" in change:
        parts.append(change.replace("RMS", "에너지"))
    parts.append(peak.replace(" 구간이 곡에서 에너지가 가장 높음", " 에너지 최고"))
    return " · ".join(parts)


def analyze_file(path: str, highlight_sec: float = 15.0) -> dict:
    y, _ = librosa.load(path, sr=SR, mono=True)
    duration = float(len(y) / SR)
    n_sec = max(1, int(duration))

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)

    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    rms_s = _per_second(rms, n_sec)
    energy = rms_s / (rms_s.max() or 1.0)

    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    key, key_conf = _estimate_key(chroma)
    chroma_s = _per_second(chroma, n_sec)

    # 반복성: 1초 단위 크로마 자기유사도 (±3초 이웃은 제외). librosa는 width < (초 수 - 1) // 2를 요구해서
    # 아주 짧은 곡(CLI는 최소 길이 검사를 건너뛸 수 있음)에서는 이웃 범위를 줄인다.
    width = min(3, (n_sec - 1) // 2 - 1)
    rec = (librosa.segment.recurrence_matrix(chroma_s, mode="affinity", sym=True, width=width) if width >= 1
           else np.zeros((n_sec, n_sec)))
    repetition = _norm01(_smooth(np.asarray(rec).sum(axis=1), 3))

    candidates = _highlights(_smooth(energy, 3), repetition, beats, int(round(highlight_sec)), duration)
    change = _energy_change(_smooth(energy, 5))
    peak = _energy_peak(_smooth(energy, 5))
    loud = float(20 * np.log10(max(float(rms.mean()), 1e-9)))

    return Features(
        duration_sec=round(duration, 2),
        bpm=round(bpm, 1),
        bpm_alternatives=[round(bpm / 2, 1), round(bpm * 2, 1)],
        key=key,
        key_confidence=key_conf,
        loudness_db_mean=round(loud, 1),
        energy_curve=[round(float(v), 3) for v in energy],
        energy_change=change,
        energy_peak=peak,
        sections=_sections(chroma_s, energy, duration),
        waveform=_waveform_peaks(y, WAVEFORM_POINTS),
        highlight_candidates=candidates,
        summary=_summary(bpm, duration, change, peak),
    ).model_dump()
