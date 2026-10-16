"""체험 피드백 요약 (10/14 회의): 자동 사용 기록 + 마지막 설문을 한 번에 모은다.

scripts/usage_report.py(서버 터미널)와 /admin 페이지(브라우저)가 같은 함수를 쓴다.
체험 = 발매 준비 작업 하나(살아 있는 작업 + 지워진 작업의 metrics_archive) 또는 AI 없이 바로 공개한 곡 하나.
"""
import csv
import io
import json
import statistics
from collections import Counter

from app import db
from app.core.config import get_settings
from app.pipeline import survey, usage
from app.pipeline.jobfiles import JobFiles

# 화면·CSV에 보일 한국어 이름
REACH_LABELS = {"uploaded": "업로드", "note_ready": "A&R 노트 받음", "note_accepted": "노트 수락",
                "cover_selected": "커버 선택", "rendered": "결과물 완성", "downloaded": "ZIP·시트 받음",
                "published": "바로 공개"}
FEATURE_LABELS = {"note_edit": "노트 고치기", "relisten": "다시 듣기", "release_info": "발매 정보 입력",
                  "rights": "권리 자가진단", "regenerate": "다시 만들기", "own_cover": "직접 만든 커버",
                  "check": "유통사 검사", "zip": "ZIP 받기", "sheet": "제출 시트 받기", "community": "커뮤니티 공개",
                  **{k: v.split(" (")[0] for k, v in usage.CLIENT_EVENTS.items()}}


def experiences(since: str = "2000-01-01") -> list[dict]:
    s = get_settings()
    keep = {j.strip() for j in s.keep_job_ids.split(",") if j.strip()}
    out: dict[str, dict] = {}
    archive = s.data_dir / "metrics_archive.jsonl"
    if archive.exists():
        for line in archive.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                if rec["events"] and rec["events"][0]["ts"] >= since:
                    out[rec["job_id"]] = {"id": f"job:{rec['job_id']}", "kind": "release", "created_at": rec["events"][0]["ts"],
                                          "deleted": True, **usage.summarize_events(rec["events"])}
    with db.connect() as conn:
        jobs = [r["job_id"] for r in conn.execute("SELECT job_id FROM jobs WHERE created_at >= ?", (since,))]
        tracks = {r["job_id"]: dict(r) for r in conn.execute("SELECT * FROM tracks WHERE job_id IS NOT NULL")}
        direct = [dict(r) for r in conn.execute("SELECT * FROM tracks WHERE source = 'direct' AND created_at >= ?", (since,))]
    for job_id in jobs:
        if job_id in keep:
            continue
        jf = JobFiles(s.jobs_dir, job_id)
        out[job_id] = {"id": f"job:{job_id}", "kind": "release", "created_at": jf.status()["created_at"],
                       "deleted": False, **usage.summarize_events(jf.events())}
    for job_id, rec in out.items():
        if t := tracks.get(job_id):
            rec["track"] = usage.track_summary(t)
    rows = list(out.values())
    rows += [{"id": f"track:{t['track_id']}", "kind": "community", "created_at": t["created_at"], "reach": "published",
              "deleted": False, "features": [], "track": usage.track_summary(t)} for t in direct]
    with db.connect() as conn:
        answers = {r["subject"]: {"answers": json.loads(r["answers"]), "version": r["version"], "at": r["updated_at"]}
                   for r in conn.execute("SELECT subject, answers, version, updated_at FROM surveys")}
    for r in rows:
        a = answers.get(r["id"])
        r["survey"] = a["answers"] if a else None
        r["survey_at"] = a["at"] if a else None
    return sorted(rows, key=lambda r: r["created_at"])


