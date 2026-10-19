"""다운로드 링크용 만료 토큰 (HMAC 서명, 표준 라이브러리만 사용).

토큰 = base64url(job_id|상대경로|만료시각) + "." + 서명. 작업 폴더 밖 경로는 만들 수도, 열 수도 없다.
"""
import base64
import hashlib
import hmac
import time

from app.core.errors import AppError


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(secret: str, job_id: str, rel_path: str, ttl_sec: int) -> str:
    payload = f"{job_id}|{rel_path}|{int(time.time()) + ttl_sec}".encode()
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).digest()[:16]
    return f"{_b64(payload)}.{_b64(sig)}"


def read_token(secret: str, token: str) -> tuple[str, str]:
    expired = AppError("LINK_EXPIRED", "다운로드 링크가 만료되었어요. 결과 화면을 새로고침해 주세요.", False,
                       http_status=403)
    try:
        p, s = token.split(".", 1)
        payload, sig = _unb64(p), _unb64(s)
    except ValueError as e:
        raise expired from e
    if not hmac.compare_digest(sig, hmac.new(secret.encode(), payload, hashlib.sha256).digest()[:16]):
        raise expired
    job_id, rel_path, exp = payload.decode().split("|")
    if int(exp) < time.time():
        raise expired
    return job_id, rel_path
