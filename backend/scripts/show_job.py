"""작업 결과 보기 (개발·품질 확인용 — 서비스 화면 아님).

  python -m scripts.show_job                 # 작업 목록
  python -m scripts.show_job <job_id>        # 요약 출력
  python -m scripts.show_job <job_id> --html # data/jobs/<id>/report.html 생성 (파형·하이라이트 미리 듣기)
"""
import argparse
import html
import json
import sys

from app.core.config import get_settings
from app.pipeline.jobfiles import JobFiles


def fmt(sec: float) -> str:
    m, s = divmod(int(round(sec)), 60)
    return f"{m}:{s:02d}"


def latest_note(jf: JobFiles) -> dict | None:
    v = jf.latest_note_version()
    return jf.read_json(jf.note(v)) if v else None


def list_jobs(settings) -> None:
    if not settings.jobs_dir.exists():
        print("작업이 없어요.")
        return
    for d in sorted(settings.jobs_dir.iterdir()):
        jf = JobFiles(settings.jobs_dir, d.name)
        status = jf.status() if jf.exists() else {}
        song = jf.read_json(jf.song) if jf.song.exists() else {}
        print(f"{d.name}  {status.get('stage', '?'):12} {song.get('title', '')} / {song.get('artist', '')}")


def print_summary(jf: JobFiles) -> None:
    song = jf.read_json(jf.song)
    status = jf.status()
    print(f"■ {song['title']} / {song['artist']}   [{status['stage']}]  {jf.job_id}")
    if status.get("error"):
        print("  에러:", status["error"])
    if jf.features.exists():
        f = jf.read_json(jf.features)
        print(f"\n[수치] {f['summary']}  (키 신뢰도 {f['key_confidence']})")
        for c in f["highlight_candidates"]:
            print(f"  {c['id']} {fmt(c['start'])}~{fmt(c['end'])}  점수 {c['score']}  {c['reason']}")
    if jf.listening.exists():
        lr = jf.read_json(jf.listening)["result"]
        print(f"\n[듣기] {lr['overall_impression']}")
        print(f"  악기: {', '.join(lr['instrumentation'])}")
        print(f"  보컬: {lr['vocal_texture']}")
        print(f"  가사: {lr['lyrics_gist']}")
        for e in lr["emotional_arc"]:
            print(f"  {fmt(e['start'])}~{fmt(e['end'])} {e['emotion']}")
    note = latest_note(jf)
    if note:
        print(f"\n[A&R 노트 v{note['version']}]")
        print(f"  해석: {note['interpretation']}")
        print(f"  키워드: {' · '.join(note['mood_keywords'])}")
        print(f"  색: {' '.join(note['colors'])}")
        for c in note["cover_directions"]:
            print(f"  커버 {c['id']}: {c['text']}")
        rec = note["highlight"]["recommended_id"]
        for c in note["highlight"]["candidates"]:
            mark = "★" if c["id"] == rec else " "
            print(f"  {mark}{c['id']} {fmt(c['start'])}~{fmt(c['end'])} {c['reason']}")
        print(f"  모델: {', '.join(note['ai_generated']['models'])}")
    timings = jf.events()
    steps = [f"{e['step']} {e['sec']}초" for e in timings if e["event"] == "step_end" and e.get("ok")]
    print("\n[소요] " + ", ".join(steps))


