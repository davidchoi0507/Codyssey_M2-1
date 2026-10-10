/* 인디 앨범 스튜디오 — 전체 흐름 시안 (2026-10-10). 한 파일 앱: 해시 주소로 화면을 바꾼다.
   화면: 홈 · 발매 안내 · 발매 준비(업로드 → 작업 공간 7단계) · 바로 공개 · 커뮤니티 · 내 곡.
   AI가 쓴 글·사용자 입력은 모두 esc()로 글자로만 넣는다 (HTML로 해석하지 않게). */
"use strict";

const CONSENT_VERSION = "v1.2";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
const STATUS = { ok: "통과", warn: "확인 필요", fail: "고쳐야 함", todo: "직접 확인" };
const STAGE_ORDER = ["uploaded", "analyzing", "note_ready", "generating", "awaiting_cover", "rendering", "done"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 공통 ---------- */

class ApiError extends Error {
  constructor(status, body) { super(body?.message || `요청이 실패했어요 (${status})`); this.status = status; this.code = body?.code; this.body = body; }
}

async function api(method, path, body, { form = false } = {}) {
  const opt = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined && body !== null) {
    if (form) opt.body = body;
    else { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  }
  const res = await fetch(path, opt);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), 3200);
}

function modal(html) {
  $("#modalBody").innerHTML = html;
  $("#modal").showModal();
  return $("#modalBody");
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").close(); });

function pill(status) { return `<span class="pill ${status}">${STATUS[status] || esc(status)}</span>`; }

function checkList(items) {
  if (!items?.length) return `<p class="muted small">아직 검사할 항목이 없어요.</p>`;
  return `<ul class="checks">${items.map((i) => `<li>${pill(i.status)}<div><b>${esc(i.label)}</b><div class="d">${esc(i.detail)}</div></div></li>`).join("")}</ul>`;
}

function counts(c) {
  return `<div class="counts">${["fail", "warn", "todo", "ok"].filter((k) => c[k]).map((k) => `<span class="pill ${k}">${STATUS[k]} ${c[k]}</span>`).join("")}</div>`;
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn._label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${label || "처리 중"}`; }
  else { btn.disabled = false; btn.innerHTML = btn._label || btn.innerHTML; }
}

async function guard(btn, fn, label) {
  busy(btn, true, label);
  try { return await fn(); } catch (e) { toast(e.message, true); throw e; } finally { busy(btn, false); }
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 안 되는 브라우저 */ } },
};
function rememberJob(id, title) {
  const list = store.get("recentJobs", []).filter((j) => j.id !== id);
  list.unshift({ id, title, at: Date.now() }); store.set("recentJobs", list.slice(0, 10));
}

let ME = undefined; // undefined: 아직 모름, null: 로그인 안 함
async function loadMe() {
  try { ME = await api("GET", "/auth/me"); } catch { ME = null; }
  $("#navMe").textContent = ME ? `${ME.nickname} 님` : "내 곡";
  return ME;
}

/* ---------- 라우터 ---------- */

let stopPoll = null;
const routes = [
  [/^#?\/?$/, home],
  [/^#\/guide$/, guide],
  [/^#\/new$/, newJob],
  [/^#\/job\/([0-9A-Z]{26})(?:\/(\w+))?$/, jobView],
  [/^#\/quick$/, quick],
  [/^#\/community$/, community],
  [/^#\/track\/([0-9A-Z]{26})$/, trackView],
  [/^#\/me$/, me],
  [/^#\/login/, me],
];

async function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  let hash = location.hash || "#/";
  // 예전 커뮤니티 주소 (/community#곡ID)
  if (location.pathname.startsWith("/community") && /^#[0-9A-Z]{26}$/.test(hash)) hash = `#/track/${hash.slice(1)}`;
  else if (location.pathname.startsWith("/community") && hash === "#/") hash = "#/community";
  const navKey = (hash.match(/^#\/(\w+)/) || [])[1] || "";
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === navKey || (navKey === "job" && a.dataset.nav === "new") || (navKey === "track" && a.dataset.nav === "community")));
  for (const [rx, fn] of routes) {
    const m = hash.match(rx);
    if (m) { window.scrollTo(0, 0); try { await fn(...m.slice(1)); } catch (e) { view.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><a class="btn" href="#/">처음으로</a></div>`; } return; }
  }
  view.innerHTML = `<div class="empty">없는 화면이에요. <a href="#/">처음으로</a></div>`;
}
window.addEventListener("hashchange", route);

/* ---------- 홈 ---------- */

async function home() {
  view.innerHTML = `
  <section class="hero">
    <div class="eyebrow">처음 만든 내 노래를 위한</div>
    <h1>발매하는 방법부터<br><b>사람들 반응</b>까지, 한 곳에서.</h1>
    <p>곡을 올리면 AI가 먼저 듣고 해석해요. 발매에 필요한 정보와 파일을 미리 검사하고, 홍보 자료를 만들고,
      커뮤니티에서 다른 사람들의 반응을 받아 볼 수 있어요.</p>
    <div class="choices">
      <a class="choice main" href="#/new">
        <div class="q">"곡은 만들었는데, 멜론·스포티파이에 어떻게 올리지?"</div>
        <h2>발매 준비하기</h2>
        <ul><li>AI가 곡을 듣고 해석 (A&R 노트)</li><li>발매 정보·크레딧·권리 미리 검사</li><li>커버·숏폼·홍보 글·피칭 메일</li><li>유통사 제출 준비표·발매 일정</li></ul>
        <div class="go">시작하기 →</div>
      </a>
      <a class="choice" href="#/quick">
        <div class="q">"내 노래, 다른 사람들은 어떻게 들을까?"</div>
        <h2>곡만 올려서 반응 받기</h2>
        <ul><li>AI 분석 없이 바로 공개</li><li>전곡 또는 하이라이트 15초만</li><li>별점·태그·한마디로 반응 받기</li><li>의견은 나만 보기도 가능</li></ul>
        <div class="go">바로 올리기 →</div>
      </a>
    </div>
  </section>
  <div class="section-title"><h2>발매는 이렇게 흘러가요</h2><a class="btn small" href="#/guide">자세히 보기</a></div>
  <div class="flow"><div>곡 올리기</div><div>AI 해석</div><div>발매 정보</div><div>미리 검사</div><div>홍보 자료</div><div>제출 준비</div><div>반응 받기</div></div>
  <div class="section-title"><h2>지금 커뮤니티에서</h2><a class="btn small" href="#/community">전체 보기</a></div>
  <div id="homeTracks" class="tracks"><div class="empty"><span class="spinner"></span></div></div>`;
  try {
    const d = await api("GET", "/community/tracks?sort=new&limit=6");
    $("#homeTracks").innerHTML = d.tracks.length ? d.tracks.map(trackCard).join("") : `<div class="empty">아직 올라온 곡이 없어요. 첫 곡을 올려 보세요!</div>`;
  } catch { $("#homeTracks").innerHTML = `<div class="empty">커뮤니티를 불러오지 못했어요.</div>`; }
}

/* ---------- 발매 안내 ---------- */

async function guide() {
  const g = await api("GET", "/release/guide");
  view.innerHTML = `
  <div class="panel">
    <div class="eyebrow">처음 발매하는 사람을 위한</div>
    <h2>발매는 이렇게 돼요</h2>
    <p class="lead">유통사·플랫폼 정책은 자주 바뀌어요. 아래 내용은 팀 조사(2026-10-09 기준)이고, 최종 기준은 유통사 공식 안내예요.</p>
  </div>
  <div class="grid2">
    <div class="stack">${g.steps.map((s, i) => `<div class="card"><div class="eyebrow">${i + 1}</div><h3>${esc(s.title)}</h3><p class="muted">${esc(s.body)}</p></div>`).join("")}</div>
    <div class="stack">
      <div class="card" id="quiz">
        <h3>나에게 맞는 유통사</h3>
        <p class="muted small">질문 3개에 답하면 처음 하는 사람에게 맞는 곳을 알려 드려요.</p>
        <div class="q"><b>어디에 내고 싶나요?</b><div class="opts" data-q="where">
          <button class="chip" data-v="domestic">국내 (멜론 등)</button><button class="chip" data-v="global">해외 (스포티파이 등)</button><button class="chip on" data-v="both">둘 다</button></div></div>
        <div class="q"><b>비용은?</b><div class="opts" data-q="budget">
          <button class="chip on" data-v="free">무료로 시작</button><button class="chip" data-v="paid_ok">조금 써도 괜찮아요</button></div></div>
        <div class="q"><b>음원을 만들 때 AI(Suno 등)를 썼나요?</b><div class="opts" data-q="ai_audio">
          <button class="chip on" data-v="false">아니요</button><button class="chip" data-v="true">네</button></div></div>
        <button class="btn primary block" id="recBtn">추천 보기</button>
        <div id="rec"></div>
      </div>
      ${g.distributors.map(distCard).join("")}
    </div>
  </div>`;
  $$("#quiz .opts").forEach((box) => box.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    $$(".chip", box).forEach((c) => c.classList.toggle("on", c === b));
  }));
  $("#recBtn").onclick = (e) => guard(e.currentTarget, async () => {
    const pick = (q) => $(`#quiz [data-q=${q}] .chip.on`).dataset.v;
    const r = await api("POST", "/release/guide/recommend", { where: pick("where"), budget: pick("budget"), ai_audio: pick("ai_audio") === "true" });
    $("#rec").innerHTML = `<hr><div class="eyebrow">추천</div><h3>${esc(r.title)}</h3>
      <ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${r.cautions.map((x) => `<div class="notice warn small" style="margin-top:8px">${esc(x)}</div>`).join("")}
      <a class="btn primary block" style="margin-top:14px" href="#/new">이 유통사 기준으로 준비하기</a>`;
  });
}

function distCard(d) {
  return `<div class="card distcard"><div class="row"><h3>${esc(d.name)}</h3><span class="pill">${esc(d.kind)}</span></div>
    <dl><dt>가입</dt><dd>${esc(d.signup)}</dd><dt>보내는 곳</dt><dd>${esc(d.stores)}</dd><dt>멜론</dt><dd>${esc(d.melon)}</dd>
    <dt>기간</dt><dd>${esc(d.lead_time)}</dd><dt>비용</dt><dd>${esc(d.cost)}</dd><dt>음원</dt><dd>${esc(d.audio)}</dd>
    <dt>커버</dt><dd>${esc(d.cover)}</dd><dt>AI 음원</dt><dd>${esc(d.ai_policy)}</dd>${d.extras ? `<dt>참고</dt><dd>${esc(d.extras)}</dd>` : ""}</dl>
    <p class="muted small" style="margin-top:10px">조사 기준일 ${esc(d.checked_at)} · ${d.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">출처</a>`).join(" ")}</p></div>`;
}

/* ---------- 발매 준비: 곡 올리기 ---------- */

async function newJob() {
  view.innerHTML = `
  <div class="panel"><div class="eyebrow">발매 준비 1단계</div><h2>곡 올리기</h2>
    <p class="lead">곡을 올리면 AI가 먼저 듣고 해석해요 (1~3분). 기다리는 동안 발매 정보를 채울 수 있어요.</p></div>
  <form class="card stack" id="upForm">
    <label class="field"><span>음원 파일 <em>mp3·wav, 15초~10분, 200MB 이하 — 발매할 거라면 마스터 WAV</em></span><input type="file" name="file" accept=".mp3,.wav,audio/mpeg,audio/wav" required></label>
    <div class="grid2">
      <label class="field"><span>곡 제목</span><input type="text" name="title" maxlength="100" required placeholder="피처링·버전은 빼고 제목만"></label>
      <label class="field"><span>아티스트 이름</span><input type="text" name="artist" maxlength="100" required placeholder="활동명"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>장르 <em>선택</em></span><input type="text" name="genre" maxlength="50" placeholder="예: 인디 록, 발라드"></label>
      <label class="field"><span>곡 소개 <em>선택</em></span><input type="text" name="description" maxlength="1000" placeholder="곡을 만든 이야기 한두 줄"></label>
    </div>
    <label class="field"><span>가사 <em>선택 — 있으면 AI가 더 잘 해석해요</em></span><textarea name="lyrics" maxlength="5000"></textarea></label>
    <div class="notice">
      <b>동의 (동의서 ${CONSENT_VERSION})</b>
      <label class="check"><input type="checkbox" name="c1" required><span>[필수] 만 14세 이상이에요. 개인정보 수집·이용 — 곡 정보·음원·접속 IP, 업로드 7일 뒤 자동 삭제 (<a href="/privacy" target="_blank">개인정보처리방침</a>)</span></label>
      <label class="check"><input type="checkbox" name="c2" required><span>[필수] 외부 AI 전송 — 음원은 Google Gemini(무료 등급, 학습에 쓰일 수 있음), 글·이미지는 코디세이 API로 처리</span></label>
      <label class="check"><input type="checkbox" name="c3" required><span>[필수] 직접 만든 곡이거나 올릴 권리가 있어요. AI 결과물은 저작권이 인정되지 않을 수 있어요</span></label>
      <label class="check"><input type="checkbox" name="c4"><span>[선택] 결과물을 서비스 개선·발표 자료에 써도 돼요</span></label>
    </div>
    <p class="err" id="upErr"></p>
    <button class="btn primary block" id="upBtn">올리고 AI에게 들려주기</button>
  </form>`;
  if (ME) $("#upForm").insertAdjacentHTML("afterbegin", `<div class="notice ok">${esc(ME.nickname)} 님으로 로그인했어요 — 이 곡은 '내 곡'에 모여요.</div>`);
  else $("#upForm").insertAdjacentHTML("afterbegin", `<div class="notice">로그인하면 올린 곡을 '내 곡'에서 다시 열 수 있어요. <a href="#/me">로그인</a> (안 해도 돼요)</div>`);
  $("#upForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget, fd = new FormData();
    fd.append("file", f.file.files[0]);
    for (const k of ["title", "artist", "genre", "description"]) fd.append(k, f[k].value.trim());
    if (f.lyrics.value.trim()) fd.append("lyrics", f.lyrics.value.trim());
    fd.append("consent_privacy", f.c1.checked); fd.append("consent_external_ai", f.c2.checked);
    fd.append("consent_original", f.c3.checked); fd.append("consent_showcase", f.c4.checked);
    fd.append("consent_version", CONSENT_VERSION);
    $("#upErr").textContent = "";
    guard($("#upBtn"), async () => {
      const r = await api("POST", "/jobs", fd, { form: true });
      rememberJob(r.job_id, f.title.value.trim());
      location.hash = `#/job/${r.job_id}/listen`;
    }, "올리는 중").catch((err) => ($("#upErr").textContent = err.message));
  };
}

