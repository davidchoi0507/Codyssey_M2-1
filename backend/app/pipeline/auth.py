"""로그인 (DECISIONS #34): 곡 올리는 사람만 카카오·구글로. 듣는 사람은 로그인 없이 반응한다.

- 받는 정보: 로그인 서비스의 고유 식별값 + 닉네임만 (이메일·프로필 사진은 요청하지 않음 — 동의서 v1.3 제5조 초안).
- 세션: 무작위 토큰. DB에는 sha256만 저장. 같은 주소의 화면은 쿠키(sid, HttpOnly)로, 다른 주소의 화면(팀장 Vercel)은
  로그인 뒤 돌아갈 주소의 #session=… 으로 받아 Authorization: Bearer 헤더로 보낸다.
- 로그인은 '내 곡 모아보기'용이다. 작업·곡 접근 권한은 지금처럼 작업 ID·관리 키로 확인한다 (로그인 없이 올린 곡과 같은 규칙).

OAuth 주소·응답 형식은 2026-10 카카오·구글 공개 문서 기준. 앱 등록 때 콘솔 화면으로 다시 확인한다.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx

from app import db
from app.core.config import Settings
from app.core.errors import AppError
from app.pipeline.jobfiles import new_job_id, now_iso

PROVIDERS = {
    "kakao": {
        "authorize": "https://kauth.kakao.com/oauth/authorize",
        "token": "https://kauth.kakao.com/oauth/token",
        "userinfo": "https://kapi.kakao.com/v2/user/me",
        "scope": "profile_nickname",
    },
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid profile",
    },
}
STATE_TTL_SEC = 600
COOKIE = "sid"
STATE_COOKIE = "oauth_nonce"


def enabled(s: Settings) -> dict[str, bool]:
    return {"kakao": bool(s.kakao_client_id), "google": bool(s.google_client_id and s.google_client_secret),
            "dev": s.auth_dev_login}


def _creds(s: Settings, provider: str) -> tuple[str, str | None]:
    if provider == "kakao" and s.kakao_client_id:
        return s.kakao_client_id, s.kakao_client_secret
    if provider == "google" and s.google_client_id and s.google_client_secret:
        return s.google_client_id, s.google_client_secret
    raise AppError("LOGIN_UNAVAILABLE", "이 로그인은 아직 준비 중이에요. 관리 링크로 이용해 주세요.", False, http_status=503)


def redirect_uri(s: Settings, provider: str) -> str:
    return f"{s.public_base_url.rstrip('/')}/auth/{provider}/callback"


# ---- 돌아갈 주소 (열린 리다이렉트 막기) ----

def safe_next(s: Settings, next_url: str | None) -> str:
    """로그인 뒤 돌아갈 주소. 이 서버의 경로(/...)나 허용한 화면 주소만, 아니면 /studio."""
    if not next_url:
        return "/studio"
    if next_url.startswith("/") and not next_url.startswith("//"):
        return next_url
    u = urlparse(next_url)
    origin = f"{u.scheme}://{u.netloc}"
    return next_url if u.scheme in ("http", "https") and origin in s.auth_origin_list else "/studio"


def is_external(s: Settings, url: str) -> bool:
    return not url.startswith("/") and not url.startswith(s.public_base_url.rstrip("/"))


# ---- state (위조·다른 브라우저에서 이어받기 방지) ----

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _sign(s: Settings, payload: bytes) -> str:
    return _b64(hmac.new(s.download_token_secret.encode(), b"oauth|" + payload, hashlib.sha256).digest()[:16])


def make_state(s: Settings, provider: str, next_url: str) -> tuple[str, str]:
    """(state, nonce). nonce는 쿠키에도 넣어 같은 브라우저인지 확인한다."""
    nonce = secrets.token_urlsafe(16)
    payload = json.dumps({"p": provider, "n": next_url, "x": nonce, "e": int(time.time()) + STATE_TTL_SEC},
                         separators=(",", ":")).encode()
    return f"{_b64(payload)}.{_sign(s, payload)}", nonce


def read_state(s: Settings, state: str, provider: str, nonce_cookie: str | None) -> str:
    bad = AppError("LOGIN_EXPIRED", "로그인 시간이 지났거나 다른 창에서 시작했어요. 다시 로그인해 주세요.", False,
                   http_status=400)
    try:
        p, sig = state.split(".", 1)
        payload = base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))
        d = json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        raise bad from None
    if not hmac.compare_digest(sig, _sign(s, payload)) or d["p"] != provider or d["e"] < time.time():
        raise bad
    if not nonce_cookie or not hmac.compare_digest(nonce_cookie, d["x"]):
        raise bad
    return d["n"]


def authorize_url(s: Settings, provider: str, state: str) -> str:
    client_id, _ = _creds(s, provider)
    cfg = PROVIDERS[provider]
    q = {"client_id": client_id, "redirect_uri": redirect_uri(s, provider), "response_type": "code", "state": state,
         "scope": cfg["scope"]}
    if provider == "google":
        q["prompt"] = "select_account"
    return f"{cfg['authorize']}?{urlencode(q)}"


def fetch_profile(s: Settings, provider: str, code: str) -> tuple[str, str]:
    """code → (고유 식별값, 닉네임). 실패하면 AppError."""
    client_id, secret = _creds(s, provider)
    cfg = PROVIDERS[provider]
    data = {"grant_type": "authorization_code", "client_id": client_id, "redirect_uri": redirect_uri(s, provider),
            "code": code}
    if secret:
        data["client_secret"] = secret
    fail = AppError("LOGIN_FAILED", "로그인 정보를 받지 못했어요. 다시 시도해 주세요.", True, http_status=502)
    try:
        tok = httpx.post(cfg["token"], data=data, timeout=10)
        tok.raise_for_status()
        access = tok.json()["access_token"]
        me = httpx.get(cfg["userinfo"], headers={"Authorization": f"Bearer {access}"}, timeout=10)
        me.raise_for_status()
        info = me.json()
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise fail from e
    if provider == "kakao":
        uid = str(info.get("id") or "")
        nick = ((info.get("kakao_account") or {}).get("profile") or {}).get("nickname") \
            or (info.get("properties") or {}).get("nickname")
    else:
        uid, nick = str(info.get("sub") or ""), info.get("name") or info.get("given_name")
    if not uid:
        raise fail
    return uid, (nick or "음악가").strip()[:20]


# ---- 사용자·세션 ----

def upsert_user(provider: str, uid: str, nickname: str) -> dict:
    now = now_iso()
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM users WHERE provider = ? AND provider_uid = ?", (provider, uid)).fetchone()
        if r:
            conn.execute("UPDATE users SET last_login = ? WHERE user_id = ?", (now, r["user_id"]))
            return dict(r)
        user_id = new_job_id()
        conn.execute("INSERT INTO users (user_id, provider, provider_uid, nickname, created_at, last_login) "
                     "VALUES (?, ?, ?, ?, ?, ?)", (user_id, provider, uid, nickname, now, now))
        return {"user_id": user_id, "provider": provider, "provider_uid": uid, "nickname": nickname,
                "created_at": now, "last_login": now}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(s: Settings, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(timespec="seconds"),))
        conn.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                     (_hash(token), user_id, now.isoformat(timespec="seconds"),
                      (now + timedelta(days=s.session_ttl_days)).isoformat(timespec="seconds")))
    return token


def user_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    with db.connect() as conn:
        r = conn.execute("SELECT u.* FROM sessions s JOIN users u ON u.user_id = s.user_id "
                         "WHERE s.token_hash = ? AND s.expires_at > ?",
                         (_hash(token), now_iso())).fetchone()
    return dict(r) if r else None


def end_session(token: str | None) -> None:
    if token:
        with db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(token),))


def delete_user(user_id: str) -> None:
    """탈퇴: 로그인 정보·세션을 지우고 작업·곡과의 연결만 끊는다 (곡은 관리 링크로 계속 관리·삭제 가능)."""
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("UPDATE jobs SET user_id = NULL WHERE user_id = ?", (user_id,))
        conn.execute("UPDATE tracks SET user_id = NULL WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