def write_html(jf: JobFiles) -> None:
    song = jf.read_json(jf.song)
    f = jf.read_json(jf.features)
    note = latest_note(jf)
    lr = jf.read_json(jf.listening)["result"] if jf.listening.exists() else None
    original = jf.find_original()
    dur = f["duration_sec"]
    e = html.escape

    # 파형 SVG + 하이라이트 후보 구간
    w, h = 800, 120
    bars = "".join(f'<rect x="{i}" y="{(h - v * h) / 2:.1f}" width="0.8" height="{max(v * h, 0.5):.1f}"/>'
                   for i, v in enumerate(f["waveform"]))
    rec = note["highlight"]["recommended_id"] if note else None
    cands = note["highlight"]["candidates"] if note else f["highlight_candidates"]
    boxes = "".join(
        f'<rect class="hl{" rec" if c["id"] == rec else ""}" x="{c["start"] / dur * w:.1f}" y="0" '
        f'width="{(c["end"] - c["start"]) / dur * w:.1f}" height="{h}"/>'
        f'<text x="{c["start"] / dur * w + 3:.1f}" y="14">{e(c["id"])}</text>' for c in cands)
    ticks = "".join(f'<text class="tick" x="{t / dur * w:.1f}" y="{h + 14}">{fmt(t)}</text>'
                    for t in range(0, int(dur), 30))

    cand_rows = "".join(
        f'<tr><td>{"★ " if c["id"] == rec else ""}{e(c["id"])}</td><td>{fmt(c["start"])}~{fmt(c["end"])}</td>'
        f'<td>{e(c["reason"])}</td><td><button onclick="play({c["start"]},{c["end"]})">▶ 듣기</button></td></tr>'
        for c in cands)
    body = [f"<h1>{e(song['title'])} <small>{e(song['artist'])}</small></h1>",
            f"<p class=muted>{e(jf.job_id)} · {e(f['summary'])}</p>",
            f'<svg viewBox="0 0 {w} {h + 20}" class="wave"><g class="bars">{bars}</g>{boxes}{ticks}</svg>',
            f'<audio id="a" controls src="input/{original.name}"></audio>' if original else "",
            f"<table>{cand_rows}</table>"]
    if note:
        swatches = "".join(f'<span class="sw" style="background:{e(c)}"></span>{e(c)} ' for c in note["colors"])
        covers = "".join(f"<li>{e(c['text'])}</li>" for c in note["cover_directions"])
        body += [f"<h2>A&amp;R 노트 v{note['version']}</h2>",
                 f"<p class=interp>{e(note['interpretation'])}</p>",
                 f"<p>근거: {e(json.dumps(note['evidence'], ensure_ascii=False))}</p>",
                 f"<p>키워드: {e(' · '.join(note['mood_keywords']))}</p>",
                 f"<p>색: {swatches}</p>", f"<ol>{covers}</ol>",
                 f"<p class=muted>AI 생성 · {e(', '.join(note['ai_generated']['models']))}</p>"]
    if lr:
        arc = "".join(f"<li>{fmt(x['start'])}~{fmt(x['end'])} {e(x['emotion'])}</li>" for x in lr["emotional_arc"])
        body += ["<h2>Gemini가 들은 것</h2>", f"<p>{e(lr['overall_impression'])}</p>",
                 f"<p>악기: {e(', '.join(lr['instrumentation']))}<br>보컬: {e(lr['vocal_texture'])}"
                 f"<br>가사: {e(lr['lyrics_gist'])}</p>", f"<ul>{arc}</ul>"]

    page = f"""<!doctype html><meta charset="utf-8"><title>{e(song['title'])} — 분석 결과</title>
<style>
body{{font-family:system-ui,'Malgun Gothic',sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#222}}
.muted{{color:#888;font-size:13px}} .interp{{font-size:18px;line-height:1.6}}
.wave{{width:100%;background:#f6f6f8;border-radius:8px}} .bars rect{{fill:#556}}
.hl{{fill:#4a7cff;opacity:.18}} .hl.rec{{fill:#ff7a3c;opacity:.3}} .wave text{{font-size:11px;fill:#333}}
.tick{{fill:#999!important}} audio{{width:100%;margin:12px 0}}
table{{border-collapse:collapse;width:100%}} td{{border-bottom:1px solid #eee;padding:6px}}
.sw{{display:inline-block;width:22px;height:22px;border-radius:4px;vertical-align:middle;margin-right:4px}}
</style>
{''.join(body)}
<script>
const a=document.getElementById('a');let stopAt=null;
function play(s,e){{a.currentTime=s;stopAt=e;a.play();}}
a&&a.addEventListener('timeupdate',()=>{{if(stopAt&&a.currentTime>=stopAt){{a.pause();stopAt=null;}}}});
</script>"""
    out = jf.root / "report.html"
    out.write_text(page, encoding="utf-8")
    print(f"리포트: {out}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("job_id", nargs="?")
    p.add_argument("--html", action="store_true")
    args = p.parse_args()
    settings = get_settings()
    if not args.job_id:
        list_jobs(settings)
        return 0
    jf = JobFiles(settings.jobs_dir, args.job_id)
    if not jf.root.exists():
        print(f"작업을 찾을 수 없어요: {args.job_id}", file=sys.stderr)
        return 1
    print_summary(jf)
    if args.html:
        write_html(jf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
