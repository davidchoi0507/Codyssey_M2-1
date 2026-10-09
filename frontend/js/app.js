/**
 * Indie Album Studio - Frontend Application Core
 * E2E Wizard flow for Audio Multimodal & Multi-Agent Branding
 */

// 1. Configuration & Constants
const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "https://api.201.n-e.kr"
  : "";

const HIGHLIGHT_DURATION = 15; // 초

// 2. Global State
let currentStep = 1;
let currentJobId = null;
let currentBandCode = "";
let pollTimer = null;
let noteData = null;
let packageData = null;
let lastStatusData = null;
let jobStartTime = null;
let hlAudioTimer = null;
let activeChannelTab = "instagram";
let activePitchTab = "ko";

// 3. DOM Utility Helpers
const $ = (id) => document.getElementById(id);
const esc = (s) => (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function showToast(msg, isError = false) {
  const toast = $("globalToast");
  toast.textContent = msg;
  toast.style.borderColor = isError ? "var(--accent-error)" : "rgba(99, 102, 241, 0.5)";
  toast.style.color = isError ? "#fca5a5" : "#ffffff";
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatDuration(sec) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

// 4. API Wrapper
async function api(method, path, body = null, isFormData = false, customHeaders = {}) {
  const headers = { ...customHeaders };
  const currentCode = currentBandCode || ($("bandCode") ? $("bandCode").value.trim() : "");
  if (currentCode && !headers["X-Band-Code"]) {
    headers["X-Band-Code"] = currentCode;
  }
  if (!isFormData && body) {
    headers["Content-Type"] = "application/json";
  }

  const url = API_BASE + path;
  const opts = {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : null)
  };

  const res = await fetch(url, opts);
  if (!res.ok) {
    let errInfo = { code: res.status.toString(), message: `HTTP 오류 ${res.status}` };
    try {
      const json = await res.json();
      if (json.detail) errInfo.message = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
      if (json.message) errInfo.message = json.message;
      if (json.code) errInfo.code = json.code;
    } catch (_) {}
    throw errInfo;
  }
  return res.json();
}

// 5. Wizard Stepper Navigation
function setStep(stepNum) {
  currentStep = stepNum;
  for (let i = 1; i <= 4; i++) {
    const stepEl = $(`step${i}`);
    const indicatorEl = $(`stepIndicator${i}`);
    const lineEl = $(`stepLine${i}`);

    if (stepEl) {
      if (i === stepNum) {
        stepEl.classList.add("active");
      } else {
        stepEl.classList.remove("active");
      }
    }

    if (indicatorEl) {
      indicatorEl.classList.remove("active", "completed");
      if (i === stepNum) {
        indicatorEl.classList.add("active");
      } else if (i < stepNum) {
        indicatorEl.classList.add("completed");
      }
    }

    if (lineEl) {
      if (i < stepNum) {
        lineEl.classList.add("completed");
      } else {
        lineEl.classList.remove("completed");
      }
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// STEP 1: 곡 올리기 & 초대 코드
// ============================================================

// 1-A. 밴드 초대 코드 검증
async function verifyBandCode() {
  const code = $("bandCode").value.trim();
  const banner = $("bandInfoBanner");
  const jobsList = $("bandJobsList");

  if (!code) {
    banner.classList.add("hidden");
    jobsList.classList.add("hidden");
    return;
  }

  try {
    const info = await api("GET", "/band", null, false, { "X-Band-Code": code });
    currentBandCode = code;
    try { localStorage.setItem("bandCode", code); } catch (_) {}

    banner.innerHTML = `✅ <strong>${esc(info.name)}</strong> · 오늘 ${info.used_today}/${info.daily_limit}곡 사용 (남은 업로드: <strong>${info.remaining_today}곡</strong>)`;
    banner.classList.remove("hidden");

    loadBandJobs(code);
    showToast(`${info.name} 밴드 코드가 확인되었습니다.`);
  } catch (err) {
    banner.innerHTML = `<span style="color:var(--accent-error);">⚠️ ${esc(err.message || "유효하지 않은 초대 코드입니다.")}</span>`;
    banner.classList.remove("hidden");
    jobsList.classList.add("hidden");
  }
}

async function loadBandJobs(code) {
  const jobsList = $("bandJobsList");
  try {
    const res = await api("GET", "/band/jobs", null, false, { "X-Band-Code": code });
    if (res.jobs && res.jobs.length > 0) {
      jobsList.innerHTML = `<span class="chip-label">📂 이 밴드의 작업 이어하기:</span> ` +
        res.jobs.map(j => `
          <button type="button" class="btn-sample" data-job="${j.job_id}">
            ${esc(j.title || j.job_id.slice(-6))} (${j.stage_label})
          </button>
        `).join("");
      jobsList.classList.remove("hidden");

      jobsList.querySelectorAll("[data-job]").forEach(btn => {
        btn.onclick = () => openJob(btn.dataset.job);
      });
    } else {
      jobsList.classList.add("hidden");
    }
  } catch (_) {
    jobsList.classList.add("hidden");
  }
}

// 1-B. 로컬 스토리지 최근 작업
function rememberRecentJob(id, title) {
  try {
    let list = JSON.parse(localStorage.getItem("recentJobs") || "[]");
    list = list.filter(item => item.job_id !== id);
    list.unshift({ job_id: id, title: title || id.slice(-6), time: new Date().toISOString() });
    localStorage.setItem("recentJobs", JSON.stringify(list.slice(0, 8)));
  } catch (_) {}
  renderRecentJobs();
}

function renderRecentJobs() {
  const el = $("recentBrowserJobs");
  try {
    const list = JSON.parse(localStorage.getItem("recentJobs") || "[]");
    if (list.length > 0) {
      el.innerHTML = `<span class="sample-label">🕘 최근 브라우저 작업:</span> ` +
        list.map(j => `<button type="button" class="btn-sample" data-job="${j.job_id}">${esc(j.title)}</button>`).join(" ");
      el.querySelectorAll("[data-job]").forEach(btn => {
        btn.onclick = () => openJob(btn.dataset.job);
      });
    }
  } catch (_) {}
}

// 1-C. 드롭존 및 파일 핸들링
function initDropzone() {
  const dropzone = $("audioDropzone");
  const fileInput = $("audioFile");
  const prompt = $("dropzonePrompt");
  const selected = $("fileSelectedCard");
  const nameEl = $("selectedFileName");
  const sizeEl = $("selectedFileSize");

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(mp3|wav)$/i)) {
      showToast("mp3 또는 wav 형식의 음원 파일만 지원합니다.", true);
      return;
    }
    nameEl.textContent = file.name;
    sizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    prompt.classList.add("hidden");
    selected.classList.remove("hidden");

    // 곡 제목 자동 입력 (비어있을 때)
    if (!$("trackTitle").value.trim()) {
      $("trackTitle").value = file.name.replace(/\.[^.]+$/, "");
    }
  }

  dropzone.onclick = (e) => {
    if (e.target.id === "btnRemoveFile") return;
    fileInput.click();
  };

  fileInput.onchange = () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove("dragover");
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFile(e.dataTransfer.files[0]);
    }
  };

  $("btnRemoveFile").onclick = (e) => {
    e.stopPropagation();
    fileInput.value = "";
    prompt.classList.remove("hidden");
    selected.classList.add("hidden");
  };
}