/* ---------- 작업 공간 ---------- */

const STEPS = [["listen", "곡 듣기"], ["note", "A&R 노트"], ["info", "발매 정보"], ["check", "미리 검사"], ["promo", "홍보 자료"], ["submit", "제출 준비"], ["share", "커뮤니티 공개"]];
let J = null; // 지금 연 작업 상태

async function jobView(id, step) {
  if (!J || J.id !== id) J = { id, status: null, note: null, pkg: null, info: null, rights: null, track: undefined };
  step = step || "listen";
  J.step = step;
  await refreshStatus();
  if (!J.status) return;
  rememberJob(id, J.info?.info?.title || J.title);
  renderJob();
  // 처리 중이면 상태를 계속 본다
  let alive = true;
  stopPoll = () => (alive = false);
  (async () => {
    while (alive) {
      await sleep(2500);
      if (!alive) break;
      const before = J.status?.stage;
      if (!["uploaded", "analyzing", "generating", "rendering"].includes(before)) continue;
      await refreshStatus();
      if (J.status?.stage !== before) { J.note = J.pkg = null; renderJob(); }
      else if (J.step === "listen" || J.step === "promo") renderStepOnly();
    }
  })();
}

async function refreshStatus() {
  try { J.status = await api("GET", `/jobs/${J.id}`); }
  catch (e) { view.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><a class="btn" href="#/new">새로 올리기</a></div>`; J.status = null; }
}

const stageAt = (s) => STAGE_ORDER.indexOf(s);
function noteReady() { const s = J.status.stage; return stageAt(s) >= stageAt("note_ready") || (s === "failed" && J.status.steps?.some((x) => x.key === "note" && x.status === "done")); }
function accepted() { return stageAt(J.status.stage) >= stageAt("generating"); }

function renderJob() {
  const st = J.status;
  const unlocked = { listen: true, note: noteReady(), info: true, check: true, promo: accepted(), submit: true, share: noteReady() };
  const done = { listen: noteReady(), note: accepted(), info: !!J.info?.saved, check: !!J.rights?.complete, promo: st.stage === "done", submit: false, share: !!J.track };
  view.innerHTML = `
  <div class="ws">
    <aside class="steps">
      <div class="song"><span class="muted small">작업</span><b id="songTitle">${esc(J.info?.info?.title || "")}</b><span class="pill">${esc(st.stage_label)}</span></div>
      ${STEPS.map(([k, label], i) => `<a class="step ${k === J.step ? "on" : ""} ${done[k] ? "done" : ""} ${unlocked[k] ? "" : "locked"}" href="#/job/${J.id}/${k}">
        <span class="n">${done[k] ? "✓" : i + 1}</span>${label}</a>`).join("")}
    </aside>
    <section class="panel" id="stepPanel"></section>
  </div>`;
  if (!J.info) api("GET", `/jobs/${J.id}/release-info`).then((r) => { J.info = r; $("#songTitle") && ($("#songTitle").textContent = r.info.title); }).catch(() => {});
  if (!J.rights) api("GET", `/jobs/${J.id}/rights`).then((r) => (J.rights = r)).catch(() => {});
  if (J.track === undefined) api("GET", `/jobs/${J.id}/community`).then((r) => (J.track = r)).catch(() => (J.track = null));
  renderStepOnly();
}

function renderStepOnly() {
  const p = $("#stepPanel"); if (!p) return;
  const fn = { listen: stepListen, note: stepNote, info: stepInfo, check: stepCheck, promo: stepPromo, submit: stepSubmit, share: stepShare }[J.step];
  (fn || stepListen)(p).catch((e) => (p.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`));
}

