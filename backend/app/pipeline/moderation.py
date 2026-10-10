"""커뮤니티 도배·욕설·광고 방지 (DECISIONS #32). 걸리면 등록을 거절하고 이유를 알려 준다.

- 금칙어·광고: app/core/moderation_words.txt (팀원 조사로 늘려 가는 목록). 띄어쓰기·특수문자를 끼워 넣은 변형도 잡는다.
- 너무 짧거나 의미 없는 글: 2글자 미만, 자음·모음만, 같은 글자 10번 넘게 반복.
- 속도: 같은 접속은 FEEDBACK_COOLDOWN_SEC에 1개, 1분에 FEEDBACK_BURST_PER_MIN개를 넘으면 BURST_BLOCK_MIN분 차단.
- 같은 말 반복: 같은 접속이 하루 안에 같은 한마디를 다시 쓰면 거절. 여러 접속이 10분 안에 같은 한마디를 쓰면(봇 의심)
  이미 올라간 것까지 숨기고 운영자에게 알린다.
- 매크로: 화면이 받은 1회용 제출 토큰(10분, 화면 연 뒤 3초 이상 지나야 유효) + 사람 눈에 안 보이는 함정 칸(website).
서버 프로세스 하나라 속도·토큰 기록은 메모리로 충분하다 (재시작하면 비워짐).
"""
import base64
import hashlib
import hmac
import re
import secrets
import time
import unicodedata
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from app import db
from app.core.config import Settings
from app.core.errors import AppError

WORDS_FILE = Path(__file__).resolve().parent.parent / "core" / "moderation_words.txt"
_JAMO_ONLY = re.compile(r"^[\sㄱ-ㅎㅏ-ㅣ.,!?~^]+$")
_REPEAT = re.compile(r"(.)\1{9,}")
_URL = re.compile(r"(https?://|www\.|[a-z0-9-]+\.(com|net|kr|io|co|me|ly|gg|xyz|shop|site|link)\b)", re.I)
_PHONE = re.compile(r"(01[016789]|0\d{1,2})[\s.-]?\d{3,4}[\s.-]?\d{4}")
_MESSENGER = re.compile(r"(오픈\s*채팅|오픈톡|open\.kakao|카톡\s*(아이디|id)|텔레?그램|telegram|t\.me/|라인\s*아이디|"
                        r"디엠\s*주세요|dm\s*주세요|@[a-z0-9_.]{3,})", re.I)

_recent: dict[str, deque] = defaultdict(deque)   # 접속 → 최근 등록 시각들
_blocked_until: dict[str, float] = {}
_used_tokens: dict[str, float] = {}              # 쓴 토큰 → 만료 시각 (다시 못 쓰게)


class Rejected(AppError):
    def __init__(self, code: str, message: str, http_status: int = 422):
        super().__init__(code, message, False, http_status=http_status)


# ---- 금칙어 ----

@lru_cache
def _word_lists() -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """(욕설·혐오, 광고, 예외) — 파일의 [abuse] / [ad] / [allow] 구역. 비교는 정규화한 글자끼리.
    예외는 금칙어를 품은 멀쩡한 낱말 (예: 시발점) — 검사 전에 지운다."""
    abuse, ad, allow, cur = [], [], [], None
    for line in WORDS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line in ("[abuse]", "[ad]", "[allow]"):
            cur = {"[abuse]": abuse, "[ad]": ad, "[allow]": allow}[line]
            continue
        if cur is not None:
            cur.append(_squash(line))
    return tuple(w for w in abuse if w), tuple(w for w in ad if w), tuple(w for w in allow if w)


def _squash(text: str) -> str:
    """비교용: 전각→반각, 소문자, 글자·숫자만 남김 ("시 1 발", "씨.발" 같은 끼워 넣기 무력화)."""
    t = unicodedata.normalize("NFKC", text).lower()
    return "".join(ch for ch in t if ch.isalnum())


def check_text(text: str | None, *, field: str, allow_links: bool = False) -> None:
    """금칙어·광고를 찾으면 Rejected. field: 화면에 보일 이름 (예: '한마디')."""
    if not text:
        return
    abuse, ad, allow = _word_lists()
    sq = _squash(text)
    for w in allow:
        sq = sq.replace(w, "")
    if any(w in sq for w in abuse):
        raise Rejected("TEXT_ABUSE", f"{field}에 욕설·비하 표현이 있어 등록할 수 없어요. 고쳐서 다시 남겨 주세요.")
    if not allow_links:
        if _URL.search(text) or _PHONE.search(text) or _MESSENGER.search(text):
            raise Rejected("TEXT_AD", f"{field}에는 링크·연락처·메신저 아이디를 넣을 수 없어요.")
        if any(w in sq for w in ad):
            raise Rejected("TEXT_AD", f"{field}에 광고로 보이는 표현이 있어 등록할 수 없어요.")