def summarize(rows: list[dict]) -> dict:
    """숫자 요약 (화면 카드·터미널 출력용). 비율은 n/total로 넘기고 %는 보여 주는 쪽에서 계산한다."""
    rel = [r for r in rows if r["kind"] == "release"]
    reach = Counter(r["reach"] for r in rel)
    funnel = [{"step": step, "label": REACH_LABELS[step], "n": sum(reach[x] for x in usage.REACH[i:])}
              for i, step in enumerate(usage.REACH)]
    feats = Counter(f for r in rel for f in r["features"])
    waits = [r["minutes_to_note"] for r in rel if r.get("minutes_to_note") is not None]
    pub = [r for r in rows if r.get("track")]
    answered = [r for r in rows if r["survey"]]

    questions = []
    for q in survey.QUESTIONS:
        vals = [r["survey"][q["id"]] for r in answered if q["id"] in r["survey"]]
        item = {"id": q["id"], "type": q["type"], "question": q["question"], "n": len(vals)}
        if q["type"] == "choice":
            nums = [int(v) for v in vals if v.isdigit()]
            item["average"] = round(statistics.mean(nums), 2) if nums else None
            c = Counter(vals)
            item["counts"] = [{"label": label, "n": c[k]} for k, label in q["options"].items()]
        elif q["type"] == "matrix":
            item["rows"] = [{"label": label,
                             "counts": [{"label": ol, "n": sum(1 for v in vals if v.get(row) == ok)}
                                        for ok, ol in q["options"].items()]}
                            for row, label in q["rows"].items()]
        else:
            item["answers"] = [{"id": r["id"], "text": r["survey"][q["id"]]} for r in answered if q["id"] in r["survey"]]
        questions.append(item)

    sm = {
        "total": len(rows), "release": len(rel), "community": len(rows) - len(rel),
        "funnel": funnel,
        "stopped_at": [{"label": REACH_LABELS[k], "n": v} for k, v in reach.most_common()],
        "features": [{"label": FEATURE_LABELS.get(k, k), "n": v} for k, v in feats.most_common()],
        "minutes_to_note": {"median": statistics.median(waits), "max": max(waits)} if waits else None,
        "with_failure": sum(1 for r in rel if r.get("failures")),
        "published": len(pub),
        "published_with_reaction": sum(1 for r in pub if r["track"]["reactions"]),
        "published_owner_viewed": sum(1 for r in pub if r["track"]["owner_views"]),
        "survey_answered": len(answered),
        "questions": questions,
    }
    sm["insights"] = insights(sm)
    sm["feature_labels"] = FEATURE_LABELS  # 체험 목록의 기능 id → 이름 (화면용)
    return sm


def _p(n: int, total: int) -> int:
    return round(100 * n / total) if total else 0