function nextBtn(step, label) { return `<a class="btn primary" href="#/job/${J.id}/${step}">${label} →</a>`; }

async function stepListen(p) {
  const st = J.status;
  const early = st.early;
  const failed = st.stage === "failed";
  p.innerHTML = `
    <h2>AI가 곡을 듣고 있어요</h2>
    <p class="lead">${noteReady() ? "다 들었어요! A&R 노트를 확인해 주세요." : "1~3분 걸려요. 기다리는 동안 발매 정보를 채워 두면 좋아요."}</p>
    <div class="card">
      <div class="row"><b>${esc(st.stage_label)}</b>${st.queue_position ? `<span class="pill">대기 ${st.queue_position}번째</span>` : ""}<span class="sp"></span>${noteReady() || failed ? "" : `<span class="spinner"></span>`}</div>
      <div class="progress"><i style="width:${Math.round((st.progress || 0) * 100)}%"></i></div>
      <div class="chips">${(st.steps || []).map((s) => `<span class="pill ${s.status === "done" ? "ok" : s.status === "running" ? "warn" : s.status === "failed" ? "fail" : ""}">${esc(s.label)}</span>`).join("")}</div>
      ${early ? `<hr><div class="row"><span class="pill accent">${Math.round(early.bpm)} BPM</span><span class="pill">${fmt(early.duration_sec)}</span><span class="muted small">${esc(early.summary)}</span></div>
        <div class="wave" style="margin-top:14px">${sample(early.waveform, 120).map((v) => `<i style="height:${Math.max(4, v * 100)}%"></i>`).join("")}</div>` : ""}
      ${failed ? `<hr><p class="err">${esc(st.error?.message || "문제가 생겼어요.")}</p>${st.error?.retryable ? `<button class="btn" id="retryBtn">다시 시도</button>` : `<a class="btn" href="#/new">새로 올리기</a>`}` : ""}
    </div>
    <div class="row" style="margin-top:18px">${noteReady() ? nextBtn("note", "A&R 노트 보기") : nextBtn("info", "기다리는 동안 발매 정보 채우기")}</div>`;
  $("#retryBtn")?.addEventListener("click", (e) => guard(e.currentTarget, async () => { J.status = await api("POST", `/jobs/${J.id}/retry`); renderJob(); }));
}

function sample(arr, n) { if (!arr?.length) return []; const out = []; for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * arr.length / n)]); const mx = Math.max(...out, 0.001); return out.map((v) => v / mx); }

async function stepNote(p) {
  if (!J.note) J.note = await api("GET", `/jobs/${J.id}/note`);
  const n = J.note, sel = n.highlight.selected;
  const dur = J.status.early?.duration_sec || (n.waveform.length ? sel.end * 1.2 : 0);
  const bars = sample(n.waveform, 120);
  const isHL = (i) => { const t = (i / bars.length) * dur; return t >= sel.start && t <= sel.end; };
  const busyNow = J.status.stage === "analyzing";
  p.innerHTML = `
    <h2>A&R 노트</h2>
    <p class="lead">AI가 곡을 듣고 쓴 해석이에요. 맞으면 수락하고, 다르면 한 줄로 고쳐 주세요. 이 해석 하나로 커버·영상·홍보 글이 같은 톤으로 만들어져요.</p>
    <div class="card">
      <p style="font-size:18px;line-height:1.7;margin:0">${esc(n.interpretation)}</p>
      ${n.user_correction ? `<p class="muted small">내가 고친 해석: ${esc(n.user_correction)}</p>` : ""}
      <hr>
      <div class="grid2">
        <div><div class="muted small">근거</div><div class="row" style="margin-top:6px"><span class="pill accent">${Math.round(n.evidence.bpm)} BPM</span><span class="pill">${esc(n.evidence.key)}</span></div>
          <p class="small muted">${esc(n.evidence.energy_change)}</p>
          <div class="muted small" style="margin-top:12px">무드</div><div class="chips" style="margin-top:6px">${n.mood_keywords.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div></div>
        <div><div class="muted small">곡의 색</div><div class="swatches" style="margin-top:6px">${n.colors.map((c) => `<span style="background:${esc(c)}" title="${esc(c)}"></span>`).join("")}</div>
          <div class="muted small" style="margin-top:12px">커버 방향</div><ol class="small" style="margin:6px 0 0;padding-left:18px">${n.cover_directions.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ol></div>
      </div>
    </div>
    <div class="card">
      <h3>하이라이트 15초</h3><p class="muted small">숏폼·커뮤니티 미리 듣기에 쓰는 구간이에요.</p>
      <div class="wave">${bars.map((v, i) => `<i class="${isHL(i) ? "hl" : ""}" style="height:${Math.max(4, v * 100)}%"></i>`).join("")}</div>
      <div class="stack" style="margin-top:12px">${n.highlight.candidates.map((c) => `<label class="check"><input type="radio" name="hl" value="${c.start}" ${Math.abs(c.start - sel.start) < 0.5 ? "checked" : ""}>
        <span><b>${fmt(c.start)} ~ ${fmt(c.end)}</b>${c.id === n.highlight.recommended_id ? ` <span class="pill accent">AI 추천</span>` : ""}<br><span class="muted small">${esc(c.reason)}</span></span></label>`).join("")}</div>
      ${J.status.audio_url ? `<audio id="hlAudio" controls preload="none" src="${esc(J.status.audio_url)}"></audio><button class="btn small" id="hlPlay">고른 구간 들어 보기</button>` : ""}
    </div>
    <div class="card">
      <h3>해석이 다르다면 한 줄로</h3>
      <div class="row" style="margin-top:10px"><input type="text" id="corr" maxlength="200" placeholder="예: 터지는 게 아니라 체념이야" style="flex:1">
        <button class="btn" id="corrBtn" ${busyNow ? "disabled" : ""}>다시 쓰기</button></div>
      <p class="muted small">한 줄 수정 ${n.edits_remaining}번 남았어요.</p>
    </div>
    <div class="row" style="margin-top:18px">
      ${accepted() ? `<span class="pill ok">수락했어요</span>${nextBtn("info", "발매 정보")}` : `<button class="btn primary" id="accBtn" ${busyNow ? "disabled" : ""}>이 해석으로 만들기</button><span class="muted small">수락하면 커버 3종·홍보 글을 만들기 시작해요 (1~2분).</span>`}
    </div>`;
  $$("input[name=hl]", p).forEach((r) => r.addEventListener("change", async () => {
    if (accepted()) { toast("수락한 뒤에는 구간을 바꿀 수 없어요.", true); return; }
    try { J.note = await api("PATCH", `/jobs/${J.id}/note`, { highlight_start: Number(r.value) }); renderStepOnly(); toast("하이라이트를 바꿨어요."); } catch (e) { toast(e.message, true); }
  }));
  $("#hlPlay")?.addEventListener("click", () => { const a = $("#hlAudio"); a.currentTime = J.note.highlight.selected.start; a.play(); setTimeout(() => a.pause(), 15000); });
  $("#corrBtn").onclick = (e) => { const v = $("#corr").value.trim(); if (!v) return toast("고칠 내용을 한 줄로 써 주세요.", true);
    guard(e.currentTarget, async () => { J.note = await api("PATCH", `/jobs/${J.id}/note`, { correction: v }); renderStepOnly(); toast("해석을 다시 썼어요."); }, "다시 쓰는 중"); };
  $("#accBtn")?.addEventListener("click", (e) => guard(e.currentTarget, async () => { J.status = await api("POST", `/jobs/${J.id}/note/accept`); J.pkg = null; location.hash = `#/job/${J.id}/info`; renderJob(); }));
}

