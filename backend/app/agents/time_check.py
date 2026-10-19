"""생성한 글 속 시간 표현 검사 (팀 테스트 P0-1: 45초 곡에 "2분 30초"가 나옴).

글에서 "1:40", "1분 40초", "40초", "100 seconds" 같은 표현을 찾아 초로 바꾸고 곡 길이와 비교한다.
카피라이터·피칭의 check(→ 다시 쓰기)와 repair(→ 그래도 틀리면 그 표현만 지움)에서 쓴다.
"""
import re

from app.analysis.features import fmt_time

_PATTERNS = [
    (re.compile(r"(?<![\d:])(\d{1,2}):([0-5]\d)(?![\d:])"), lambda m: int(m[1]) * 60 + int(m[2])),  # 1:40 (1:1·4:5 같은 비율은 안 걸림)
    (re.compile(r"(\d+)\s*분\s*(\d+)\s*초"), lambda m: int(m[1]) * 60 + int(m[2])),
    (re.compile(r"(\d+)\s*분(?!\s*\d)"), lambda m: int(m[1]) * 60),
    (re.compile(r"(\d+)\s*초"), lambda m: int(m[1])),
    (re.compile(r"(\d+)\s*(?:minutes?|mins?)\b(?:\s*(?:and\s*)?(\d+)\s*(?:seconds?|secs?)\b)?", re.I),
     lambda m: int(m[1]) * 60 + int(m[2] or 0)),
    (re.compile(r"(\d+)\s*(?:seconds?|secs?)\b", re.I), lambda m: int(m[1])),
]
# 지울 때 같이 지울 앞뒤 말 ("around 2:30", "2분 30초쯤", "(at 1:40)")
_LEFT = r"(?:\(\s*)?(?:(?:right\s+)?(?:around|about|at|near|from)\s+|약\s*)?"
_RIGHT = r"(?:\s*(?:쯤|경|부터|께|무렵|즈음)(?:에|의|부터)?)?(?:\s*(?:mark|in))?(?:\s*\))?"
TOLERANCE = 1.0


def find_times(text: str) -> list[tuple[int, int, int]]:
    """(시작, 끝, 초) — 겹치지 않게 앞 패턴(더 구체적인 것) 우선."""
    found: list[tuple[int, int, int]] = []
    for pat, to_sec in _PATTERNS:
        for m in pat.finditer(text):
            if any(a < m.end() and m.start() < b for a, b, _ in found):
                continue
            found.append((m.start(), m.end(), to_sec(m)))
    return sorted(found)


def out_of_range(text: str, duration: float) -> list[int]:
    return [sec for _, _, sec in find_times(text) if sec > duration + TOLERANCE]


def strip_times(text: str, bad: callable) -> str:
    """bad(초)가 참인 시간 표현을 앞뒤 말과 함께 지운다 (다시 써도 틀릴 때 마지막 수단)."""
    for a, b, sec in reversed(find_times(text)):
        if not bad(sec):
            continue
        left = re.search(_LEFT + r"$", text[:a], re.I)
        right = re.match(_RIGHT, text[b:], re.I)
        a2 = left.start() if left and left.group(0) else a
        b2 = b + (right.end() if right else 0)
        text = text[:a2] + text[b2:]
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"^[ \t]+|[ \t]+$", "", text, flags=re.M)
    return re.sub(r" ([,.!?])", r"\1", text)


def time_labels(sec: float) -> dict:
    """프롬프트에 그대로 쓰라고 넘기는 표기 (en "0:24", ko "24초" / "1분 40초")."""
    s = int(round(sec))
    m, r = divmod(s, 60)
    ko = f"{r}초" if m == 0 else (f"{m}분" if r == 0 else f"{m}분 {r}초")
    return {"en": fmt_time(s), "ko": ko}
