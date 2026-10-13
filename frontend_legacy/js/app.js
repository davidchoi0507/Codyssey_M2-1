/**
 * ====================================================================
 * [팀장 총괄 구역] Main Application Controller (app.js)
 * ====================================================================
 * 역할: 파일 업로드 이벤트, 실시간 분석 로딩 시뮬레이션, Mock 데이터 바인딩,
 *       브라우저 푸시 알림 및 3단 대시보드 렌더링 제어를 총괄합니다.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const dropzone = document.getElementById("dropzone");
  const audioInput = document.getElementById("audio-input");
  const fileBadge = document.getElementById("file-badge");
  const btnSubmit = document.getElementById("btn-submit");
  const termsAgree = document.getElementById("terms-agree");

  const uploadSection = document.getElementById("upload-section");
  const loadingSection = document.getElementById("loading-section");
  const progressBar = document.getElementById("progress-bar");
  const loadingStepText = document.getElementById("loading-step-text");
  const loadingLog = document.getElementById("loading-log");
  const dashboardSection = document.getElementById("dashboard-section");

  // Audio & Visualizer Elements
  const mainAudio = document.getElementById("main-audio");
  const btnPlayPause = document.getElementById("btn-play-pause");
  const playerTrackName = document.getElementById("player-track-name");

  // Copy Tab Elements
  const tabMelon = document.getElementById("tab-melon");
  const tabInsta = document.getElementById("tab-insta");
  const copyTextArea = document.getElementById("copy-text-area");
  const btnCopyClipboard = document.getElementById("btn-copy-clipboard");
  const btnDownloadZip = document.getElementById("btn-download-zip");

  let currentProjectData = null;
  let activeTab = "melon"; // 'melon' or 'insta'
  let uploadedAudioBlobUrl = null;

  // 1. Drag & Drop Handling
  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleAudioFile(files[0]);
    }
  });

  audioInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleAudioFile(e.target.files[0]);
    }
  });

  function handleAudioFile(file) {
    if (!file.type.includes("audio") && !file.name.endsWith(".mp3") && !file.name.endsWith(".wav")) {
      alert("오디오 파일(.mp3, .wav)만 업로드 가능합니다.");
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    fileBadge.innerText = `🎵 ${file.name} (${sizeMb} MB)`;
    fileBadge.style.display = "inline-block";

    // Create local object URL for preview playback
    if (uploadedAudioBlobUrl) URL.revokeObjectURL(uploadedAudioBlobUrl);
    uploadedAudioBlobUrl = URL.createObjectURL(file);
    mainAudio.src = uploadedAudioBlobUrl;

    const trackTitleInput = document.getElementById("track-title");
    if (!trackTitleInput.value || trackTitleInput.value.includes("Midnight Echo")) {
      trackTitleInput.value = file.name.replace(/\.[^/.]+$/, "");
    }
  }

  // 2. Submit & 3.5s Simulation Workflow
  btnSubmit.addEventListener("click", () => {
    if (!termsAgree.checked) {
      alert("AI 생성물 표기 및 자작곡 확인 약관에 동의해 주세요.");
      return;
    }

    // Request Web Notification Permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Start Simulation UI
    uploadSection.style.display = "none";
    loadingSection.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });

    simulateAnalysisPipeline();
  });

  function simulateAnalysisPipeline() {
    const steps = [
      { progress: 25, text: "오디오 파형 디코딩 & 물리량 분석 중...", log: "FastAPI DSP: librosa.load(sr=22050, duration=60) -> BPM 118" },
      { progress: 50, text: "Gemini 2.5 Flash가 음악의 감정선과 보컬을 청취 분석 중...", log: "Gemini 2.5 Flash Audio API: '자정의 고독감과 낭만적 무드' 식별" },
      { progress: 75, text: "Multi-Agent A&R 기획서 수립 및 DALL-E 3 병렬 렌더링 중...", log: "LangGraph ReAct Agent: Style A, B, C 프롬프트 도출 및 비동기 호출" },
      { progress: 100, text: "올인원 브랜딩 패키지 생성 완료! 이메일 발송 준비...", log: "Resend Email Service & Asset Bundle Packaging Done" }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        const item = steps[currentStep];
        progressBar.style.width = `${item.progress}%`;
        loadingStepText.innerText = item.text;
        loadingLog.innerText = item.log;
        currentStep++;
      } else {
        clearInterval(interval);
        setTimeout(finishSimulationAndRender, 600);
      }
    }, 850);
  }

  // 기본 내장 Mock 데이터 (로컬 file:// 실행 시 브라우저 CORS 차단 대비)
  const DEFAULT_MOCK_DATA = {
    "status": "SUCCESS",
    "task_id": "mock-task-77291a",
    "created_at": "2026-09-28T00:00:00Z",
    "audio_features": {
      "file_name": "midnight_echo.mp3",
      "duration_seconds": 184.5,
      "bpm": 118,
      "tempo_feel": "Moderate Dreamy Groove",
      "spectral_centroid_hz": 4250,
      "spectral_brightness": "Warm & Mellow (몽환적이고 따뜻한 질감)",
      "rms_energy": 0.68,
      "dynamic_range": "Medium-High (서서히 고조되는 앰비언트 구조)",
      "detected_genres": ["Indie Pop", "Dream Pop", "Lo-Fi R&B"]
    },
    "concept_report": {
      "project_title": "Midnight Echo (자정의 잔향)",
      "logline": "새벽 두 시, 텅 빈 도시의 빗물에 번지는 네온사인과 지나간 기억의 잔향",
      "core_narrative": "이 곡은 새벽 시간대 느껴지는 고독과 그리움을 도시적 질감으로 풀어낸 사운드스케이프를 가집니다. 차가운 아스팔트와 따뜻한 가로등 불빛이 교차하듯 서정적인 멜로디 라인을 시각적으로 형상화합니다.",
      "color_palette": [
        { "name": "Midnight Abyss", "hex": "#0D1117", "role": "배경 딥 섀도우" },
        { "name": "Neon Cyan", "hex": "#00F5D4", "role": "서브 멜로디 액센트" },
        { "name": "Cyber Violet", "hex": "#7B2CBF", "role": "신스 리버브 무드" },
        { "name": "Electric Rose", "hex": "#FF007F", "role": "드럼 비트 다이내믹" },
        { "name": "Mist Gray", "hex": "#E0E1DD", "role": "보컬 텍스처 하이라이트" }
      ],
      "art_movement_keywords": [
        "Cyberpunk Melancholy",
        "Cinematic Film Grain",
        "Surreal Tape Hiss",
        "Minimal Neo-Typography"
      ]
    },
    "artworks": [
      {
        "id": "cover-a",
        "style_name": "Style A: 미니멀 & 네오 타이포그래피",
        "description": "감각적인 여백과 세련된 그래픽 레이아웃으로 도시의 공허함을 형상화한 디자인",
        "image_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop"
      },
      {
        "id": "cover-b",
        "style_name": "Style B: 초현실 사이키델릭 몽환",
        "description": "주파수 파형의 왜곡과 몽환적인 액체 네온 텍스처를 결합한 사이키델릭 무드",
        "image_url": "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop"
      },
      {
        "id": "cover-c",
        "style_name": "Style C: 시네마틱 35mm 필름 그레인",
        "description": "비에 젖은 밤거리와 네온사인의 아날로그 감성을 35mm 필름 룩으로 표현",
        "image_url": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop"
      }
    ],
    "marketing_copy": {
      "melon_intro": "[트랙 소개글 - 멜론 / 지니 / 벅스]\n\n\"어둠이 완전히 내려앉은 뒤에야 비로소 선명해지는 목소리들이 있다.\"\n\n새로운 싱글 [Midnight Echo]는 도시의 소음이 잦아든 새벽 두 시, 마음 깊은 곳에서 울려 퍼지는 기억의 잔향을 노래한다. 따뜻한 아날로그 신디사이저와 묵직한 베이스 라인 위에 얹어진 몽환적인 보컬은 지친 하루의 끝에서 홀로 서 있는 모든 이들에게 깊은 위로를 건넨다.\n\nComposed by Indie Artist\nLyrics by Indie Artist\nArranged by Indie Artist, Studio AI\nArtwork Designed with Indie Album Studio",
      "insta_caption": "🌧️ 2026. 10. NEW SINGLE [Midnight Echo] RELEASE.\n\n어두운 밤, 빗물에 비친 불빛처럼 흩어지는 기억들을 담았습니다.\n지금 모든 음원 스트리밍 사이트에서 감상하실 수 있습니다.\n\n🎧 Link in bio\n\n#인디음악 #신곡 #MidnightEcho #드림팝 #인디팝 #새벽감성 #플레이리스트추천 #IndieMusic #NowPlaying"
    }
  };

  // 3. Render Dashboard with Mock Data
  async function finishSimulationAndRender() {
    try {
      const response = await fetch("mock/dummy_data.json");
      if (response.ok) {
        currentProjectData = await response.json();
      } else {
        currentProjectData = DEFAULT_MOCK_DATA;
      }
    } catch (err) {
      console.log("Local file fetch bypassed -> Using built-in Mock data", err);
      currentProjectData = DEFAULT_MOCK_DATA;
    }

    // Trigger Browser Notification
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Indie Album Studio", {
          body: `🎉 [${currentProjectData.concept_report.project_title}] 앨범 브랜딩 패키지 생성이 완료되었습니다!`,
          icon: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100"
        });
      } catch (e) {
        console.log("Notification error", e);
      }
    }

    loadingSection.style.display = "none";
    dashboardSection.style.display = "grid";
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Pass data to ExportManager
    window.exportManager.setData(currentProjectData);

    // Bind Data to UI
    populateDashboard(currentProjectData);
  }


  function populateDashboard(data) {
    const { audio_features, concept_report, artworks, marketing_copy } = data;

    // Col 1: DSP & A&R
    document.getElementById("dsp-bpm").innerText = `${audio_features.bpm} BPM`;
    document.getElementById("dsp-brightness").innerText = `${audio_features.spectral_centroid_hz} Hz (${audio_features.spectral_brightness})`;
    document.getElementById("dsp-energy").innerText = `${audio_features.rms_energy} RMS (${audio_features.dynamic_range})`;

    document.getElementById("concept-title").innerText = concept_report.project_title;
    document.getElementById("concept-narrative").innerText = concept_report.core_narrative;

    // Palette Swatches
    const paletteContainer = document.getElementById("palette-container");
    paletteContainer.innerHTML = "";
    concept_report.color_palette.forEach(color => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.backgroundColor = color.hex;
      swatch.title = `${color.name} (${color.hex})\n${color.role}`;
      paletteContainer.appendChild(swatch);
    });

    // Keywords Chips
    const kwContainer = document.getElementById("keywords-container");
    kwContainer.innerHTML = "";
    concept_report.art_movement_keywords.forEach(kw => {
      const chip = document.createElement("span");
      chip.className = "kw-chip";
      chip.innerText = `#${kw}`;
      kwContainer.appendChild(chip);
    });

    // Col 2: Artworks Gallery
    const coversContainer = document.getElementById("covers-container");
    coversContainer.innerHTML = "";

    artworks.forEach((art, index) => {
      const card = document.createElement("div");
      card.className = `cover-card ${index === 0 ? "selected" : ""}`;
      card.innerHTML = `
        <div class="cover-img-wrap">
          <img src="${art.image_url}" alt="${art.style_name}">
          <span class="selected-badge">선택됨</span>
        </div>
        <div class="cover-info">
          <div class="cover-style-title">${art.style_name}</div>
          <div class="cover-desc">${art.description}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".cover-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        // Update Visualizer background
        window.audioVisualizer.setBackgroundImage(art.image_url);
      });

      coversContainer.appendChild(card);
    });

    // Set initial visualizer background
    if (artworks.length > 0) {
      window.audioVisualizer.setBackgroundImage(artworks[0].image_url);
    }

    // Col 3: Audio Player info
    playerTrackName.innerText = concept_report.project_title;

    // Col 3: Marketing Copy
    updateCopyText(marketing_copy);
  }

  function updateCopyText(copy) {
    if (!copy) return;
    copyTextArea.value = activeTab === "melon" ? copy.melon_intro : copy.insta_caption;
  }

  // 4. Copy Tabs Switch
  tabMelon.addEventListener("click", () => {
    activeTab = "melon";
    tabMelon.classList.add("active");
    tabInsta.classList.remove("active");
    if (currentProjectData) updateCopyText(currentProjectData.marketing_copy);
  });

  tabInsta.addEventListener("click", () => {
    activeTab = "insta";
    tabInsta.classList.add("active");
    tabMelon.classList.remove("active");
    if (currentProjectData) updateCopyText(currentProjectData.marketing_copy);
  });

  // 5. Copy Clipboard
  btnCopyClipboard.addEventListener("click", () => {
    window.exportManager.copyToClipboard(copyTextArea.value, btnCopyClipboard);
  });

  // 6. Download Bundle
  btnDownloadZip.addEventListener("click", () => {
    window.exportManager.downloadReleaseBundle();
  });

  // 7. Audio Play / Pause
  let isPlaying = false;
  let virtualTimerInterval = null;
  let virtualSeconds = 0;
  const playerTrackTime = document.getElementById("player-track-time");

  btnPlayPause.addEventListener("click", () => {
    if (!isPlaying) {
      isPlaying = true;
      btnPlayPause.innerText = "⏸";

      if (mainAudio.src && mainAudio.src.length > 5) {
        // 실제 음원 파일이 업로드된 경우
        mainAudio.play().then(() => {
          window.audioVisualizer.startAnimation(false);
        }).catch(err => {
          console.warn("실제 재생 실패 -> 가상 데모 톤 모드 전환", err);
          window.audioVisualizer.startAnimation(true);
        });
      } else {
        // 음원 미업로드 시: 가상 앰비언트 비트 & 파형 애니메이션 즉시 구동
        window.audioVisualizer.startAnimation(true);
      }

      // 재생 타이머 작동
      virtualTimerInterval = setInterval(() => {
        virtualSeconds++;
        const mins = String(Math.floor(virtualSeconds / 60)).padStart(2, '0');
        const secs = String(virtualSeconds % 60).padStart(2, '0');
        playerTrackTime.innerText = `${mins}:${secs} / 03:04`;
      }, 1000);

    } else {
      isPlaying = false;
      btnPlayPause.innerText = "▶";
      if (mainAudio.src) mainAudio.pause();
      window.audioVisualizer.stopAnimation();

      if (virtualTimerInterval) {
        clearInterval(virtualTimerInterval);
        virtualTimerInterval = null;
      }
    }
  });

  mainAudio.addEventListener("ended", () => {
    isPlaying = false;
    btnPlayPause.innerText = "▶";
    window.audioVisualizer.stopAnimation();
    if (virtualTimerInterval) {
      clearInterval(virtualTimerInterval);
      virtualTimerInterval = null;
    }
  });
});