async function stepInfo(p) {
  if (!J.info) J.info = await api("GET", `/jobs/${J.id}/release-info`);
  const { info, checks, suggestions, saved } = J.info;
  const credits = info.credits.length ? info.credits : [{ role: "작사", legal_name: "", stage_name: info.artist }, { role: "작곡", legal_name: "", stage_name: info.artist }, { role: "편곡", legal_name: "", stage_name: info.artist }];
  const roles = ["작사", "작곡", "편곡", "보컬", "연주", "프로듀서", "믹싱", "마스터링", "기타"];
  p.innerHTML = `
    <h2>발매 정보</h2>
    <p class="lead">유통사에 낼 정보를 칸별로 넣어요. 피처링·버전·19금은 제목에 쓰지 않고 따로 넣어야 반려 위험이 줄어요.</p>
    ${suggestions.map((s) => `<div class="suggest"><span>💡 ${esc(s.message)}</span><button class="btn small" data-sug='${esc(JSON.stringify(s.fields))}'>적용</button></div>`).join("")}
    <form class="card stack" id="infoForm">
      <div class="grid2">
        <label class="field"><span>곡 제목</span><input type="text" name="title" value="${esc(info.title)}" maxlength="100"></label>
        <label class="field"><span>버전 <em>없으면 비움 — 예: Acoustic Ver.</em></span><input type="text" name="version" value="${esc(info.version)}" maxlength="50"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>메인 아티스트 <em>이전 발매와 같은 철자</em></span><input type="text" name="artist" value="${esc(info.artist)}" maxlength="100"></label>
        <label class="field"><span>피처링 <em>쉼표로 구분</em></span><input type="text" name="featuring" value="${esc(info.featuring.join(", "))}"></label>
      </div>
      <div class="grid3">
        <label class="field"><span>앨범명 <em>싱글이면 제목과 같게</em></span><input type="text" name="album" value="${esc(info.album)}" maxlength="100"></label>
        <label class="field"><span>1차 장르</span><input type="text" name="genre_primary" value="${esc(info.genre_primary)}" maxlength="50"></label>
        <label class="field"><span>2차 장르 <em>선택</em></span><input type="text" name="genre_secondary" value="${esc(info.genre_secondary)}" maxlength="50"></label>
      </div>
      <div class="grid3">
        <label class="field"><span>발매일</span><input type="date" name="release_date" value="${esc(info.release_date || "")}"></label>
        <label class="field"><span>발매 시각</span><input type="time" name="release_time" value="${esc(info.release_time)}"></label>
        <label class="field"><span>언어</span><select name="language">${[["ko", "한국어"], ["en", "영어"], ["ja", "일본어"], ["instrumental", "연주곡 (가사 없음)"]].map(([v, l]) => `<option value="${v}" ${info.language === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div><span class="small" style="font-weight:700">19금(Explicit)</span><div class="chips" style="margin-top:6px" id="explicit">
        ${[["null", "아직 몰라요"], ["false", "아니요"], ["true", "네, 19금이에요"]].map(([v, l]) => `<button type="button" class="chip ${String(info.explicit) === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div></div>
      <hr>
      <div><b>크레딧</b> <span class="muted small">— 실명은 유통사·저작권 등록용(작곡가 실명 필수), 활동명은 플랫폼에 보여요</span></div>
      <div id="credits">${credits.map((c) => creditRow(c, roles)).join("")}</div>
      <button type="button" class="btn small" id="addCredit">+ 크레딧 추가</button>
      <div class="grid2">
        <label class="field"><span>© 작사·작곡 권리자</span><input type="text" name="copyright_holder" value="${esc(info.copyright_holder)}" maxlength="100"></label>
        <label class="field"><span>℗ 녹음 권리자</span><input type="text" name="recording_holder" value="${esc(info.recording_holder)}" maxlength="100"></label>
      </div>
      <label class="field"><span>가사 <em>복사 가능한 텍스트</em></span><textarea name="lyrics" maxlength="5000" style="min-height:160px">${esc(info.lyrics)}</textarea></label>
      <div class="grid2">
        <label class="field"><span>ISRC <em>이미 받은 게 있으면</em></span><input type="text" name="isrc" value="${esc(info.isrc)}" maxlength="15"></label>
        <label class="field"><span>이전 발매 링크 <em>Spotify·멜론 — 같은 아티스트로 묶이게</em></span><input type="text" name="previous_release" value="${esc(info.previous_release)}" maxlength="300"></label>
      </div>
      <div class="row"><button class="btn primary" id="saveInfo">저장하고 검사</button><span class="muted small">${saved ? "저장됨" : "아직 저장 전 — 업로드 정보로 채운 초안이에요"}</span></div>
    </form>
    <div class="card"><h3>표기 검사</h3>${checkList(checks)}</div>
    <div class="row" style="margin-top:18px">${nextBtn("check", "미리 검사")}</div>`;
  const form = $("#infoForm");
  $("#explicit").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; $$("#explicit .chip").forEach((c) => c.classList.toggle("on", c === b)); });
  $("#addCredit").onclick = () => $("#credits").insertAdjacentHTML("beforeend", creditRow({ role: "기타", legal_name: "", stage_name: "" }, roles));
  $("#credits").addEventListener("click", (e) => { if (e.target.matches(".rm")) e.target.closest(".credit").remove(); });
  const collect = () => ({
    album: form.album.value.trim(), title: form.title.value.trim(), version: form.version.value.trim(), artist: form.artist.value.trim(),
    featuring: form.featuring.value.split(",").map((x) => x.trim()).filter(Boolean),
    genre_primary: form.genre_primary.value.trim(), genre_secondary: form.genre_secondary.value.trim(), language: form.language.value,
    explicit: JSON.parse($("#explicit .chip.on").dataset.v), release_date: form.release_date.value || null, release_time: form.release_time.value || "18:00",
    credits: $$(".credit", form).map((r) => ({ role: $("select", r).value, legal_name: $(".ln", r).value.trim(), stage_name: $(".sn", r).value.trim() })).filter((c) => c.legal_name || c.stage_name),
    lyrics: form.lyrics.value, copyright_holder: form.copyright_holder.value.trim(), recording_holder: form.recording_holder.value.trim(),
    isrc: form.isrc.value.trim(), previous_release: form.previous_release.value.trim(),
  });
  const save = (btn, body) => guard(btn, async () => { J.info = await api("PUT", `/jobs/${J.id}/release-info`, body); J.pkg = null; renderStepOnly(); toast("저장했어요."); }, "저장 중");
  form.onsubmit = (e) => { e.preventDefault(); save($("#saveInfo"), collect()); };
  $$("[data-sug]", p).forEach((b) => (b.onclick = () => save(b, { ...collect(), ...JSON.parse(b.dataset.sug) })));
}

function creditRow(c, roles) {
  return `<div class="credit"><select>${roles.map((r) => `<option ${r === c.role ? "selected" : ""}>${r}</option>`).join("")}</select>
    <input type="text" class="ln" placeholder="실명" value="${esc(c.legal_name)}" maxlength="50"><input type="text" class="sn" placeholder="활동명" value="${esc(c.stage_name)}" maxlength="50">
    <button type="button" class="btn small ghost rm" title="빼기">✕</button></div>`;
}

async function stepCheck(p) {
  const [pkg, qs, rights] = await Promise.all([J.pkg || api("GET", `/jobs/${J.id}/package`), api("GET", "/release/rights-questions"), api("GET", `/jobs/${J.id}/rights`)]);
  J.pkg = pkg; J.rights = rights;
  const sc = pkg.submission_check;
  const groups = { meta: "곡 정보", audio: "음원", cover: "커버", rights: "권리", extra: "유통과 별개로 챙길 것" };
  p.innerHTML = `
    <h2>미리 검사</h2>
    <p class="lead">유통사에 내기 전에 흔한 반려 사유를 미리 걸러요. ${esc(sc.notice)}</p>
    <div class="card"><div class="row"><h3>검사 결과</h3><span class="sp"></span>${counts(sc.counts)}</div>
      ${Object.entries(groups).map(([g, name]) => { const items = sc.items.filter((i) => i.group === g); return items.length ? `<h4 style="margin:18px 0 4px">${name}</h4>${checkList(items)}` : ""; }).join("")}
      ${J.info?.saved ? "" : `<div class="notice warn" style="margin-top:12px">발매 정보를 저장하면 곡 정보 검사가 더 자세해져요. <a href="#/job/${J.id}/info">발매 정보 채우기</a></div>`}
    </div>
    <div class="card" id="rightsCard">
      <div class="row"><h3>권리 자가진단</h3><span class="sp"></span>${rights.complete ? `<span class="pill ok">모두 답했어요</span>` : `<span class="pill todo">${Object.keys(rights.answers).length}/${qs.length}</span>`}</div>
      <p class="muted small">법률 자문이 아니라 흔한 반려·분쟁 사유를 미리 짚는 질문이에요.</p>
      ${qs.map((q) => `<div class="q"><b>${esc(q.question)}</b>${q.help ? `<div class="muted small">${esc(q.help)}</div>` : ""}
        <div class="opts" data-q="${esc(q.id)}">${Object.entries(q.options).map(([v, l]) => `<button class="chip ${rights.answers[q.id] === v ? "on" : ""}" data-v="${esc(v)}">${esc(l)}</button>`).join("")}</div></div>`).join("")}
      ${rights.documents.length ? `<hr><b>챙겨 둘 서류·기록</b><ul class="small">${rights.documents.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="row" style="margin-top:18px">${accepted() ? nextBtn("promo", "홍보 자료") : `<a class="btn" href="#/job/${J.id}/note">A&R 노트 수락하러 가기</a>`}${nextBtn("submit", "제출 준비")}</div>`;
  $$("#rightsCard .opts").forEach((box) => box.addEventListener("click", async (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const answers = { ...J.rights.answers, [box.dataset.q]: b.dataset.v };
    try { J.rights = await api("PUT", `/jobs/${J.id}/rights`, answers); J.pkg = null; const y = window.scrollY; await stepCheck(p); window.scrollTo(0, y); } catch (err) { toast(err.message, true); }
  }));
}

async function stepPromo(p) {
  const st = J.status.stage;
  if (st === "generating") { p.innerHTML = `<h2>홍보 자료</h2><div class="card"><span class="spinner"></span> 커버 3종과 홍보 글을 만드는 중이에요 (1~2분). 이 화면은 저절로 바뀌어요.</div>`; return; }
  if (!J.pkg || J.pkg.stage !== st) J.pkg = await api("GET", `/jobs/${J.id}/package`);
  const pkg = J.pkg;
  const rendering = st === "rendering";
  p.innerHTML = `
    <h2>홍보 자료</h2>
    <p class="lead">커버를 고르면 숏폼 영상·Spotify Canvas·채널별 이미지를 만들어요. 마음에 안 들면 요청 한 줄로 다시 만들 수 있어요.</p>
    <div class="card"><div class="row"><h3>커버</h3><span class="sp"></span>${rendering ? `<span class="spinner"></span><span class="small muted">영상·이미지 만드는 중</span>` : ""}</div>
      <div class="covers" style="margin-top:12px">${pkg.covers.map((c) => { const v = c.versions[c.versions.length - 1]; const selV = c.selected ? c.versions.find((x) => x.v === c.selected_v) || v : v;
        return `<div class="cover ${c.selected ? "sel" : ""}"><img src="${esc(selV.url)}" alt="커버 ${esc(c.item_id)}" loading="lazy">
          <div class="row" style="margin-top:8px">${c.selected ? `<span class="pill accent">선택함</span>` : `<button class="btn small" data-pick="${esc(c.item_id)}" data-v="${selV.v}" ${rendering ? "disabled" : ""}>이 커버로</button>`}
          ${c.regenerate_remaining ? `<button class="btn small ghost" data-regen="${esc(c.item_id)}">다시 만들기 (${c.regenerate_remaining})</button>` : ""}</div></div>`; }).join("")}</div>
      <label class="field" style="margin-top:12px"><span>직접 만든 커버 올리기 <em>jpg·png 800px 이상</em></span><input type="file" id="ownImg" accept="image/jpeg,image/png"></label>
    </div>
    ${pkg.videos.length ? `<div class="card"><h3>영상</h3><div class="grid2" style="margin-top:12px">${pkg.videos.map((v) => `<div><video src="${esc(v.url)}" controls playsinline style="width:100%;border-radius:12px;max-height:420px;background:#000"></video>
      <p class="small muted">${v.kind === "short" ? "숏폼 15초 (릴스·틱톡·쇼츠)" : "Spotify Canvas 8초 (무음 반복)"}</p></div>`).join("")}</div></div>` : ""}
    ${Object.keys(pkg.channels).length ? `<div class="card"><h3>채널별 글</h3>${Object.entries(pkg.channels).map(([ch, c]) => `<div style="margin-top:16px"><div class="row"><b>${esc({ instagram: "인스타그램", tiktok: "틱톡", threads: "스레드", x: "X" }[ch] || ch)}</b><span class="sp"></span>
      <button class="btn small" data-copy="${esc(c.text + (c.hashtags ? "\n\n" + c.hashtags.join(" ") : ""))}">복사</button>${c.regenerate_remaining ? `<button class="btn small ghost" data-regen="${esc(c.item_id)}">다시 쓰기</button>` : ""}</div>
      ${c.hook ? `<div class="small muted">영상 위 훅: ${esc(c.hook)}</div>` : ""}<div class="copybox" style="margin-top:6px">${esc(c.text)}${c.hashtags ? "\n\n" + esc(c.hashtags.join(" ")) : ""}</div>
      ${c.images ? `<div class="row" style="margin-top:8px">${Object.entries(c.images).map(([r, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">이미지 ${esc(r)}</a>`).join("")}</div>` : ""}</div>`).join("")}</div>` : ""}
    ${pkg.editorial ? `<div class="card"><h3>Spotify 에디토리얼 피칭</h3><p class="muted small">Spotify for Artists에서 발매 7일 전까지 내요.</p><div class="copybox">${esc(pkg.editorial.spotify_ko)}</div>
      <h4 style="margin-top:14px">국내 음원 사이트 소개글</h4><div class="copybox">${esc(pkg.editorial.dsp_intro_ko)}</div></div>` : ""}
    ${Object.keys(pkg.pitch).length ? `<div class="card"><h3>피칭 메일</h3>${Object.entries(pkg.pitch).map(([l, m]) => `<div style="margin-top:12px"><b>${l === "ko" ? "한국어" : "영어"}</b> <span class="muted small">${esc(m.subject)}</span>
      <div class="copybox" style="margin-top:6px">${esc(m.body)}</div></div>`).join("")}</div>` : ""}
    <div class="row" style="margin-top:18px">${nextBtn("submit", "제출 준비")}</div>`;
  $$("[data-pick]", p).forEach((b) => (b.onclick = () => guard(b, async () => { J.pkg = await api("POST", `/jobs/${J.id}/cover/select`, { item_id: b.dataset.pick, v: Number(b.dataset.v) }); await refreshStatus(); renderJob(); toast("영상·이미지를 만들기 시작했어요 (40초 안팎)."); })));
  $$("[data-regen]", p).forEach((b) => (b.onclick = () => {
    const m = modal(`<h3>다시 만들기</h3><p class="muted small">바라는 점을 한 줄로 (비워도 돼요)</p><input type="text" id="regenReq" maxlength="200" placeholder="예: 더 어둡게, 사람 없이"><div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn" id="mCancel">취소</button><button class="btn primary" id="mGo">다시 만들기</button></div>`);
    $("#mCancel", m).onclick = () => $("#modal").close();
    $("#mGo", m).onclick = (e) => guard(e.currentTarget, async () => { J.pkg = await api("POST", `/jobs/${J.id}/items/${b.dataset.regen}/regenerate`, { request: $("#regenReq").value.trim() || null }); $("#modal").close(); renderStepOnly(); toast("새 버전을 만들었어요."); }, "만드는 중");
  }));
  $$("[data-copy]", p).forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast("복사했어요."))));
  $("#ownImg").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f);
    api("POST", `/jobs/${J.id}/own-image`, fd, { form: true }).then((r) => { J.pkg = r; renderStepOnly(); toast("올린 이미지를 커버 후보에 넣었어요."); }).catch((err) => toast(err.message, true)); };
}