// 1-D. 음원 업로드 & 작업 시작
async function startJob() {
  const file = $("audioFile").files[0];
  if (!file) {
    showToast("음원 파일(.mp3, .wav)을 먼저 선택해 주세요.", true);
    return;
  }

  const title = $("trackTitle").value.trim();
  const artist = $("artistName").value.trim();
  if (!title || !artist) {
    showToast("곡 제목과 아티스트명을 입력해 주세요.", true);
    return;
  }

  if (!$("consentOriginal").checked || !$("consentPrivacy").checked || !$("consentExternalAi").checked) {
    showToast("필수 동의 항목 3개에 모두 동의해 주세요.", true);
    return;
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", title);
  fd.append("artist", artist);
  fd.append("genre", $("genre").value.trim());
  fd.append("description", $("trackDesc").value.trim());
  
  if (!$("instrumentalToggle").checked && $("lyrics").value.trim()) {
    fd.append("lyrics", $("lyrics").value.trim());
  }

  fd.append("consent_original", $("consentOriginal").checked);
  fd.append("consent_privacy", $("consentPrivacy").checked);
  fd.append("consent_external_ai", $("consentExternalAi").checked);
  fd.append("consent_showcase", $("consentShowcase").checked);
  fd.append("consent_version", "v1-1006");

  const btn = $("btnStartJob");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> 음원 업로드 중...`;

  try {
    const res = await api("POST", "/jobs", fd, true);
    currentJobId = res.job_id;
    jobStartTime = Date.now();
    rememberRecentJob(currentJobId, title);

    setStep(2);
    openJob(currentJobId);
  } catch (err) {
    showToast(err.message || "업로드에 실패했습니다.", true);
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">⚡</span> 음원 분석 & 앨범 브랜딩 시작하기`;
  }
}

function openJob(jobId) {
  currentJobId = jobId;
  jobStartTime = jobStartTime || Date.now();
  rememberRecentJob(jobId);
  setStep(2);
  pollJob();
}