def insights(sm: dict) -> list[dict]:
    """숫자에서 바로 읽히는 것을 문장으로 (level: info·good·warn). 판단 기준은 여기 한 곳에서 고친다.

    표본이 적으면 비율이 크게 흔들리므로 '경향'으로만 읽게 먼저 알린다.
    """
    out: list[dict] = []
    rel, total = sm["release"], sm["total"]
    if not total:
        return [{"level": "info", "text": "아직 체험이 없어요. 테스트가 시작되면 여기 요약이 생겨요."}]
    if rel < 10:
        out.append({"level": "info", "text": f"발매 준비 체험이 {rel}건이라 비율이 한두 명에 크게 흔들려요. "
                                             "숫자보다 '어디서 멈췄는지·무슨 말을 했는지' 위주로 보세요."})

    f = sm["funnel"]
    if rel and len(f) > 1:
        drops = [(f[i]["n"] - f[i + 1]["n"], f[i], f[i + 1]) for i in range(len(f) - 1)]
        n, a, b = max(drops, key=lambda d: d[0])
        if n > 0:
            out.append({"level": "warn" if _p(n, a["n"]) >= 30 else "info",
                        "text": f"가장 많이 멈춘 곳: '{a['label']}' → '{b['label']}' 사이 {n}건({_p(n, a['n'])}%). "
                                "이 단계 화면에서 무엇이 막혔는지 체험 목록·자유 답변에서 먼저 찾아보세요."})
        done = f[-1]["n"]
        out.append({"level": "good" if _p(done, rel) >= 50 else "warn",
                    "text": f"끝까지(ZIP·시트 받기) 간 작업은 {done}/{rel}건({_p(done, rel)}%)이에요."})
    if rel and sm["with_failure"]:
        out.append({"level": "warn" if _p(sm["with_failure"], rel) >= 10 else "info",
                    "text": f"실패가 한 번이라도 난 작업 {sm['with_failure']}건({_p(sm['with_failure'], rel)}%) — "
                            "서버 로그(Gemini 혼잡·한도)와 같이 확인하세요."})
    if (w := sm["minutes_to_note"]) and w["median"] > 3:
        out.append({"level": "warn", "text": f"A&R 노트까지 중앙값 {w['median']}분 — 3분이 넘으면 기다리다 떠날 수 있어요."})
    rare = [x["label"] for x in sm["features"] if rel >= 5 and _p(x["n"], rel) < 10]
    if rare:
        out.append({"level": "info", "text": f"거의 안 쓰인 기능: {', '.join(rare[:5])} — 못 찾은 건지 필요 없는 건지 설문 자유 답변과 같이 보세요."})

    ans = sm["survey_answered"]
    if ans:
        if _p(ans, total) < 30:
            out.append({"level": "warn", "text": f"설문 응답률 {_p(ans, total)}%({ans}/{total}) — 답한 사람은 보통 만족도가 "
                                                 "더 높거나 낮은 쪽이라, 설문 평균보다 사용 기록을 더 믿으세요."})
        q = {x["id"]: x for x in sm["questions"]}
        for qid, name in (("satisfaction", "만족도"), ("reuse", "재사용 의향")):
            if (x := q.get(qid)) and x["average"] is not None:
                top = sum(c["n"] for c in x["counts"][3:5])
                out.append({"level": "good" if x["average"] >= 4 else "warn" if x["average"] < 3 else "info",
                            "text": f"{name} 평균 {x['average']}/5 · 4~5점 {top}/{x['n']}명({_p(top, x['n'])}%)."})
        if (a := q.get("assets")) and a["n"]:
            worst = max(a["rows"], key=lambda r: sum(c["n"] for c in r["counts"][2:4]))
            bad = sum(c["n"] for c in worst["counts"][2:4])
            if bad:
                out.append({"level": "warn", "text": f"'많이 고쳐야/쓰기 어려워요'가 가장 많은 자료: {worst['label']} ({bad}명)."})
        if (t := q.get("trust")) and t["n"]:
            unseen = next((c["n"] for c in t["counts"] if c["label"] == "안내를 못 봤어요"), 0)
            if _p(unseen, t["n"]) >= 30:
                out.append({"level": "warn", "text": f"보관·AI 전송 안내를 '못 봤다'는 답이 {unseen}/{t['n']}명 — 동의·안내 문구 위치를 손봐야 해요."})
        texts = sum(x["n"] for x in sm["questions"] if x["type"] == "text")
        if texts:
            out.append({"level": "info", "text": f"자유 답변 {texts}개 — 숫자로 안 보이는 이유가 여기 있어요. 아래 설문 칸에서 전부 읽어 보세요."})
    else:
        out.append({"level": "info", "text": "설문 응답이 아직 없어요. 사용 기록만으로 판단해야 해요."})

    if sm["published"]:
        none = sm["published"] - sm["published_with_reaction"]
        if none:
            out.append({"level": "info", "text": f"공개한 {sm['published']}곡 중 {none}곡은 아직 반응이 없어요 — 듣는 사람이 들어올 길(공유 링크 등)이 필요한지 보세요."})
    return out


def csv_text(rows: list[dict]) -> str:
    """체험 하나 = 한 줄. 엑셀에서 한글이 안 깨지게 BOM을 붙인다."""
    qids = [q["id"] for q in survey.QUESTIONS]
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["id", "kind", "created_at", "deleted", "reach", "features", "distributors", "failures", "retries",
                "regenerations", "note_edits", "minutes_to_note", "minutes_active", "published", "plays", "reactions",
                "owner_views", "survey_at", *qids])
    for r in rows:
        t, sv = r.get("track") or {}, r["survey"] or {}
        w.writerow([r["id"], r["kind"], r["created_at"], r.get("deleted", False), r["reach"], " ".join(r["features"]),
                    " ".join(r.get("distributors", [])), r.get("failures", ""), r.get("retries", ""),
                    r.get("regenerations", ""), r.get("note_edits", ""), r.get("minutes_to_note", ""),
                    r.get("minutes_active", ""), bool(t), t.get("plays", ""), t.get("reactions", ""),
                    t.get("owner_views", ""), r.get("survey_at") or "",
                    *[json.dumps(sv[q], ensure_ascii=False) if isinstance(sv.get(q), dict) else sv.get(q, "")
                      for q in qids]])
    return buf.getvalue()