async function stepSubmit(p) {
  const pkg = J.pkg || (J.pkg = await api("GET", `/jobs/${J.id}/package`));
  const dists = await api("GET", "/release/distributors");
  J.dist = J.dist || dists[0].id;
  const dc = await api("GET", `/jobs/${J.id}/distributors/${J.dist}`);
  const plan = pkg.release_plan;
  p.innerHTML = `
    <h2>제출 준비</h2>
    <p class="lead">고른 유통사 기준으로 한 번 더 보고, 유통사 입력 화면에 옮겨 적을 준비표와 파일을 받아요.</p>
    <div class="card">
      <div class="tabs">${dists.map((d) => `<button class="tab ${d.id === J.dist ? "on" : ""}" data-dist="${esc(d.id)}">${esc(d.name)}</button>`).join("")}<a class="btn small ghost" href="#/guide">어디가 맞을까?</a></div>
      <div class="row" style="margin-top:16px"><h3>${esc(dc.distributor.name)} <span class="muted small">${esc(dc.distributor.kind)}</span></h3><span class="sp"></span>${counts(dc.counts)}</div>
      ${checkList(dc.items)}
      <div class="row" style="margin-top:14px"><a class="btn primary" href="${esc(dc.sheet_url)}">입력 도우미 받기 (CSV · 엑셀)</a>
        ${pkg.zip_url ? `<a class="btn" href="${esc(pkg.zip_url)}">전체 패키지 ZIP</a>` : `<span class="muted small">ZIP은 커버를 고르고 영상까지 만들어지면 받을 수 있어요.</span>`}</div>
      <p class="muted small" style="margin-top:10px">두 유통사 모두 내려받는 제출 양식 없이 웹 화면에 직접 입력해요. 이 표는 그 화면에 옮겨 적을 값이에요 — DistroKid는 실제 업로드 화면 순서, 뮤즈플랫폼은 입력 화면이 로그인 뒤에만 있어 공개 범위 기준이에요. 조사 기준일 ${esc(dc.distributor.checked_at)}.</p>
    </div>
    <div class="card"><h3>발매 일정</h3>${plan.warnings.map((w) => `<div class="notice warn small" style="margin-top:8px">${esc(w)}</div>`).join("")}
      <ul class="cal" style="margin-top:10px">${plan.steps.map((s) => `<li class="${s.status || ""}"><div><div class="lbl">${esc(s.label)}</div><div class="small muted">${esc(s.date || "")}</div></div>
        <div><b>${esc(s.title)}</b><div class="small muted">${esc(s.detail)}</div></div></li>`).join("")}</ul></div>
    <div class="row" style="margin-top:18px">${noteReady() ? nextBtn("share", "커뮤니티에 올려 반응 받기") : ""}</div>`;
  $$("[data-dist]", p).forEach((b) => (b.onclick = () => { J.dist = b.dataset.dist; renderStepOnly(); }));
}