// ============================================================
// STEP 2: 폴링 및 진행 상태 (Labor Illusion)
// ============================================================

async function pollJob() {
  clearTimeout(pollTimer);
  if (!currentJobId) return;

  try {
    const st = await api("GET", `/jobs/${currentJobId}`);
    lastStatusData = st;
    renderStatus(st);

    if (st.stage === "note_ready") {
      setStep(3);
      await loadNote();
      return;
    }

    if (st.stage === "awaiting_cover" || st.stage === "done") {
      setStep(4);
      await loadPackage(st.stage);
      return;
    }

    if (st.stage === "rendering") {
      setStep(4);
      await loadPackage(st.stage);
      pollTimer = setTimeout(pollJob, 2500);
      return;
    }

    if (st.stage === "failed") {
      return;
    }

    pollTimer = setTimeout(pollJob, 2000);
  } catch (err) {
    $("step2ErrorBox").textContent = `[${err.code || "ERR"}] ${err.message}`;
    $("step2ErrorBox").classList.remove("hidden");
  }
}

function renderStatus(st) {
  $("step2JobBadge").textContent = `JOB: ${st.job_id}`;
  if (st.expires_at) {
    $("step2ExpireText").textContent = `${formatDate(st.expires_at)} 자동 삭제`;
  }

  // Stage Messages
  const stageTitles = {
    uploaded: "음원을 안전하게 수신했어요",
    analyzing: "AI가 음악의 감정선과 사운드를 청취 중이에요",
    generating: "A&R 기획서와 커버 아트워크를 생성 중이에요",
    rendering: "숏폼 비주얼라이저와 Canvas 영상을 렌더링하고 있어요",
    done: "모든 발매 에셋 제작이 완료되었습니다!"
  };

  $("stageMainLabel").textContent = stageTitles[st.stage] || st.stage_label;
  $("progressBarFill").style.width = `${Math.max(10, Math.round(st.progress * 100))}%`;

  if (st.queue_position) {
    $("queuePositionText").textContent = `대기 순번: ${st.queue_position}번째`;
  } else {
    $("queuePositionText").textContent = st.stage_label;
  }

  if (jobStartTime) {
    const sec = Math.round((Date.now() - jobStartTime) / 1000);
    $("elapsedTimeText").textContent = `${sec}초 경과`;
  }

  // Steps Pills
  if (st.steps) {
    $("stepsTracker").innerHTML = st.steps.map(s => `
      <span class="step-badge ${s.status}">${s.label}</span>
    `).join("");
  }

  // Early Result (librosa)
  if (st.early) {
    $("earlyResultCard").classList.remove("hidden");
    $("earlyBpm").textContent = `${st.early.bpm} BPM`;
    $("earlyDuration").textContent = formatDuration(st.early.duration_sec);
    $("earlySummaryText").textContent = st.early.summary;

    if (st.early.bpm < 95) $("earlyBpmBadge").textContent = "느긋한 템포";
    else if (st.early.bpm > 125) $("earlyBpmBadge").textContent = "빠르고 에너지 넘침";
    else $("earlyBpmBadge").textContent = "보통 빠르기";

    if (st.early.waveform) {
      drawWaveform("earlyWaveCanvas", st.early.waveform);
    }
  }

  // Error & Retry
  if (st.error) {
    $("step2ErrorBox").textContent = `[${st.error.code}] ${st.error.message}`;
    $("step2ErrorBox").classList.remove("hidden");
    if (st.error.retryable) {
      $("btnRetryStep").classList.remove("hidden");
    }
  } else {
    $("step2ErrorBox").classList.add("hidden");
    $("btnRetryStep").classList.add("hidden");
  }
}

function drawWaveform(canvasId, waveform) {
  const c = $(canvasId);
  if (!c || !waveform) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.fillStyle = "#6366f1";
  const barWidth = c.width / waveform.length;
  waveform.forEach((val, i) => {
    const h = Math.max(2, val * c.height * 0.9);
    ctx.fillRect(i * barWidth, (c.height - h) / 2, Math.max(1, barWidth - 0.5), h);
  });
}

// 대기 중 추가 정보 저장
async function saveExtraInfo() {
  if (!currentJobId) return;
  const channels = Array.from(document.querySelectorAll('input[name="channels"]:checked')).map(el => el.value);
  const release_date = $("extraReleaseDate").value || null;

  try {
    await api("PATCH", `/jobs/${currentJobId}/info`, { channels, release_date });
    showToast("추가 정보가 저장되었습니다.");
  } catch (err) {
    showToast(err.message || "추가 정보 저장 실패", true);
  }
}

// ============================================================
// STEP 3: A&R 기획서 조율 & 수락
// ============================================================