def check_meaningful(comment: str | None) -> None:
    """한마디가 너무 짧거나 의미 없는 글이면 Rejected. (별점·태그만 남기는 건 괜찮음)"""
    if comment is None:
        return
    c = comment.strip()
    if len(_squash(c)) < 2:
        raise Rejected("TEXT_TOO_SHORT", "한마디는 두 글자 이상 써 주세요.")
    if _JAMO_ONLY.match(c):
        raise Rejected("TEXT_MEANINGLESS", "자음·모음만으로는 남길 수 없어요. 느낀 점을 짧게라도 써 주세요.")
    if _REPEAT.search(c):
        raise Rejected("TEXT_REPEAT", "같은 글자를 너무 많이 반복했어요.")


# ---- 속도 ----

def check_rate(s: Settings, client: str) -> None:
    """반응 등록 전에 부른다. 통과하면 기록까지 한다."""
    now = time.monotonic()
    if _blocked_until.get(client, 0) > now:
        left = int((_blocked_until[client] - now) // 60) + 1
        raise Rejected("TOO_FAST", f"짧은 시간에 너무 많이 남겼어요. {left}분 뒤에 다시 남겨 주세요.", 429)
    q = _recent[client]
    while q and now - q[0] > 60:
        q.popleft()
    if q and now - q[-1] < s.feedback_cooldown_sec:
        raise Rejected("TOO_FAST", f"반응은 {s.feedback_cooldown_sec}초에 하나씩 남길 수 있어요. 잠시 뒤에 다시 남겨 주세요.", 429)
    if len(q) >= s.feedback_burst_per_min:
        _blocked_until[client] = now + s.burst_block_min * 60
        raise Rejected("TOO_FAST", f"짧은 시간에 너무 많이 남겼어요. {s.burst_block_min}분 뒤에 다시 남겨 주세요.", 429)
    q.append(now)


def reset_memory() -> None:
    """테스트·재시작용."""
    _recent.clear()
    _blocked_until.clear()
    _used_tokens.clear()


# ---- 같은 말 반복 ----

def check_duplicate(client: str, comment: str | None) -> None:
    """같은 접속이 하루 안에 같은 한마디(정규화 기준)를 다시 쓰면 거절."""
    if not comment:
        return
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(timespec="seconds")
    sq = _squash(comment)
    with db.connect() as conn:
        rows = conn.execute("SELECT comment FROM feedback WHERE client = ? AND ts >= ? AND comment IS NOT NULL",
                            (client, since)).fetchall()
    if any(_squash(r["comment"]) == sq for r in rows):
        raise Rejected("TEXT_DUPLICATE", "같은 내용을 이미 남겼어요. 다른 곡에는 그 곡에 맞는 한마디를 남겨 주세요.")


def spread_suspects(comment: str | None, *, minutes: int = 10, distinct: int = 3) -> list[int]:
    """여러 접속이 짧은 시간에 같은 한마디를 남겼으면 그 반응 id들 (봇 의심 → 숨김·알림). 아니면 빈 목록."""
    if not comment or len(_squash(comment)) < 6:  # "좋아요" 같은 짧은 말은 여러 사람이 똑같이 쓸 수 있다
        return []
    since = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat(timespec="seconds")
    sq = _squash(comment)
    with db.connect() as conn:
        rows = conn.execute("SELECT id, comment, client FROM feedback WHERE ts >= ? AND comment IS NOT NULL",
                            (since,)).fetchall()
    same = [r for r in rows if _squash(r["comment"]) == sq]
    return [r["id"] for r in same] if len({r["client"] for r in same}) >= distinct else []


# ---- 매크로: 1회용 제출 토큰 + 함정 칸 ----

def _sign(secret: str, payload: str) -> str:
    return base64.urlsafe_b64encode(hmac.new(secret.encode(), f"form|{payload}".encode(),
                                             hashlib.sha256).digest()[:12]).decode().rstrip("=")


def issue_form_token(s: Settings) -> str:
    payload = f"{int(time.time() * 1000)}.{secrets.token_urlsafe(9)}"
    return f"{payload}.{_sign(s.download_token_secret, payload)}"


def check_form(s: Settings, token: str | None, honeypot: str | None) -> None:
    """함정 칸이 채워졌거나, 토큰이 없거나·위조·만료·재사용·너무 빠르면 Rejected."""
    if honeypot:
        raise Rejected("BOT_SUSPECTED", "자동 등록으로 보여 받지 않았어요. 화면에서 직접 남겨 주세요.")
    if not s.form_token_required:
        return
    bad = Rejected("FORM_EXPIRED", "화면을 연 지 오래됐어요. 새로고침한 뒤 다시 남겨 주세요.")
    try:
        ms, nonce, sig = (token or "").split(".")
        issued = int(ms) / 1000
    except ValueError:
        raise bad from None
    if not hmac.compare_digest(sig, _sign(s.download_token_secret, f"{ms}.{nonce}")):
        raise bad
    now = time.time()
    if now - issued > s.form_token_ttl_sec:
        raise bad
    if now - issued < s.form_min_sec:
        raise Rejected("TOO_FAST", "너무 빨리 제출했어요. 잠시 뒤에 다시 눌러 주세요.", 429)
    for t, exp in list(_used_tokens.items()):
        if exp < now:
            del _used_tokens[t]
    if token in _used_tokens:
        raise bad
    _used_tokens[token] = issued + s.form_token_ttl_sec