async function stepShare(p) {
  if (J.track === undefined) { try { J.track = await api("GET", `/jobs/${J.id}/community`); } catch { J.track = null; } }
  const t = J.track;
  if (t) {
    p.innerHTML = `<h2>커뮤니티 공개</h2><p class="lead">올렸어요! 관리 링크로 반응을 보고 설정을 바꿀 수 있어요.</p>${ownerSummary(t)}`;
    bindOwner(p, t);
    return;
  }
  p.innerHTML = `${await endNotice()}
    <h2>커뮤니티에 올려 반응 받기</h2>
    <p class="lead">발매 전에도 다른 사람들의 별점·태그·한마디를 받아 볼 수 있어요.</p>
    <form class="card stack" id="pubForm">
      <div><b>들려줄 범위</b><div class="chips" style="margin-top:8px" data-g="mode"><button type="button" class="chip on" data-v="highlight">하이라이트 15초만</button><button type="button" class="chip" data-v="full">전곡</button></div>
        <p class="muted small">발매 전 곡은 하이라이트만 공개하는 걸 권장해요. 공개된 음원은 다른 사람이 녹음할 수 있어요.</p></div>
      <div><b>반응 공개</b><div class="chips" style="margin-top:8px" data-g="pub"><button type="button" class="chip on" data-v="true">모두에게 공개</button><button type="button" class="chip" data-v="false">나만 보기</button></div></div>
      <label class="field"><span>한 줄 소개 <em>선택 — SNS·음원 링크 넣어도 돼요</em></span><input type="text" name="intro" maxlength="500"></label>
      <label class="check"><input type="checkbox" name="c1"><span>[필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요</span></label>
      <label class="check"><input type="checkbox" name="c2"><span>[필수] 커뮤니티에 공개하고, 내가 내릴 때까지(서비스 종료일까지) 보관돼요. 듣는 사람의 반응이 모여요</span></label>
      <button class="btn primary block" id="pubBtn">커뮤니티에 올리기</button>
    </form>`;
  bindChips(p);
  $("#pubForm").onsubmit = (e) => { e.preventDefault(); const f = e.currentTarget;
    if (!f.c1.checked || !f.c2.checked) return toast("필수 동의 두 가지에 체크해 주세요.", true);
    guard($("#pubBtn"), async () => {
      J.track = await api("POST", `/jobs/${J.id}/community`, { listen_mode: chipVal(p, "mode"), comments_public: chipVal(p, "pub") === "true", intro: f.intro.value.trim() || null, consent_rights: true, consent_public: true });
      renderJob(); toast("커뮤니티에 올렸어요!");
    }, "올리는 중"); };
}

function bindChips(root) { $$("[data-g]", root).forEach((box) => box.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; $$(".chip", box).forEach((c) => c.classList.toggle("on", c === b)); })); }
function chipVal(root, g) { return $(`[data-g=${g}] .chip.on`, root).dataset.v; }

function ownerSummary(t) {
  const s = t.stats;
  return `<div class="card"><div class="row" style="align-items:flex-start;gap:18px"><img src="${esc(t.cover_url)}" alt="" style="width:120px;border-radius:12px">
    <div class="sp"><h3>${esc(t.title)}</h3><div class="muted">${esc(t.artist)}</div>
      <div class="row small" style="margin-top:8px"><span class="pill">${t.listen_mode === "full" ? "전곡" : "하이라이트"}</span><span class="pill">${t.comments_public ? "반응 공개" : "나만 보기"}</span>
      ${t.status && t.status !== "live" ? `<span class="pill fail">${t.status === "reported" ? "신고로 숨겨짐 — 운영자 확인 중" : "운영자가 내림"}</span>` : ""}</div>
      <div class="row" style="margin-top:10px"><b>재생 ${t.plays}</b><b>반응 ${s.reactions}</b>${s.rating_avg ? `<b>★ ${s.rating_avg}</b>` : ""}</div></div></div>
    <hr><b>관리 링크</b><p class="muted small">이 링크가 있어야 반응을 보고, 설정을 바꾸고, 곡을 내릴 수 있어요. ${ME ? "로그인했으니 '내 곡'에서도 열 수 있어요." : "꼭 저장해 두세요 (로그인하면 '내 곡'에서 다시 열 수 있어요)."}</p>
    <div class="keybox" id="mkey">${esc(location.origin + t.manage_url)}</div>
    <div class="row" style="margin-top:10px"><button class="btn small" id="copyKey">링크 복사</button><a class="btn small" href="${esc(t.manage_url)}" target="_blank" rel="noopener">관리 화면 열기</a><a class="btn small" href="#/track/${esc(t.track_id)}">커뮤니티에서 보기</a></div></div>
    ${t.feedback?.length ? `<div class="card"><h3>받은 반응</h3>${t.feedback.map(fbItem).join("")}</div>` : `<div class="card muted">아직 반응이 없어요. 링크를 친구에게 보내 보세요!</div>`}`;
}
function bindOwner(root, t) { $("#copyKey", root)?.addEventListener("click", () => navigator.clipboard.writeText(location.origin + t.manage_url).then(() => toast("관리 링크를 복사했어요."))); }

/* ---------- 바로 공개 ---------- */

