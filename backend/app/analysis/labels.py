"""측정값을 밴드가 읽기 쉬운 표기로 (가벼운 모듈 — API 쪽에서 librosa를 불러오지 않게)."""

# 연주자들이 보통 쓰는 조 이름 (D# major → E♭ major). 측정값은 같고 표기만 바꾼다
_KEY_SPELLING = {"major": {"C#": "D♭", "D#": "E♭", "G#": "A♭", "A#": "B♭"},
                 "minor": {"D#": "E♭", "A#": "B♭"}}


def display_key(key: str) -> str:
    """"D# major" → "E♭ major". 예전에 저장된 값에도 쓴다."""
    parts = key.split()
    if len(parts) != 2:
        return key
    pitch, mode = parts
    return f"{_KEY_SPELLING.get(mode, {}).get(pitch, pitch)} {mode}"


def display_energy(text: str) -> str:
    """예전 저장값의 측정 용어 "RMS" → "에너지"."""
    return text.replace("RMS", "에너지")