async function loadNote() {
  if (!currentJobId) return;
  try {
    noteData = await api("GET", `/jobs/${currentJobId}/note`);
    renderNote(noteData);
  } catch (err) {
    showToast(err.message || "노트를 불러오지 못했습니다.", true);
  }
}

function renderNote(note) {
  $("noteVersionBadge").textContent = `v${note.version}`;
  $("editsRemainingPill").textContent = `AI 수정 잔여 ${note.edits_remaining}회`;

  // Interpretation
  $("noteInterpretationText").textContent = note.interpretation;

  // Evidence Row
  const ev = note.evidence;
  $("noteEvidenceRow").innerHTML = `
    <span class="evidence-chip">🥁 체감 ${ev.bpm} BPM</span>
    <span class="evidence-chip">🎹 Key: ${ev.key}</span>
    <span class="evidence-chip">⚡ 에너지: ${ev.energy_change}</span>
    <span class="evidence-chip">🤖 엔진: ${note.ai_generated.models.join(", ")}</span>
  `;

  if (note.user_correction) {
    $("userCorrectionBanner").innerHTML = `반영된 밴드 피드백: “${esc(note.user_correction)}”`;
    $("userCorrectionBanner").classList.remove("hidden");
  } else {
    $("userCorrectionBanner").classList.add("hidden");
  }

  // Direct Edit: Mood Keywords
  $("editMoodKeywords").value = (note.mood_keywords || []).join(", ");

  // Direct Edit: Color Swatches
  renderColorSwatches(note.colors || ["#1B2A4A", "#FF6B35", "#8E7CC3"]);

  // Direct Edit: Cover Directions
  renderCoverDirections(note.cover_directions || []);

  // Highlight Section
  renderHighlight(note);
}

function renderColorSwatches(colors) {
  const container = $("colorSwatchesContainer");
  const labels = ["도입 무드", "절정 에너지", "여운 컬러"];
  container.innerHTML = colors.map((col, idx) => `
    <div class="swatch-item">
      <input type="color" value="${col}" class="swatch-picker" data-index="${idx}" style="background:none;border:none;cursor:pointer;width:32px;height:32px;">
      <span class="swatch-label">${labels[idx] || `컬러 ${idx + 1}`}</span>
      <span class="color-hex-text" style="font-family:var(--font-mono);font-size:11px;">${col}</span>
    </div>
  `).join("");

  container.querySelectorAll(".swatch-picker").forEach(picker => {
    picker.onchange = (e) => {
      picker.parentElement.querySelector(".color-hex-text").textContent = e.target.value.toUpperCase();
    };
  });
}

function renderCoverDirections(dirs) {
  const container = $("coverDirectionsContainer");
  container.innerHTML = dirs.map(d => `
    <div class="input-field" style="margin-bottom:10px;">
      <label style="font-size:12px;color:var(--text-dim);">시안 ${d.id.toUpperCase()}:</label>
      <input type="text" class="cover-dir-input" data-id="${d.id}" value="${esc(d.text)}">
    </div>
  `).join("");
}