async function quick() {
  const tok = await api("GET", "/community/form-token");
  view.innerHTML = `${await endNotice()}
  <div class="panel"><div class="eyebrow">AI 분석 없이</div><h2>곡만 올려서 반응 받기</h2>
    <p class="lead">음원과 제목만 있으면 바로 커뮤니티에 올라가요. 원본 파일은 남기지 않고, 공개용 음원만 보관해요.</p></div>
  <form class="card stack" id="qForm">
    <label class="field"><span>음원 파일 <em>mp3·wav, 15초~10분</em></span><input type="file" name="file" accept=".mp3,.wav,audio/mpeg,audio/wav" required></label>
    <div class="grid2"><label class="field"><span>곡 제목</span><input type="text" name="title" maxlength="100" required></label>
      <label class="field"><span>아티스트 이름</span><input type="text" name="artist" maxlength="100" required></label></div>
    <div class="grid2"><label class="field"><span>장르 <em>선택</em></span><input type="text" name="genre" maxlength="50"></label>
      <label class="field"><span>커버 이미지 <em>선택 — 없으면 색으로 만들어요</em></span><input type="file" name="cover" accept="image/jpeg,image/png"></label></div>
    <label class="field"><span>한 줄 소개 <em>선택 — SNS·음원 링크 넣어도 돼요</em></span><input type="text" name="intro" maxlength="500"></label>
    <div><b>들려줄 범위</b><div class="chips" style="margin-top:8px" data-g="mode"><button type="button" class="chip on" data-v="highlight">하이라이트 15초 (가장 에너지 큰 구간)</button><button type="button" class="chip" data-v="full">전곡</button></div></div>
    <div><b>반응 공개</b><div class="chips" style="margin-top:8px" data-g="pub"><button type="button" class="chip on" data-v="true">모두에게 공개</button><button type="button" class="chip" data-v="false">나만 보기</button></div></div>
    <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="c1"><span>[필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요</span></label>
    <label class="check"><input type="checkbox" name="c2"><span>[필수] 커뮤니티에 공개하고, 내가 내릴 때까지(서비스 종료일까지) 보관돼요. 듣는 사람의 반응과 접속 IP(도배 방지용, 7일 보관)가 모여요</span></label>
    <p class="err" id="qErr"></p>
    <button class="btn primary block" id="qBtn">바로 공개하기</button>
  </form>
  <div id="qDone"></div>`;
  let token = tok.token;
  bindChips(view);
  $("#qForm").onsubmit = (e) => { e.preventDefault(); const f = e.currentTarget;
    if (!f.c1.checked || !f.c2.checked) return ($("#qErr").textContent = "필수 동의 두 가지에 체크해 주세요.");
    const fd = new FormData();
    fd.append("file", f.file.files[0]); if (f.cover.files[0]) fd.append("cover", f.cover.files[0]);
    for (const k of ["title", "artist", "genre", "intro"]) fd.append(k, f[k].value.trim());
    fd.append("listen_mode", chipVal(view, "mode")); fd.append("comments_public", chipVal(view, "pub"));
    fd.append("consent_rights", "true"); fd.append("consent_public", "true");
    fd.append("form_token", token); fd.append("website", f.website.value);
    $("#qErr").textContent = "";
    guard($("#qBtn"), async () => {
      const t = await api("POST", "/community/tracks", fd, { form: true });
      $("#qForm").remove();
      $("#qDone").innerHTML = `<div class="notice ok" style="margin-bottom:16px">공개했어요! 아래 관리 링크를 꼭 저장해 두세요.</div>${ownerSummary(t)}`;
      bindOwner($("#qDone"), t);
    }, "올리는 중").catch(async (err) => { $("#qErr").textContent = err.message; token = (await api("GET", "/community/form-token")).token; });
  };
}

/* ---------- 커뮤니티 ---------- */

let FEED = { sort: "new", q: "" };
function trackCard(t) {
  const s = t.stats;
  return `<a class="track" href="#/track/${esc(t.track_id)}"><div class="cv"><img src="${esc(t.cover_url)}" alt="" loading="lazy">${t.listen_mode === "highlight" ? `<span class="pill accent">하이라이트</span>` : ""}</div>
    <div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}${t.genre ? " · " + esc(t.genre) : ""}</div>
    <div class="m">▶ ${t.plays} · 반응 ${t.reactions}${s?.rating_avg ? ` · ★ ${s.rating_avg}` : ""}</div></a>`;
}

let META = null;
async function endNotice() {
  // 서비스 종료일은 정해지면 서버 SERVICE_END_DATE에 넣고, 그때부터 화면에 미리 안내한다 (DECISIONS #35)
  try { META = META || (await api("GET", "/community/meta")); } catch { return ""; }
  return META.service_end_date ? `<div class="notice warn" style="margin-bottom:16px">이 서비스는 <b>${esc(META.service_end_date)}</b>에 종료돼요. 그날 커뮤니티에 공개된 곡과 반응이 모두 삭제돼요. 필요한 건 미리 받아 두세요.</div>` : "";
}

async function community() {
  view.innerHTML = `${await endNotice()}
  <div class="panel"><div class="eyebrow">들어봐 (가칭)</div><h2>커뮤니티</h2><p class="lead">처음 만든 노래들이 올라와요. 들어 보고 별점·한마디로 응원해 주세요. 로그인 없이 반응을 남길 수 있어요.</p></div>
  <div class="row" style="margin-bottom:18px"><div class="tabs" id="sorts">${[["new", "최신"], ["popular", "인기"], ["random", "랜덤"]].map(([v, l]) => `<button class="tab ${FEED.sort === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div>
    <span class="sp"></span><input type="search" id="q" placeholder="제목·아티스트 검색" value="${esc(FEED.q)}" style="max-width:260px"><a class="btn primary small" href="#/quick">내 곡 올리기</a></div>
  <div class="tracks" id="feed"><div class="empty"><span class="spinner"></span></div></div>`;
  const load = async () => {
    const d = await api("GET", `/community/tracks?sort=${FEED.sort}&limit=50${FEED.q ? "&q=" + encodeURIComponent(FEED.q) : ""}`);
    $("#feed").innerHTML = d.tracks.length ? d.tracks.map(trackCard).join("") : `<div class="empty">${FEED.q ? "찾는 곡이 없어요." : "아직 올라온 곡이 없어요. 첫 곡을 올려 보세요!"}</div>`;
  };
  $("#sorts").onclick = (e) => { const b = e.target.closest(".tab"); if (!b) return; FEED.sort = b.dataset.v; $$("#sorts .tab").forEach((x) => x.classList.toggle("on", x === b)); load(); };
  let tm; $("#q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { FEED.q = e.target.value.trim(); load(); }, 300); };
  await load();
}

function fbItem(f, i, all, trackId) {
  const stars = f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) : "";
  return `<div class="fb"><div class="row"><span class="who">${esc(f.nickname)}</span><span style="color:#f5b301">${stars}</span><span class="sp"></span>
    <span class="meta">${new Date(f.created_at).toLocaleDateString("ko-KR")}</span>${trackId ? `<button class="linkbtn" data-rep="${f.id}">신고</button>` : ""}${f.hidden ? `<span class="pill">숨김</span>` : ""}</div>
    ${f.tags.length ? `<div class="chips" style="margin-top:6px">${f.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>` : ""}
    ${f.comment ? `<p style="margin:6px 0 0">${esc(f.comment)}</p>` : ""}</div>`;
}

async function trackView(id) {
  const [t, meta] = await Promise.all([api("GET", `/community/tracks/${id}`), api("GET", "/community/meta")]);
  let token = (await api("GET", "/community/form-token")).token;
  const s = t.stats;
  view.innerHTML = `
  <a class="btn small ghost" href="#/community">← 커뮤니티</a>
  <div class="detail" style="margin-top:14px">
    <div><div class="bigcv"><img src="${esc(t.cover_url)}" alt=""></div>
      <audio id="player" controls preload="none" src="${esc(t.audio_url)}" style="margin-top:14px"></audio>
      <p class="muted small">${t.listen_mode === "highlight" ? `하이라이트 ${Math.round(t.clip_sec)}초만 공개된 곡이에요.` : "전곡 공개"} · ▶ <span id="plays">${t.plays}</span></p>
      <button class="linkbtn" id="repTrack">이 곡 신고하기</button></div>
    <div>
      <div class="eyebrow">${esc(t.genre || "음악")}</div><h2 style="font-size:30px">${esc(t.title)}</h2><div class="muted" style="font-size:17px">${esc(t.artist)}</div>
      ${t.intro ? `<p style="white-space:pre-wrap">${linkify(t.intro)}</p>` : ""}
      ${t.moods.length ? `<div class="chips">${t.moods.map((m) => `<span class="pill">${esc(m)}</span>`).join("")}</div>` : ""}
      ${s ? `<div class="card" style="margin-top:18px"><div class="row"><h3>${s.rating_avg ? `★ ${s.rating_avg}` : "아직 별점 없음"}</h3><span class="muted small">반응 ${s.reactions} · 한마디 ${s.comments}</span></div>
        ${Object.entries(s.tags).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([tag, n]) => `<div class="row small" style="margin-top:8px"><span style="width:120px">${esc(tag)}</span><div class="bar sp"><i style="width:${Math.round(100 * n / s.reactions)}%"></i></div><span>${n}</span></div>`).join("")}</div>`
        : `<div class="notice" style="margin-top:18px">올린 사람이 반응을 '나만 보기'로 설정했어요. 남긴 반응은 올린 사람에게만 전달돼요.</div>`}
      <form class="card stack" id="fbForm" style="margin-top:16px">
        <h3>반응 남기기</h3>
        <div class="stars" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n}점">★</button>`).join("")}</div>
        <div class="chips" id="tags">${meta.tags.map((tag) => `<button type="button" class="chip" data-v="${esc(tag)}">${esc(tag)}</button>`).join("")}</div>
        <textarea name="comment" maxlength="500" placeholder="한마디 (선택) — 욕설·광고·링크는 등록되지 않아요"></textarea>
        <div class="row"><input type="text" name="nickname" maxlength="20" placeholder="닉네임 (선택)" style="max-width:200px"><span class="sp"></span><button class="btn primary" id="fbBtn">남기기</button></div>
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="muted small">로그인 없이 남길 수 있어요. 도배 방지를 위해 접속 IP를 7일 동안 보관하고 화면에는 표시하지 않아요.</p>
        <p class="err" id="fbErr"></p>
      </form>
      <div id="fbList" style="margin-top:8px">${t.feedback.map((f, i, a) => fbItem(f, i, a, t.track_id)).join("")}</div>
    </div>
  </div>`;
  let rating = null;
  $("#stars").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; rating = Number(b.dataset.n); $$("#stars button").forEach((x) => x.classList.toggle("on", Number(x.dataset.n) <= rating)); };
  $("#tags").onclick = (e) => { const b = e.target.closest(".chip"); if (b) b.classList.toggle("on"); };
  let counted = false;
  $("#player").addEventListener("play", () => { if (counted) return; counted = true; api("POST", `/community/tracks/${id}/play`).then((r) => ($("#plays").textContent = r.plays)).catch(() => {}); });
  $("#fbForm").onsubmit = (e) => { e.preventDefault(); const f = e.currentTarget;
    const body = { rating, tags: $$("#tags .chip.on").map((b) => b.dataset.v), comment: f.comment.value.trim() || null, nickname: f.nickname.value.trim() || null, form_token: token, website: f.website.value };
    $("#fbErr").textContent = "";
    guard($("#fbBtn"), async () => { await api("POST", `/community/tracks/${id}/feedback`, body); toast(t.comments_public ? "반응을 남겼어요. 고마워요!" : "올린 사람에게 전달했어요. 고마워요!"); await trackView(id); }, "보내는 중")
      .catch(async (err) => { $("#fbErr").textContent = err.message; token = (await api("GET", "/community/form-token")).token; });
  };
  const report = (path) => {
    const m = modal(`<h3>신고하기</h3><p class="muted small">서로 다른 사람에게 여러 번 신고되면 자동으로 숨겨지고 운영자가 확인해요.</p>
      <div class="chips" data-g="reason" style="margin:12px 0">${Object.entries(meta.report_reasons).map(([v, l], i) => `<button type="button" class="chip ${i === 0 ? "on" : ""}" data-v="${esc(v)}">${esc(l)}</button>`).join("")}</div>
      <textarea id="repDetail" maxlength="300" placeholder="자세한 내용 (선택) — 무단 업로드면 원곡 정보를 적어 주세요"></textarea>
      <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn" id="mCancel">취소</button><button class="btn primary" id="mGo">신고</button></div>`);
    bindChips(m);
    $("#mCancel", m).onclick = () => $("#modal").close();
    $("#mGo", m).onclick = (e) => guard(e.currentTarget, async () => { const r = await api("POST", path, { reason: chipVal(m, "reason"), detail: $("#repDetail").value.trim() || null }); $("#modal").close(); toast(r.message); if (r.hidden) location.hash = "#/community"; });
  };
  $("#repTrack").onclick = () => report(`/community/tracks/${id}/report`);
  $("#fbList").onclick = (e) => { const b = e.target.closest("[data-rep]"); if (b) report(`/community/tracks/${id}/feedback/${b.dataset.rep}/report`); };
}

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow ugc">${u}</a>`);
}

