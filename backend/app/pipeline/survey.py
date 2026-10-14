"""마지막 짧은 설문 (10/14 회의): 자동으로 알 수 없는 것만 1분 안에 묻는다.

문항은 아래 QUESTIONS 한 곳에서만 고친다. 문항·선택지를 바꾸면 VERSION 을 올린다 (이미 받은 답과 구분).
scope: all(누구나) | release(발매 준비를 쓴 사람만 — 바로 공개만 한 사람에겐 안 보임)
응답은 작업 하나(job:<id>) 또는 바로 공개한 곡 하나(track:<id>)에 하나. 다시 내면 덮어쓴다.
이름·연락처는 받지 않는다. 응답 때 이용 요약(usage)을 같이 남겨 작업이 지워진 뒤에도 분석할 수 있게 한다.
"""
import json

from app import db
from app.core.errors import AppError
from app.pipeline.jobfiles import now_iso

VERSION = "s1"

_AGREE5 = {"1": "전혀 아니에요", "2": "아니에요", "3": "보통이에요", "4": "그래요", "5": "매우 그래요"}

QUESTIONS: list[dict] = [
    {"id": "satisfaction", "type": "choice", "scope": "all", "required": True,
     "question": "이번 체험, 전반적으로 얼마나 만족하셨나요?",
     "options": {"1": "매우 불만족", "2": "불만족", "3": "보통", "4": "만족", "5": "매우 만족"}},
    {"id": "reuse", "type": "choice", "scope": "all", "required": True,
     "question": "비슷한 작업이 생기면 다시 이용하시겠어요?",
     "options": {"1": "전혀 아니에요", "2": "별로요", "3": "아직 모르겠어요", "4": "아마 그럴 것 같아요",
                 "5": "꼭 다시 쓸래요"}},
    {"id": "ai_note", "type": "choice", "scope": "release", "required": False,
     "question": "AI 해석(A&R 노트)이 곡의 특징을 잘 짚었나요?",
     "options": {**_AGREE5, "unsure": "판단하기 어려워요"}},
    {"id": "assets", "type": "matrix", "scope": "release", "required": False,
     "question": "만들어진 자료를 실제로 쓸 수 있을 것 같나요?",
     "rows": {"cover": "커버 이미지", "short": "숏폼 영상", "copy": "홍보 글", "pitch": "피칭 메일"},
     "options": {"as_is": "그대로 쓸 수 있어요", "minor": "조금 고치면 돼요", "major": "많이 고쳐야 해요",
                 "unusable": "쓰기 어려워요", "unused": "안 봤어요"}},
    {"id": "trust", "type": "choice", "scope": "all", "required": False,
     "question": "음원 보관·삭제, 외부 AI 전송, 공개 범위 안내가 이해하기 쉬웠나요?",
     "options": {**_AGREE5, "unseen": "안내를 못 봤어요"}},
    {"id": "improve", "type": "text", "scope": "all", "required": False, "max_length": 500,
     "question": "가장 먼저 고쳤으면 하는 점 한 가지와 이유 (선택)"},
    {"id": "problems", "type": "text", "scope": "all", "required": False, "max_length": 500,
     "question": "쓰다가 오류나 예상과 다른 동작이 있었다면 알려 주세요 (선택)"},
]


def questions(kind: str) -> list[dict]:
    """kind: release(발매 준비 작업) | community(바로 공개한 곡) — 해당하는 문항만."""
    return [q for q in QUESTIONS if q["scope"] == "all" or (q["scope"] == "release" and kind == "release")]


def clean(kind: str, answers: dict) -> dict:
    """정해진 문항·선택지만 남긴다. 필수 문항이 비면 거절."""
    out: dict = {}
    for q in questions(kind):
        v = answers.get(q["id"])
        if q["type"] == "choice" and isinstance(v, (str, int)) and str(v) in q["options"]:
            out[q["id"]] = str(v)
        elif q["type"] == "matrix" and isinstance(v, dict):
            rows = {r: str(x) for r, x in v.items() if r in q["rows"] and str(x) in q["options"]}
            if rows:
                out[q["id"]] = rows
        elif q["type"] == "text" and isinstance(v, str) and v.strip():
            out[q["id"]] = v.strip()[: q["max_length"]]
        if q["required"] and q["id"] not in out:
            raise AppError("SURVEY_INCOMPLETE", f"'{q['question']}'에 답해 주세요.", False, http_status=422)
    return out


def load(subject: str) -> dict | None:
    with db.connect() as conn:
        r = conn.execute("SELECT * FROM surveys WHERE subject = ?", (subject,)).fetchone()
    if r is None:
        return None
    return {"version": r["version"], "answers": json.loads(r["answers"]), "updated_at": r["updated_at"]}


def save(subject: str, answers: dict, usage: dict) -> dict:
    now = now_iso()
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO surveys (subject, version, answers, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(subject) DO UPDATE SET version = excluded.version, answers = excluded.answers, "
            "context = excluded.context, updated_at = excluded.updated_at",
            (subject, VERSION, json.dumps(answers, ensure_ascii=False), json.dumps(usage, ensure_ascii=False), now, now))
    return load(subject)