function renderHighlight(note) {
  const hl = note.highlight;
  const candidatesRow = $("highlightCandidatesRow");
  candidatesRow.innerHTML = hl.candidates.map(c => `
    <button type="button" class="cand-btn ${c.id === hl.recommended_id ? "selected" : ""}" data-start="${c.start}">
      ${c.id === hl.recommended_id ? "★ AI 추천" : "후보"} (${formatDuration(c.start)} ~ ${formatDuration(c.end)})
      <span style="font-size:10px;display:block;color:var(--text-dim);">${esc(c.reason)}</span>
    </button>
  `).join("");

  candidatesRow.querySelectorAll(".cand-btn").forEach(btn => {
    btn.onclick = () => {
      candidatesRow.querySelectorAll(".cand-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      $("hlSlider").value = btn.dataset.start;
      updateHighlightPreview();
    };
  });

  // Slider & Waveform
  if (lastStatusData && lastStatusData.early) {
    $("hlSlider").max = Math.max(0, lastStatusData.early.duration_sec - HIGHLIGHT_DURATION);
  }
  $("hlSlider").value = hl.selected.start;
  updateHighlightPreview();

  $("hlSlider").oninput = () => updateHighlightPreview();

  // Audio setup
  if (lastStatusData && lastStatusData.audio_url) {
    $("hlAudioElement").src = API_BASE + lastStatusData.audio_url;
  }
}

function updateHighlightPreview() {
  const start = parseFloat($("hlSlider").value);
  const end = start + HIGHLIGHT_DURATION;
  $("highlightNowLabel").textContent = `선택: ${formatDuration(start)} ~ ${formatDuration(end)}`;

  // Draw Highlight Waveform
  if (noteData && noteData.waveform) {
    const c = $("hlWaveCanvas");
    const ctx = c.getContext("2d");
    const w = noteData.waveform;
    const dur = (lastStatusData && lastStatusData.early && lastStatusData.early.duration_sec) || 200;
    
    ctx.clearRect(0, 0, c.width, c.height);

    const x0 = (start / dur) * c.width;
    const x1 = (end / dur) * c.width;

    // Highlight area box
    ctx.fillStyle = "rgba(99, 102, 241, 0.25)";
    ctx.fillRect(x0, 0, Math.max(10, x1 - x0), c.height);

    const barWidth = c.width / w.length;
    w.forEach((val, i) => {
      const x = i * barWidth;
      const h = Math.max(2, val * c.height * 0.9);
      ctx.fillStyle = (x >= x0 && x <= x1) ? "#818cf8" : "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(x, (c.height - h) / 2, Math.max(1, barWidth - 0.5), h);
    });
  }
}

// 15초 구간 오디오 재생 토글
function toggleHighlightPlayback() {
  const audio = $("hlAudioElement");
  const btn = $("btnPlayHighlight");
  const start = parseFloat($("hlSlider").value);

  if (!audio.src) {
    showToast("오디오 파일을 불러올 수 없습니다.", true);
    return;
  }

  if (!audio.paused) {
    audio.pause();
    clearInterval(hlAudioTimer);
    btn.innerHTML = `<span class="btn-icon">▶</span> 이 구간 미리듣기 (15초)`;
  } else {
    audio.currentTime = start;
    audio.play();
    btn.innerHTML = `<span class="btn-icon">⏸</span> 재생 일시정지`;

    clearInterval(hlAudioTimer);
    hlAudioTimer = setInterval(() => {
      if (audio.currentTime >= start + HIGHLIGHT_DURATION || audio.paused) {
        audio.pause();
        clearInterval(hlAudioTimer);
        btn.innerHTML = `<span class="btn-icon">▶</span> 이 구간 미리듣기 (15초)`;
      }
    }, 200);
  }
}

// A안 옵션 카탈로그 칩 핸들링 (한 줄 수정 조합)
function initCatalogChips() {
  document.querySelectorAll(".chip-btn").forEach(btn => {
    btn.onclick = () => {
      btn.classList.toggle("selected");
      const selectedChips = Array.from(document.querySelectorAll(".chip-btn.selected")).map(b => b.dataset.chip);
      if (selectedChips.length > 0) {
        $("correctionInput").value = `${selectedChips.join(", ")} 느낌으로 재해석해줘`;
      }
    };
  });
}

// 한 줄 수정 전송 (AI 1회 차감)
async function sendCorrection() {
  const text = $("correctionInput").value.trim();
  if (!text) {
    showToast("수정 요청 내용을 입력해 주세요.", true);
    return;
  }

  const btn = $("btnSendCorrection");
  btn.disabled = true;
  btn.textContent = "AI 재작성 중...";

  try {
    const updatedNote = await api("PATCH", `/jobs/${currentJobId}/note`, { correction: text });
    noteData = updatedNote;
    renderNote(updatedNote);
    $("correctionInput").value = "";
    document.querySelectorAll(".chip-btn.selected").forEach(b => b.classList.remove("selected"));
    showToast("A&R 노트가 새롭게 수정되었습니다.");
  } catch (err) {
    showToast(err.message || "수정에 실패했습니다.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">⚡</span> 해석 다시 쓰기 (AI)`;
  }
}

// 곡 다시 듣기
async function relisten() {
  if (!confirm("AI가 곡을 처음부터 다시 듣고 해석을 새로 씁니다. 계속하시겠습니까?")) return;
  const btn = $("btnRelisten");
  btn.disabled = true;

  try {
    await api("POST", `/jobs/${currentJobId}/note/relisten`);
    setStep(2);
    pollJob();
  } catch (err) {
    showToast(err.message || "다시 듣기 요청 실패", true);
    btn.disabled = false;
  }
}

// 직접 편집 저장 (무제한)
async function saveDirectEdits() {
  const keywords = $("editMoodKeywords").value.split(",").map(k => k.trim()).filter(Boolean);
  const colors = Array.from(document.querySelectorAll(".swatch-picker")).map(el => el.value);
  const coverDirs = Array.from(document.querySelectorAll(".cover-dir-input")).map(el => ({
    id: el.dataset.id,
    text: el.value.trim()
  }));
  const highlight_start = parseFloat($("hlSlider").value);

  try {
    const updated = await api("PATCH", `/jobs/${currentJobId}/note`, {
      mood_keywords: keywords,
      colors: colors,
      cover_directions: coverDirs,
      highlight_start: highlight_start
    });
    noteData = updated;
    renderNote(updated);
    showToast("직접 편집 내용이 저장되었습니다.");
  } catch (err) {
    showToast(err.message || "직접 편집 저장 실패", true);
  }
}

// 노트 수락 (모달 확인 후 승인)
function handleAcceptClick() {
  $("acceptConfirmModal").classList.remove("hidden");
}

async function confirmAcceptNote() {
  $("acceptConfirmModal").classList.add("hidden");
  try {
    await api("POST", `/jobs/${currentJobId}/note/accept`, { version: noteData ? noteData.version : null });
    setStep(4);
    pollJob();
  } catch (err) {
    showToast(err.message || "수락 처리 실패", true);
  }
}

// ============================================================
// STEP 4: 발매 에셋 스튜디오 (Showcase & Download)
// ============================================================

async function loadPackage(stage) {
  if (!currentJobId) return;
  try {
    packageData = await api("GET", `/jobs/${currentJobId}/package`);
    renderPackage(packageData, stage);
  } catch (err) {
    showToast(err.message || "패키지 정보를 불러오지 못했습니다.", true);
  }
}

function renderPackage(pkg, stage) {
  $("step4StageBadge").textContent = stage === "rendering" ? "렌더링 중..." : (stage === "awaiting_cover" ? "커버 선택 대기" : "완성됨");

  // 4-1. Covers
  renderCovers(pkg.covers || [], stage);

  // 4-2. Videos
  renderVideos(pkg.videos || []);

  // 4-3. Channels (Instagram, TikTok, Threads, X)
  renderChannels(pkg.channels || {});

  // 4-4. Pitch Mails (KO, EN)
  renderPitch(pkg.pitch || {});

  // 4-5. ZIP Download Banner
  const zipBtn = $("btnDownloadZip");
  if (pkg.zip_url) {
    zipBtn.href = API_BASE + pkg.zip_url;
    zipBtn.classList.remove("disabled");
    const sizeMb = pkg.zip_size_bytes ? (pkg.zip_size_bytes / (1024 * 1024)).toFixed(1) : "25";
    $("zipDetailsText").textContent = `${(pkg.zip_files || []).length}개 파일 포함 (약 ${sizeMb} MB) — 유통사 규격 3000px 커버 및 영상 일체`;
  } else {
    zipBtn.classList.add("disabled");
    zipBtn.removeAttribute("href");
  }
}

function renderCovers(covers, stage) {
  const container = $("coversGrid");
  container.innerHTML = covers.map(c => {
    const latestVer = c.versions[c.versions.length - 1];
    const isSelected = c.selected;
    const isOwn = c.item_id === "cover-own";

    return `
      <div class="cover-card ${isSelected ? "selected" : ""}" data-item="${c.item_id}">
        <div class="cover-img-wrapper">
          <img src="${API_BASE + latestVer.url}" alt="${c.item_id}" class="cover-img">
          ${isSelected ? `<span class="badge badge-accent" style="position:absolute;top:10px;right:10px;background:#10b981;">선택됨 (v${c.selected_v || latestVer.v})</span>` : ""}
        </div>
        <div class="cover-body">
          <span class="cover-title">${isOwn ? "직접 등록한 사진" : `아트워크 시안 (${c.item_id})`}</span>
          <span class="cover-meta">버전 v${latestVer.v} ${latestVer.request ? `· "${esc(latestVer.request)}"` : ""}</span>
          
          <div class="cover-actions">
            <button type="button" class="btn ${isSelected ? "btn-secondary" : "btn-primary"} btn-sm btn-select-cover" 
              data-item="${c.item_id}" data-v="${latestVer.v}" ${stage === "rendering" ? "disabled" : ""}>
              ${isSelected ? "✓ 현재 선택된 커버" : "이 커버로 에셋 제작"}
            </button>

            ${!isOwn ? `
              <div class="row" style="display:flex;gap:6px;margin-top:6px;align-items:center;">
                <input type="text" class="cover-regen-req" placeholder="수정 요청 (예: 더 어둡게)" style="padding:6px 10px;font-size:12px;height:36px;box-sizing:border-box;">
                <button type="button" class="btn btn-secondary btn-sm btn-regen-cover" 
                  data-item="${c.item_id}" ${c.regenerate_remaining > 0 ? "" : "disabled"} style="white-space:nowrap;height:36px;">
                  다시 (${c.regenerate_remaining})
                </button>
              </div>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Bind Cover Select
  container.querySelectorAll(".btn-select-cover").forEach(btn => {
    btn.onclick = async () => {
      const itemId = btn.dataset.item;
      const v = parseInt(btn.dataset.v);
      btn.disabled = true;
      btn.textContent = "제작 요청 중...";
      try {
        await api("POST", `/jobs/${currentJobId}/cover/select`, { item_id: itemId, v });
        pollJob();
        showToast("선택된 커버를 바탕으로 영상 렌더링이 시작되었습니다.");
      } catch (err) {
        showToast(err.message || "커버 선택 실패", true);
        btn.disabled = false;
      }
    };
  });

  // Bind Cover Regenerate
  container.querySelectorAll(".btn-regen-cover").forEach(btn => {
    btn.onclick = async () => {
      const itemId = btn.dataset.item;
      const input = btn.parentElement.querySelector(".cover-regen-req");
      const requestText = input.value.trim();
      btn.disabled = true;
      btn.textContent = "생성 중...";
      try {
        await api("POST", `/jobs/${currentJobId}/items/${itemId}/regenerate`, { request: requestText || null });
        pollJob();
        showToast("커버가 다시 생성되는 중입니다.");
      } catch (err) {
        showToast(err.message || "커버 재생성 실패", true);
        btn.disabled = false;
      }
    };
  });
}

function renderVideos(videos) {
  const container = $("videosGrid");
  if (!videos || videos.length === 0) {
    container.innerHTML = `
      <div class="empty-video-placeholder">
        <span>커버를 선택하시면 15초 숏폼 비주얼라이저와 Spotify Canvas가 여기에 생성됩니다.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = videos.map(v => `
    <div class="video-card">
      <video src="${API_BASE + v.url}" class="video-player" controls ${v.kind === "canvas" ? "loop muted autoplay" : ""}></video>
      <div class="video-meta">
        <strong>${v.kind === "short" ? "숏폼 비주얼라이저 (15초)" : "Spotify Canvas (8초 루프)"}</strong>
        <span class="hint-text" style="display:block;font-size:12px;color:var(--text-dim);">
          ${v.kind === "short" ? "인스타그램 릴스·틱톡 최적화" : "스포티파이 모바일 재생 화면용"}
        </span>
      </div>
    </div>
  `).join("");
}

function renderChannels(channels) {
  window._channelsData = channels;
  renderChannelTab(activeChannelTab);
}

function renderChannelTab(channelKey) {
  activeChannelTab = channelKey;
  const container = $("channelTabContent");
  const channels = window._channelsData || {};
  const data = channels[channelKey];

  // Update tabs active state
  document.querySelectorAll("#channelTabsBar .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === channelKey);
  });

  if (!data) {
    container.innerHTML = `<div class="copy-box">작성된 홍보 카피가 없습니다.</div>`;
    return;
  }

  const fullText = `${data.text}\n\n${(data.hashtags || []).join(" ")}`.trim();
  const charCount = fullText.length;

  container.innerHTML = `
    <div class="copy-box">${esc(data.text)}${data.hashtags ? `\n\n<span style="color:#818cf8;">${data.hashtags.join(" ")}</span>` : ""}</div>
    <div class="copy-actions-bar">
      <span class="hint-text">글자 수: <strong>${charCount}자</strong> ${data.hook ? `· 훅: “${esc(data.hook)}”` : ""}</span>
      <div class="row" style="display:flex;gap:8px;">
        <button type="button" class="btn btn-secondary btn-sm" id="btnCopyChannelText">📋 카피 복사</button>
      </div>
    </div>
  `;

  $("btnCopyChannelText").onclick = () => {
    navigator.clipboard.writeText(fullText);
    showToast(`${channelKey.toUpperCase()} 홍보 카피가 복사되었습니다!`);
  };
}

function renderPitch(pitch) {
  window._pitchData = pitch;
  renderPitchTab(activePitchTab);
}

function renderPitchTab(langKey) {
  activePitchTab = langKey;
  const container = $("pitchTabContent");
  const pitch = window._pitchData || {};
  const data = pitch[langKey];

  document.querySelectorAll("#pitchTabsBar .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === langKey);
  });

  if (!data) {
    container.innerHTML = `<div class="copy-box">작성된 피칭 메일이 없습니다.</div>`;
    return;
  }

  // Format body with highlights on [brackets]
  const formattedBody = esc(data.body).replace(/(\[[^\]]+\])/g, "<mark>$1</mark>");
  const fullText = `제목: ${data.subject}\n\n${data.body}`;

  container.innerHTML = `
    <div style="margin-bottom:8px;font-size:13px;font-weight:700;color:#ffffff;">
      제목: ${esc(data.subject)}
    </div>
    <div class="copy-box">${formattedBody}</div>
    <div class="copy-actions-bar">
      <span class="hint-text"><mark>[대괄호]</mark> 표시를 확인하여 밴드 정보를 입력 후 전송하세요.</span>
      <button type="button" class="btn btn-secondary btn-sm" id="btnCopyPitchText">📋 메일 복사</button>
    </div>
  `;

  $("btnCopyPitchText").onclick = () => {
    navigator.clipboard.writeText(fullText);
    showToast("피칭 메일이 복사되었습니다!");
  };
}

// 직접 사진 업로드
async function uploadOwnPhoto() {
  const fileInput = $("ownPhotoInput");
  if (!fileInput.files.length) {
    showToast("사진 파일(JPG/PNG)을 선택해 주세요.", true);
    return;
  }

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);

  const btn = $("btnUploadOwnPhoto");
  btn.disabled = true;
  btn.textContent = "업로드 중...";

  try {
    await api("POST", `/jobs/${currentJobId}/own-image`, fd, true);
    pollJob();
    showToast("직접 보유한 사진이 커버 목록에 추가되었습니다.");
  } catch (err) {
    showToast(err.message || "사진 업로드 실패", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "내 사진으로 등록 (cover-own)";
  }
}

// ============================================================
// INITIALIZATION & EVENT BINDINGS
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  // 1. Dropzone Init
  initDropzone();

  // 2. Band Code restore
  try {
    const savedBand = localStorage.getItem("bandCode");
    if (savedBand) {
      $("bandCode").value = savedBand;
      verifyBandCode();
    }
  } catch (_) {}

  $("btnCheckBand").onclick = verifyBandCode;
  $("bandCode").onkeydown = (e) => { if (e.key === "Enter") verifyBandCode(); };

  // 3. Form Submit
  $("uploadForm").onsubmit = (e) => {
    e.preventDefault();
    startJob();
  };

  // 4. Existing Job / Samples
  $("btnOpenExistingJob").onclick = () => {
    const id = $("existingJobId").value.trim();
    if (id) openJob(id);
  };
  document.querySelectorAll(".btn-sample").forEach(btn => {
    btn.onclick = () => openJob(btn.dataset.job);
  });
  renderRecentJobs();

  // 5. Stepper Click
  document.querySelectorAll(".step-item").forEach(item => {
    item.onclick = () => {
      const step = parseInt(item.dataset.step);
      // Completed or current step only
      if (item.classList.contains("completed") || item.classList.contains("active")) {
        setStep(step);
      }
    };
  });

  // 6. Step 2 bindings
  $("btnSaveExtraInfo").onclick = saveExtraInfo;
  $("btnRetryStep").onclick = async () => {
    try {
      await api("POST", `/jobs/${currentJobId}/retry`);
      pollJob();
    } catch (err) {
      showToast(err.message || "재시도 실패", true);
    }
  };

  // 7. Step 3 bindings
  initCatalogChips();
  $("btnSendCorrection").onclick = sendCorrection;
  $("correctionInput").onkeydown = (e) => { if (e.key === "Enter") sendCorrection(); };
  $("btnRelisten").onclick = relisten;
  $("btnSaveDirectEdits").onclick = saveDirectEdits;
  $("btnPlayHighlight").onclick = toggleHighlightPlayback;
  $("btnAcceptNote").onclick = handleAcceptClick;

  // 8. Modals
  $("btnOpenTermsModal").onclick = () => $("termsModal").classList.remove("hidden");
  $("btnCloseTermsModal").onclick = () => $("termsModal").classList.add("hidden");
  $("btnUnderstandTerms").onclick = () => $("termsModal").classList.add("hidden");

  $("btnHelpModal").onclick = () => $("helpModal").classList.remove("hidden");
  $("btnCloseHelpModal").onclick = () => $("helpModal").classList.add("hidden");
  $("btnCloseHelpBtn").onclick = () => $("helpModal").classList.add("hidden");

  $("btnCloseAcceptModal").onclick = () => $("acceptConfirmModal").classList.add("hidden");
  $("btnCancelAccept").onclick = () => $("acceptConfirmModal").classList.add("hidden");
  $("btnConfirmAccept").onclick = confirmAcceptNote;

  // 9. Step 4 Channel & Pitch Tabs
  document.querySelectorAll("#channelTabsBar .tab-btn").forEach(btn => {
    btn.onclick = () => renderChannelTab(btn.dataset.tab);
  });
  document.querySelectorAll("#pitchTabsBar .tab-btn").forEach(btn => {
    btn.onclick = () => renderPitchTab(btn.dataset.tab);
  });
  $("btnUploadOwnPhoto").onclick = uploadOwnPhoto;

  // 10. Nav Logo Reset
  $("navLogo").onclick = () => setStep(1);
});