/* ---------- 내 곡 ---------- */

async function me() {
  await loadMe();
  const cancelled = location.hash.includes("cancelled");
  const recent = store.get("recentJobs", []);
  if (!ME) {
    const pv = await api("GET", "/auth/providers");
    const any = pv.kakao || pv.google || pv.dev;
    view.innerHTML = `
    <div class="panel"><h2>내 곡</h2><p class="lead">곡을 올리는 사람만 로그인해요. 듣고 반응하는 데는 로그인이 필요 없어요.</p></div>
    <div class="grid2">
      <div class="card stack"><h3>로그인</h3><p class="muted small">카카오·구글 계정의 고유 번호와 닉네임만 받아요. 이메일·비밀번호는 받지 않아요.</p>
        ${cancelled ? `<div class="notice warn">로그인을 취소했어요.</div>` : ""}
        ${pv.kakao ? `<a class="btn kakao block" href="/auth/kakao/login?next=${encodeURIComponent("/studio#/me")}">카카오로 시작하기</a>` : ""}
        ${pv.google ? `<a class="btn google block" href="/auth/google/login?next=${encodeURIComponent("/studio#/me")}">Google로 시작하기</a>` : ""}
        ${pv.dev ? `<a class="btn block" href="/auth/dev/login?next=${encodeURIComponent("/studio#/me")}">테스트 로그인 (로컬 확인용)</a>` : ""}
        ${any ? "" : `<div class="notice">로그인은 준비 중이에요 (카카오·구글 앱 등록 후 켜져요). 로그인 없이도 관리 링크로 모든 기능을 쓸 수 있어요.</div>`}
        <p class="muted small">로그인하지 않아도 돼요. 대신 곡마다 받는 관리 링크를 잘 저장해 두세요.</p></div>
      <div class="card"><h3>이 브라우저에서 연 작업</h3>${recentList(recent)}</div>
    </div>`;
    return;
  }
  const [jobs, tracks] = await Promise.all([api("GET", "/me/jobs"), api("GET", "/me/tracks")]);
  view.innerHTML = `
  <div class="panel"><div class="row"><div><div class="eyebrow">${esc(ME.provider)} 로그인</div><h2>${esc(ME.nickname)} 님의 곡</h2></div><span class="sp"></span>
    <button class="btn small" id="logout">로그아웃</button><button class="btn small ghost" id="withdraw">탈퇴</button></div></div>
  <div class="card"><div class="row"><h3>커뮤니티에 올린 곡</h3><span class="sp"></span><a class="btn small" href="#/quick">곡 올리기</a></div>
    ${tracks.length ? `<div class="tracks" style="margin-top:14px">${tracks.map((t) => `<div><a class="track" href="${esc(t.manage_url)}" target="_blank" rel="noopener"><div class="cv"><img src="${esc(t.cover_url)}" alt="" loading="lazy"></div>
      <div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}</div><div class="m">▶ ${t.plays} · 반응 ${t.reactions}${t.status !== "live" ? ` · <b style="color:var(--fail)">${t.status === "reported" ? "신고로 숨겨짐" : "내려감"}</b>` : ""}</div></a></div>`).join("")}</div>` : `<p class="muted">아직 없어요.</p>`}</div>
  <div class="card"><div class="row"><h3>발매 준비 중인 작업</h3><span class="sp"></span><a class="btn small" href="#/new">새 곡</a></div>
    <p class="muted small">작업(음원·결과물)은 올린 지 7일 뒤 자동으로 지워져요. 커뮤니티에 올린 곡은 남아요.</p>
    ${jobs.length ? `<ul class="cal">${jobs.map((j) => `<li><div class="small muted">${new Date(j.created_at).toLocaleDateString("ko-KR")}</div><div class="row"><a href="#/job/${esc(j.job_id)}/listen"><b>${esc(j.title)}</b></a><span class="muted small">${esc(j.artist)}</span><span class="pill">${esc(j.stage_label)}</span>${j.track_id ? `<span class="pill ok">공개함</span>` : ""}</div></li>`).join("")}</ul>` : `<p class="muted">아직 없어요.</p>`}</div>
  <div class="card"><h3>이 브라우저에서 연 작업</h3>${recentList(recent)}</div>`;
  $("#logout").onclick = async () => { await api("POST", "/auth/logout"); await loadMe(); toast("로그아웃했어요."); route(); };
  $("#withdraw").onclick = () => { const m = modal(`<h3>탈퇴할까요?</h3><p class="muted">로그인 정보(고유 번호·닉네임)를 지워요. 올린 곡은 지워지지 않고, 곡마다 받은 관리 링크로 계속 관리하거나 내릴 수 있어요.</p>
      <div class="row"><span class="sp"></span><button class="btn" id="mCancel">취소</button><button class="btn primary" id="mGo">탈퇴</button></div>`);
    $("#mCancel", m).onclick = () => $("#modal").close();
    $("#mGo", m).onclick = async () => { await api("DELETE", "/auth/me"); $("#modal").close(); await loadMe(); toast("탈퇴했어요."); route(); }; };
}

function recentList(list) {
  return list.length ? `<ul class="cal">${list.map((j) => `<li><div class="small muted">${new Date(j.at).toLocaleDateString("ko-KR")}</div><a href="#/job/${esc(j.id)}/listen"><b>${esc(j.title || j.id)}</b></a></li>`).join("")}</ul>`
    : `<p class="muted small">아직 없어요.</p>`;
}

/* ---------- 시작 ---------- */

(async () => {
  // 다른 주소 화면용 #session= 은 이 화면에선 쓰지 않음 (쿠키로 로그인됨) — 주소에서만 지운다
  if (location.hash.includes("session=")) history.replaceState(null, "", location.pathname + location.hash.replace(/[#&]?session=[^&]*/, ""));
  loadMe();
  route();
})();
