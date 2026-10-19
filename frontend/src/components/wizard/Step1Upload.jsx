import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Volume2,
  Play,
  Pause,
  Edit3,
  RotateCcw,
  Plus,
  X,
  Disc3,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Info,
} from 'lucide-react';
import {
  api,
  CONSENT_VERSION,
  SERVICE_END_DATE,
  toFileUrl,
  localJobsStorage,
  stepForStage,
} from '../../services/api';

// 긴 파형 배열(수백~수천 개 포인트)을 UI에 최적화된 20개 막대로 다운샘플링
const downsampleWaveform = (rawArray, targetBars = 20) => {
  if (!rawArray || !Array.isArray(rawArray) || rawArray.length === 0) return [];
  if (rawArray.length === targetBars) {
    const maxVal = Math.max(...rawArray) || 1;
    return rawArray.map((v) => Math.max(0.18, Math.min(1.0, Math.round((v / maxVal) * 100) / 100)));
  }

  const blockSize = rawArray.length / targetBars;
  const result = [];
  for (let i = 0; i < targetBars; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.floor((i + 1) * blockSize);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < rawArray.length; j++) {
      const num = Number(rawArray[j]);
      if (!isNaN(num)) {
        sum += Math.abs(num);
        count++;
      }
    }
    const avg = count > 0 ? sum / count : 0;
    result.push(avg);
  }

  const maxVal = Math.max(...result) || 1;
  return result.map((v) => Math.max(0.18, Math.min(1.0, Math.round((v / maxVal) * 100) / 100)));
};

// Web Audio API를 활용한 오디오 실제 볼륨 피크(20개 막대) 추출
const extractWaveformFromBlob = async (blob) => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !blob) return null;
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 20; // 20개 막대
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
      let blockStart = blockSize * i;
      let sum = 0;
      const step = Math.max(1, Math.floor(blockSize / 50));
      let count = 0;
      for (let j = 0; j < blockSize; j += step) {
        sum += Math.abs(rawData[blockStart + j] || 0);
        count++;
      }
      filteredData.push(count > 0 ? sum / count : 0);
    }
    try {
      await ctx.close();
    } catch {}
    const maxVal = Math.max(...filteredData) || 1;
    return filteredData.map((v) => Math.max(0.18, Math.min(1.0, Math.round((v / maxVal) * 100) / 100)));
  } catch (err) {
    console.warn('Waveform audio extraction fallback:', err);
    return null;
  }
};

// 추천 하이라이트 구간과 곡 길이에 기반한 자연스러운 20개 파형 막대 생성
const generateWaveformFromCandidates = (candidates, duration = 180) => {
  const samples = 20;
  const bars = [];
  const candList = candidates || [];
  const dur = Math.max(30, duration || 180);

  for (let i = 0; i < samples; i++) {
    const barSec = (i / samples) * dur;
    const rel = i / (samples - 1);
    // 곡의 전형적인 아치형 볼륨/에너지 곡선
    let base = 0.28 + Math.sin(rel * Math.PI) * 0.35;

    // 추천 하이라이트 구간에 위치한 막대에 에너지를 자연스럽게 부스트
    let boost = 0;
    candList.forEach((cand, idx) => {
      const mid = (cand.start + cand.end) / 2;
      const dist = Math.abs(barSec - mid);
      if (dist <= 18) {
        const factor = 1 - dist / 18;
        boost = Math.max(boost, (idx === 0 ? 0.45 : 0.35) * factor);
      }
    });

    const variation = Math.sin(i * 1.8) * 0.08 + Math.cos(i * 0.9) * 0.06;
    const finalVal = Math.min(1.0, Math.max(0.18, Math.round((base + boost + variation) * 100) / 100));
    bars.push(finalVal);
  }
  return bars;
};

const ACTIVE = ['uploaded', 'analyzing'];
const NOTE_STAGES = ['note_ready', 'generating', 'awaiting_cover', 'rendering', 'done'];
const ACCEPTED_STAGES = ['generating', 'awaiting_cover', 'rendering', 'done'];

// D2: 분석 대기 중 6초마다 넘어가는 발매 팁 8종 (유통사 조사 자료 기반)
const RELEASE_TIPS = [
  {
    title: '유통사에는 mp3 말고 WAV로 내요',
    desc: '44.1kHz·16bit 이상(권장 24bit·48kHz) 마스터링한 무손실 WAV가 기본이에요. 지금 mp3로 테스트하셨다면 실제 제출 전엔 원본 WAV를 준비해 두세요.',
  },
  {
    title: '커버 이미지는 3000×3000px 정사각형이 표준이에요',
    desc: '모든 음원 사이트가 최소 3000×3000px RGB(sRGB) JPG/PNG를 요구해요. 발매로가 만드는 커버는 자동으로 3000px 규격에 맞춰집니다.',
  },
  {
    title: '커버에는 URL·가격·음원 사이트 로고를 넣으면 안 돼요',
    desc: '커버에 웹사이트 주소, QR코드, SNS 아이디(@), "New", 가격, Spotify 로고 등이 들어가면 유통사 심사에서 반려됩니다.',
  },
  {
    title: 'DistroKid는 ISRC(국제표준녹음코드)를 무료로 발급해 줘요',
    desc: '처음 발매라 ISRC가 없어도 걱정하지 마세요. DistroKid는 자동 발급해 주고, 국내 유통사도 유통 과정에서 부여해 줍니다.',
  },
  {
    title: '발매일은 최소 2~4주 뒤로 여유 있게 잡으세요',
    desc: '뮤즈플랫폼은 등록 15일 뒤 발매(3주 전 권장), DistroKid는 최대 2주(Spotify 피칭 포함 시 4주 전 권장) 여유가 필요해요.',
  },
  {
    title: 'Spotify 에디토리얼 피칭은 발매 7일 전이 마감이에요',
    desc: 'Spotify 공식 플레이리스트 심사를 받으려면 최소 발매 7일 전(권장 4주 전)까지 Spotify for Artists에서 피칭을 마쳐야 해요.',
  },
  {
    title: '트랙 제목과 커버에 적힌 제목은 글자 하나까지 같아야 해요',
    desc: '커버에 적힌 곡명·아티스트명과 메타데이터 입력값이 다르면 가장 흔하게 반려됩니다. 피처링 표기 방식도 통일해야 해요.',
  },
  {
    title: '샘플팩·루프를 썼다면 상업적 발매 라이선스를 확인하세요',
    desc: 'Splice 등 로열티 프리 샘플도 단독 루프 그대로 쓰거나 원곡 일부를 무단 샘플링하면 저작권 분쟁으로 곡이 내려갈 수 있어요.',
  },
];

const AI_QUICK_CHIPS = [
  '더 밝게',
  '더 어둡게',
  '덜 슬프게',
  '장르가 달라요',
  '후렴 에너지를 강조해 줘',
];

function fmtTime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function Step1Upload({
  jobData,
  setJobData,
  onNextStep,
  user,
  showJobPicker,
  setShowJobPicker,
  onSelectExistingJob,
  onStartNewJob,
  onGoToMe,
  onGoToCommunity,
}) {
  const isDemo = Boolean(jobData?.jobId && String(jobData.jobId).startsWith('demo'));

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState(jobData?.title || '');
  const [artist, setArtist] = useState(jobData?.artist || '');
  const [featured, setFeatured] = useState(jobData?.featured || '');
  const [songwriter, setSongwriter] = useState(jobData?.songwriter || '');
  const [producer, setProducer] = useState(jobData?.producer || '');
  const [lyrics, setLyrics] = useState(jobData?.lyrics || '');
  const [genre, setGenre] = useState(jobData?.genre || '');

  // UI 점진적 공개(Progressive Disclosure) 상태
  const [showOptionalMeta, setShowOptionalMeta] = useState(
    Boolean(jobData?.featured || jobData?.songwriter || jobData?.producer || jobData?.genre || jobData?.lyrics)
  );
  const [showFullUploadForm, setShowFullUploadForm] = useState(false);

  // 동의 (동의서 v1.6 — 필수 3개는 미리 체크하지 않는다)
  const [consents, setConsents] = useState({ privacy: false, external_ai: false, original: false, showcase: false });
  const setConsent = (k, v) => setConsents((prev) => ({ ...prev, [k]: v }));
  const consentAgree = consents.privacy && consents.external_ai && consents.original;

  // Status & Polling
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [jobStatus, setJobStatus] = useState(null);
  const [rawNote, setRawNote] = useState(null);
  const [noteVersions, setNoteVersions] = useState({}); // { [version]: ARNote }
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  // D1: 최근 작업 목록 (서버 내 작업 + 브라우저 기억 작업)
  const [recentJobs, setRecentJobs] = useState([]);
  const [retryingJobId, setRetryingJobId] = useState(null);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteNotice, setDeleteNotice] = useState(null);

  // D2: 발매 팁 인덱스 & 409 모달 상태
  const [tipIdx, setTipIdx] = useState(0);
  const [knownSongModal, setKnownSongModal] = useState(null); // 409 KNOWN_SONG_MATCH 메시지
  const [duplicateModal, setDuplicateModal] = useState(null); // 409 DUPLICATE_TRACK / ALREADY_PUBLISHED 메시지
  const [validationModal, setValidationModal] = useState(null); // PDF p.1 #4: 필수정보 미입력 팝업 모달
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false); // PDF p.2 #5: 개인정보처리방침 모달
  const [progressModalDismissed, setProgressModalDismissed] = useState(false);

  // D3: AI 수정 & 직접 고치기 & 하이라이트 미리듣기 상태
  const [showAiEdit, setShowAiEdit] = useState(false);
  const [aiCorrection, setAiCorrection] = useState('');
  const [aiEditing, setAiEditing] = useState(false);

  const [directEditMode, setDirectEditMode] = useState(false);
  const [editMoods, setEditMoods] = useState([]);
  const [newMoodInput, setNewMoodInput] = useState('');
  const [editColors, setEditColors] = useState(['#4F46E5', '#0EA5E9', '#F59E0B']);
  const [editDirections, setEditDirections] = useState([]);
  const [editHighlightStart, setEditHighlightStart] = useState(0);
  const [savingDirect, setSavingDirect] = useState(false);
  const [relistening, setRelistening] = useState(false);
  const [extractedWaveform, setExtractedWaveform] = useState(null);

  // D3: 수락 후 1단계로 돌아왔을 때 기본 정보 수정 모드
  const [editingBasicInfo, setEditingBasicInfo] = useState(false);
  const [savingBasicInfo, setSavingBasicInfo] = useState(false);
  const [basicInfoSavedMsg, setBasicInfoSavedMsg] = useState(null);

  // 하이라이트 미리듣기 오디오
  const [playingPreview, setPlayingPreview] = useState(false);
  const previewAudioRef = useRef(null);
  const previewTimerRef = useRef(null);

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);
  const noteCardRef = useRef(null);
  const scrolledForJobRef = useRef(null);

  // Sync local inputs when jobData changes
  useEffect(() => {
    setTitle(jobData?.title || '');
    setArtist(jobData?.artist || '');
    setFeatured(jobData?.featured || '');
    setSongwriter(jobData?.songwriter || '');
    setProducer(jobData?.producer || '');
    setLyrics(jobData?.lyrics || '');
    setGenre(jobData?.genre || '');
    if (!jobData?.jobId) {
      setRawNote(null);
      setNoteVersions({});
      setSelectedVersion(null);
      setJobStatus(null);
      setAnalyzing(false);
      setExtractedWaveform(null);
    }
  }, [jobData?.jobId]);

  // Load recent jobs (D1)
  const loadRecentJobs = async () => {
    const localList = localJobsStorage.list();
    let serverList = [];
    try {
      if (user) {
        serverList = await api.getMyJobs();
      }
    } catch {
      serverList = [];
    }
    const mergedMap = new Map();
    for (const j of [...serverList, ...localList]) {
      if (j?.job_id && !mergedMap.has(j.job_id)) {
        mergedMap.set(j.job_id, j);
      }
    }
    setRecentJobs(Array.from(mergedMap.values()).slice(0, 8));
  };

  const handleDeleteJob = async (jobId) => {
    setDeletingJobId(jobId);
    setDeleteNotice(null);
    try {
      const res = await api.deleteJob(jobId);
      localJobsStorage.remove(jobId);
      if (jobId === jobData?.jobId) {
        if (onStartNewJob) onStartNewJob();
      }
      await loadRecentJobs();
      if (res?.track_kept) {
        setDeleteNotice('작업 기록이 삭제되었습니다. (커뮤니티에 공개된 곡은 관리 링크에서 내릴 수 있어요)');
      } else {
        setDeleteNotice('작업 기록이 삭제되었습니다.');
      }
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err) {
      if (err.status === 409 || err.code === 'JOB_BUSY') {
        alert('작업이 진행 중이어서 지금은 삭제할 수 없어요. 잠시 후 다시 시도해 주세요.');
      } else if (err.status === 403 || err.code === 'NOT_OWNER') {
        alert('이 작업을 삭제할 권한이 없어요.');
      } else {
        alert(err.message || '작업을 삭제하지 못했어요.');
      }
    } finally {
      setDeletingJobId(null);
      setConfirmDeleteId(null);
    }
  };

  useEffect(() => {
    loadRecentJobs();
  }, [user?.user_id, jobData?.jobId, showJobPicker]);

  // Rotate tips every 6 seconds while uploading/analyzing
  useEffect(() => {
    if (!uploading && !analyzing) return;
    const t = setInterval(() => {
      setTipIdx((prev) => (prev + 1) % RELEASE_TIPS.length);
    }, 6000);
    return () => clearInterval(t);
  }, [uploading, analyzing]);

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(previewTimerRef.current);
      previewAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (jobData?.jobId && !String(jobData.jobId).startsWith('demo')) {
      pollJobStatus(jobData.jobId);
    }
    return () => clearInterval(pollRef.current);
  }, [jobData?.jobId]);

  const syncDirectEditState = (note) => {
    if (!note) return;
    setEditMoods(note.mood_keywords || []);
    setEditColors(note.colors?.length === 3 ? [...note.colors] : ['#4F46E5', '#0EA5E9', '#F59E0B']);
    setEditDirections((note.cover_directions || []).map((d) => ({ id: d.id, text: d.text })));
    setEditHighlightStart(note.highlight?.selected?.start || 0);
  };

  const applyNote = (note, shouldAutoScroll = false) => {
    setRawNote(note);
    setNoteVersions((prev) => ({ ...prev, [note.version]: note }));
    setSelectedVersion(note.version);
    syncDirectEditState(note);
    if (shouldAutoScroll && scrolledForJobRef.current !== note.job_id) {
      scrolledForJobRef.current = note.job_id;
      setTimeout(() => {
        noteCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  };

  const validateAndSetFile = (selected) => {
    if (!selected) return;
    setError(null);
    const nameLower = (selected.name || '').toLowerCase();
    const isAudioType = selected.type?.includes('audio') || nameLower.endsWith('.wav') || nameLower.endsWith('.mp3');
    if (!isAudioType) {
      setError('지원하지 않는 형식이에요. (mp3 또는 wav 파일만 업로드할 수 있어요)');
      setFile(null);
      return;
    }

    // 오디오 길이(30초 미만 사전 검증) 및 손상 여부 검사
    try {
      const url = URL.createObjectURL(selected);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (audio.duration && audio.duration < 30) {
          setError(`30초 미만은 분석이 어려워요 (현재 길이: 약 ${Math.round(audio.duration)}초). 30초 이상의 음원을 올려주세요.`);
          setFile(null);
          return;
        }
        setFile(selected);
        extractWaveformFromBlob(selected).then((wf) => {
          if (wf && wf.length > 0) setExtractedWaveform(wf);
        });
        // 미영님 피드백: 파일명으로 제목을 자동 덮어쓰지 않고 사용자가 직접 입력하도록 유지
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setError('파일이 손상된 것 같아요. 디코딩할 수 없으니 다시 확인 후 올려주세요.');
        setFile(null);
      };
      audio.src = url;
    } catch {
      setFile(selected);
      extractWaveformFromBlob(selected).then((wf) => {
        if (wf && wf.length > 0) setExtractedWaveform(wf);
      });
    }
  };

  // 기존 작업 로드 시 audio_url이 있으면 실제 파형 데이터 백그라운드 추출
  useEffect(() => {
    if (jobStatus?.audio_url && !extractedWaveform) {
      fetch(toFileUrl(jobStatus.audio_url))
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob) return extractWaveformFromBlob(blob);
        })
        .then((wf) => {
          if (wf && wf.length > 0) setExtractedWaveform(wf);
        })
        .catch(() => {});
    }
  }, [jobStatus?.audio_url]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  // 분석은 1~3분 걸린다. 2.5초마다 상태를 보고 note_ready 가 되면 노트를 가져온다
  const pollJobStatus = (jobId) => {
    clearInterval(pollRef.current);
    setProgressModalDismissed(false);
    const tick = async () => {
      try {
        const res = await api.getJobStatus(jobId);
        setJobStatus(res);
        localJobsStorage.upsert({
          job_id: jobId,
          title: title || jobData?.title || '작업 중인 곡',
          artist: artist || jobData?.artist || '',
          stage: res.stage,
          stage_label: res.stage_label,
        });

        if (
          NOTE_STAGES.includes(res.stage) ||
          (res.stage === 'failed' && res.steps?.some((x) => x.key === 'note' && x.status === 'done'))
        ) {
          clearInterval(pollRef.current);
          const note = await api.getNote(jobId);
          applyNote(note, true);
          // 곡 기본 정보도 release-info 에서 동기화
          api
            .getReleaseInfo(jobId)
            .then((r) => {
              if (r?.info) {
                setTitle(r.info.title || title);
                setArtist(r.info.artist || artist);
                setGenre(r.info.genre_primary || genre);
                setLyrics(r.info.lyrics || lyrics);
                setJobData((prev) => ({
                  ...prev,
                  title: r.info.title || prev.title,
                  artist: r.info.artist || prev.artist,
                  stage: res.stage,
                }));
                localJobsStorage.upsert({
                  job_id: jobId,
                  title: r.info.title || title,
                  artist: r.info.artist || artist,
                  stage: res.stage,
                  stage_label: res.stage_label,
                });
              }
            })
            .catch(() => {});
          setJobData((prev) => ({ ...prev, stage: res.stage }));
          setAnalyzing(false);
          setRelistening(false);
        } else if (res.stage === 'failed') {
          clearInterval(pollRef.current);
          setAnalyzing(false);
          setRelistening(false);
          setError(res.error?.message || '음원 분석에 실패했습니다.');
        } else if (ACTIVE.includes(res.stage)) {
          setAnalyzing(true);
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setAnalyzing(false);
        setRelistening(false);
        setError(err.message);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
  };

  const handleStartAnalysis = async (confirmOriginal = false) => {
    if (!file) {
      setValidationModal({
        title: '음원 파일이 필요해요',
        message: '발매 패키징을 진행할 음원 파일(.wav 또는 .mp3)을 먼저 선택하거나 드래그하여 올려주세요.',
      });
      return;
    }
    if (!title.trim() || !artist.trim()) {
      setValidationModal({
        title: '필수 곡 정보를 입력해 주세요',
        message: '곡 제목(Track Title)과 아티스트명(Artist Name)은 A&R 분석 및 유통사 서류의 필수 항목입니다.',
      });
      return;
    }
    if (!consentAgree) {
      setValidationModal({
        title: '필수 약관 동의가 필요해요',
        message: '음원 분석과 발매 패키지 생성을 위해 필수 동의 3가지 항목에 체크해 주세요.',
      });
      return;
    }

    setError(null);
    setKnownSongModal(null);
    setDuplicateModal(null);
    setUploading(true);
    setProgressModalDismissed(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('artist', artist.trim());
      formData.append('genre', genre.trim());
      if (lyrics.trim()) formData.append('lyrics', lyrics.trim());
      formData.append('consent_privacy', consents.privacy);
      formData.append('consent_external_ai', consents.external_ai);
      formData.append('consent_original', consents.original);
      formData.append('consent_showcase', consents.showcase);
      formData.append('consent_version', CONSENT_VERSION);
      if (confirmOriginal) {
        formData.append('confirm_original', 'true');
      }

      const res = await api.createJob(formData);
      const jobId = res.job_id;

      localJobsStorage.upsert({
        job_id: jobId,
        title: title.trim(),
        artist: artist.trim(),
        stage: 'analyzing',
        stage_label: '분석 중',
      });

      setJobData((prev) => ({
        ...prev,
        jobId,
        title: title.trim(),
        artist: artist.trim(),
        featured,
        songwriter,
        producer,
        lyrics,
        genre: genre.trim(),
        stage: 'analyzing',
      }));

      setUploading(false);
      setAnalyzing(true);
      loadRecentJobs();
    } catch (err) {
      setUploading(false);
      if (err.code === 'KNOWN_SONG_MATCH') {
        setKnownSongModal(err.message);
      } else if (err.code === 'DUPLICATE_TRACK' || err.code === 'ALREADY_PUBLISHED') {
        setDuplicateModal({ code: err.code, message: err.message });
      } else {
        setError(err.message || '업로드 중 오류가 발생했습니다.');
      }
    }
  };

  // 실패 시 다시 시도 (D2 / D10)
  const handleRetryCurrentJob = async (targetJobId = jobData?.jobId) => {
    if (!targetJobId) return;
    setRetryingJobId(targetJobId);
    setError(null);
    try {
      await api.retryJob(targetJobId);
      if (targetJobId === jobData?.jobId) {
        setAnalyzing(true);
        pollJobStatus(targetJobId);
      } else if (onSelectExistingJob) {
        onSelectExistingJob({ job_id: targetJobId }, 1);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRetryingJobId(null);
    }
  };

  // 데모 샘플 채우기
  const handleLoadSample = () => {
    const demoNote = {
      job_id: 'demo-sample-1',
      version: 1,
      interpretation:
        '128BPM의 밝은 기타 리프가 후렴에서 에너지를 끌어올려, 출발 직전의 설렘을 그린 곡이에요.',
      evidence: {
        bpm: 128,
        key: 'E♭ major',
        energy_change: '도입부 어쿠스틱 사운드에서 후렴 풀밴드 질주감으로 상승',
      },
      genre_heard: '시티팝 / 인디팝',
      mood_keywords: ['청량', '질주', '설렘', '초여름', '활주로'],
      colors: ['#7FD1C7', '#1F4E79', '#F6E27F'],
      cover_directions: [
        { id: 'c1', text: '활주로 위 종이비행기, 수채화 질감' },
        { id: 'c2', text: '여름 하늘 그라데이션, 미니멀 그래픽' },
        { id: 'c3', text: '필름 사진 질감의 오후 창가와 바람' },
      ],
      highlight: {
        candidates: [
          { id: 'h1', start: 72, end: 87, reason: '후렴 첫 진입 · 가장 에너지가 높은 구간' },
          { id: 'h2', start: 150, end: 165, reason: '마지막 후렴 · 감정 클라이맥스' },
        ],
        recommended_id: 'h1',
        selected: { start: 72, end: 87 },
      },
      waveform: [
        0.25, 0.35, 0.42, 0.38, 0.5, 0.55, 0.85, 0.95, 0.9, 1.0, 0.88, 0.65, 0.55, 0.6, 0.78, 0.92,
        0.85, 0.5, 0.35, 0.28,
      ],
      edits_remaining: 5,
    };

    setTitle('초여름 활주로');
    setArtist('201');
    setFeatured('');
    setSongwriter('이원일');
    setProducer('201 Studio');
    setGenre('인디팝');
    setLyrics('출발선에 선 모든 여름에게\n활주로 끝에서 불어오는 바람을 타고...');
    setShowOptionalMeta(true);
    setShowFullUploadForm(false);
    setError(null);
    setJobData((prev) => ({
      ...prev,
      jobId: 'demo-sample-1',
      title: '초여름 활주로',
      artist: '201',
      featured: '',
      songwriter: '이원일',
      producer: '201 Studio',
      lyrics: '출발선에 선 모든 여름에게\n활주로 끝에서 불어오는 바람을 타고...',
      genre: '인디팝',
      stage: 'note_ready',
    }));
    applyNote(demoNote, true);
  };

  // D3: AI에게 수정 요청 (작업당 5회)
  const handleAiCorrection = async (customText = null) => {
    const text = (customText ?? aiCorrection).trim();
    if (!text) return setError('AI에게 요청할 수정 내용을 한 줄로 입력해 주세요.');
    if (isDemo) {
      const nextV = (rawNote?.version || 1) + 1;
      const updated = {
        ...rawNote,
        version: nextV,
        interpretation: `${rawNote.interpretation} ('${text}' 요청을 반영해 톤을 다듬었어요.)`,
        edits_remaining: Math.max(0, (rawNote.edits_remaining ?? 5) - 1),
      };
      applyNote(updated);
      setAiCorrection('');
      setShowAiEdit(false);
      return;
    }

    setAiEditing(true);
    setError(null);
    try {
      const updated = await api.updateNote(jobData.jobId, { correction: text });
      applyNote(updated);
      setAiCorrection('');
      setShowAiEdit(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAiEditing(false);
    }
  };

  // D3: 직접 고치기 저장 (무제한, AI 횟수 차감 없음)
  const handleSaveDirectEdits = async () => {
    const cleanedMoods = editMoods.map((m) => m.trim()).filter(Boolean);
    if (cleanedMoods.length < 1 || cleanedMoods.length > 5) {
      return setError('무드 키워드는 1~5개 사이로 입력해 주세요.');
    }
    if (isDemo) {
      const nextV = (rawNote?.version || 1) + 1;
      const updated = {
        ...rawNote,
        version: nextV,
        mood_keywords: cleanedMoods,
        colors: editColors,
        cover_directions: editDirections,
        highlight: {
          ...rawNote.highlight,
          selected: { start: editHighlightStart, end: editHighlightStart + 15 },
        },
      };
      applyNote(updated);
      setDirectEditMode(false);
      return;
    }

    setSavingDirect(true);
    setError(null);
    try {
      const updated = await api.updateNote(jobData.jobId, {
        mood_keywords: cleanedMoods,
        colors: editColors,
        cover_directions: editDirections,
        highlight_start: Number(editHighlightStart),
      });
      applyNote(updated);
      setDirectEditMode(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDirect(false);
    }
  };

  // 하이라이트 15초 미리 듣기 재생 함수
  const playHighlightPreview = (startSec) => {
    previewAudioRef.current?.pause();
    clearTimeout(previewTimerRef.current);
    const audioUrl = jobStatus?.audio_url ? toFileUrl(jobStatus.audio_url) : null;
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    const sec = Math.max(0, Number(startSec) || 0);
    audio.currentTime = sec;
    audio.play().catch(() => {});
    previewAudioRef.current = audio;
    setPlayingPreview(true);

    previewTimerRef.current = setTimeout(() => {
      audio.pause();
      setPlayingPreview(false);
    }, 15000);
    audio.onended = () => setPlayingPreview(false);
  };

  // 하이라이트 후보 칩 클릭 시 바로 반영 및 15초 자동 재생
  const handleSelectHighlightStart = async (startSec, autoPlay = true) => {
    const rounded = Math.max(0, Math.round(Number(startSec) * 10) / 10);
    setEditHighlightStart(rounded);
    if (autoPlay) {
      playHighlightPreview(rounded);
    }
    if (isDemo || !jobData?.jobId) {
      setRawNote((prev) =>
        prev
          ? {
              ...prev,
              highlight: { ...prev.highlight, selected: { start: rounded, end: rounded + 15 } },
            }
          : prev
      );
      return;
    }
    if (ACCEPTED_STAGES.includes(jobStatus?.stage)) return;
    try {
      const updated = await api.updateNote(jobData.jobId, { highlight_start: rounded });
      applyNote(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  // 하이라이트 15초 미리 듣기 토글
  const handleTogglePreview = () => {
    if (playingPreview) {
      previewAudioRef.current?.pause();
      clearTimeout(previewTimerRef.current);
      setPlayingPreview(false);
      return;
    }
    playHighlightPreview(editHighlightStart);
  };

  // 다시 듣기 (가사/설명 반영)
  const handleRelisten = async () => {
    if (!jobData?.jobId || isDemo) return;
    setRelistening(true);
    setError(null);
    try {
      await api.patchJobInfo(jobData.jobId, {
        lyrics: lyrics.trim() || null,
        genre: genre.trim() || null,
      });
      await api.relistenNote(jobData.jobId);
      setAnalyzing(true);
      pollJobStatus(jobData.jobId);
    } catch (err) {
      setRelistening(false);
      setError(err.message);
    }
  };

  // 노트 수락 후 2단계 이동
  const handleAcceptNote = async () => {
    if (!jobData?.jobId || isDemo) {
      onNextStep();
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const cur = (await api.getReleaseInfo(jobData.jobId)).info;
      const credits = cur.credits.filter((c) => !['작곡', '프로듀서'].includes(c.role));
      if (songwriter.trim()) credits.push({ role: '작곡', legal_name: songwriter.trim(), stage_name: '' });
      if (producer.trim()) credits.push({ role: '프로듀서', legal_name: '', stage_name: producer.trim() });
      const feat = featured.replace(/^\s*(feat\.?|ft\.?)\s*/i, '').trim();
      await api.saveReleaseInfo(jobData.jobId, {
        ...cur,
        title: title.trim() || cur.title,
        artist: artist.trim() || cur.artist,
        featuring: feat ? [feat] : cur.featuring,
        credits,
        lyrics: lyrics.trim() || cur.lyrics,
      });
      const st = await api.getJobStatus(jobData.jobId);
      if (st.stage === 'note_ready' || st.stage === 'failed') {
        await api.acceptNote(jobData.jobId, selectedVersion);
      }
      setJobData((prev) => ({
        ...prev,
        title: title.trim() || prev.title,
        artist: artist.trim() || prev.artist,
        featured,
        songwriter,
        producer,
        lyrics,
        stage: 'generating',
      }));
      setAccepting(false);
      onNextStep();
    } catch (err) {
      setAccepting(false);
      setError(err.message || '노트 수락 처리 중 오류가 발생했습니다.');
    }
  };

  // D3 + B5: 수락한 뒤 1단계로 돌아와 기본 정보(제목·아티스트·피처링·크레딧) 수정 저장
  const handleSaveBasicInfoAfterAccept = async () => {
    if (!jobData?.jobId || isDemo) {
      setEditingBasicInfo(false);
      return;
    }
    setSavingBasicInfo(true);
    setBasicInfoSavedMsg(null);
    setError(null);
    try {
      const cur = (await api.getReleaseInfo(jobData.jobId)).info;
      const titleChanged = cur.title !== title.trim() || cur.artist !== artist.trim();
      const credits = cur.credits.filter((c) => !['작곡', '프로듀서'].includes(c.role));
      if (songwriter.trim()) credits.push({ role: '작곡', legal_name: songwriter.trim(), stage_name: '' });
      if (producer.trim()) credits.push({ role: '프로듀서', legal_name: '', stage_name: producer.trim() });
      const feat = featured.replace(/^\s*(feat\.?|ft\.?)\s*/i, '').trim();

      await api.saveReleaseInfo(jobData.jobId, {
        ...cur,
        album: cur.album === cur.title ? title.trim() : cur.album,
        title: title.trim() || cur.title,
        artist: artist.trim() || cur.artist,
        featuring: feat ? [feat] : [],
        credits,
      });

      localJobsStorage.upsert({
        job_id: jobData.jobId,
        title: title.trim(),
        artist: artist.trim(),
      });
      setJobData((prev) => ({
        ...prev,
        title: title.trim(),
        artist: artist.trim(),
        featured,
        songwriter,
        producer,
      }));
      setEditingBasicInfo(false);
      setBasicInfoSavedMsg(
        titleChanged
          ? '기본 정보를 저장했어요! 제목·아티스트가 변경되어 커뮤니티 및 에셋 정보가 갱신되었습니다.'
          : '기본 정보를 저장했어요.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBasicInfo(false);
    }
  };

  const displayedNote = (selectedVersion && noteVersions[selectedVersion]) || rawNote;
  const isAcceptedStage = ACCEPTED_STAGES.includes(jobStatus?.stage || jobData?.stage);
  const durationSec =
    jobStatus?.early?.duration_sec ||
    (displayedNote?.highlight?.candidates ? Math.max(...displayedNote.highlight.candidates.map((c) => c.end || 0), 180) : 180);
  const currentTip = RELEASE_TIPS[tipIdx];

  // 하이라이트 파형: 긴 파형은 UI에 맞춰 20개 막대로 다운샘플링, 없으면 실제 오디오 또는 추천 구간 기반 20개 막대 생성 (100% 무조건 막대그래프 보장)
  const effectiveWaveform = useMemo(() => {
    const raw = (displayedNote?.waveform && displayedNote.waveform.length > 0) ? displayedNote.waveform : jobStatus?.early?.waveform;
    if (raw && Array.isArray(raw) && raw.length > 0) {
      return downsampleWaveform(raw, 20);
    }
    if (extractedWaveform && extractedWaveform.length > 0) {
      return downsampleWaveform(extractedWaveform, 20);
    }
    return generateWaveformFromCandidates(displayedNote?.highlight?.candidates, durationSec);
  }, [displayedNote?.waveform, jobStatus?.early?.waveform, displayedNote?.highlight?.candidates, extractedWaveform, durationSec]);

  // D2: 진행 팝업 노출 여부 (업로드 중, 분석 중, 또는 분석 단계에서 실패했을 때)
  const showProgressModal =
    !progressModalDismissed &&
    (uploading ||
      analyzing ||
      (jobStatus?.stage === 'failed' && !displayedNote));

  const defaultSteps = [
    { key: 'upload', label: '업로드', status: uploading ? 'running' : 'done' },
    { key: 'copy', label: '남의 곡인지 확인', status: uploading ? 'pending' : 'done' },
    { key: 'features', label: '수치 재는 중 (BPM·키·에너지)', status: 'pending' },
    { key: 'listen', label: '곡을 듣는 중', status: 'pending' },
    { key: 'note', label: '해석 쓰는 중', status: 'pending' },
  ];
  const modalSteps = jobStatus?.steps?.length ? jobStatus.steps : defaultSteps;
  const pct = uploading ? 15 : Math.max(10, Math.round((jobStatus?.progress || 0.2) * 100));

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Title Header */}
      <div className="text-center space-y-2.5">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 1. 곡 업로드 & AI A&R 콘셉트 도출
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          음원 파일을 올리시면 오디오 신호 분석과 AI 청취를 통해 맞춤 A&R 콘셉트 노트를 도출합니다.
        </p>

        {/* Quick Demo Sample Button */}
        {!isAcceptedStage && (
          <div className="pt-1">
            <button
              onClick={handleLoadSample}
              type="button"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 border border-indigo-200 dark:border-indigo-500/30 transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>⚡ 파일이 없으신가요? [체험용 샘플 곡 자동 채우기] 원클릭</span>
            </button>
          </div>
        )}
      </div>

      {/* D1: 최근 작업 고르기 카드 (작업 바꾸기를 눌렀거나, 아직 열린 작업이 없을 때 표시) */}
      {(showJobPicker || (!jobData?.jobId && recentJobs.length > 0)) && (
        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 border-indigo-200 dark:border-indigo-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Disc3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-extrabold text-sm sm:text-base text-zinc-900 dark:text-white">최근 작업 고르기</h3>
            </div>
            <div className="flex items-center gap-3">
              {onGoToMe && (
                <button
                  type="button"
                  onClick={onGoToMe}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  전체는 '내 곡'에서 →
                </button>
              )}
              {jobData?.jobId && onStartNewJob && (
                <button
                  type="button"
                  onClick={() => {
                    onStartNewJob();
                    if (setShowJobPicker) setShowJobPicker(false);
                  }}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 곡 발매 준비하기</span>
                </button>
              )}
            </div>
          </div>

          {deleteNotice && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              {deleteNotice}
            </div>
          )}

          {recentJobs.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-white/5">
              {recentJobs.map((j) => {
                const isCurrent = j.job_id === jobData?.jobId;
                return (
                  <div
                    key={j.job_id}
                    className={`py-2.5 px-2 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                      isCurrent ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {j.title || '제목 없음'}
                      </span>
                      {j.artist && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">· {j.artist}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          j.stage === 'done'
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : j.stage === 'failed'
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {j.stage_label || j.stage}
                      </span>

                      {j.stage === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => handleRetryCurrentJob(j.job_id)}
                          disabled={retryingJobId === j.job_id}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>다시 시도</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectExistingJob) {
                              onSelectExistingJob(j, stepForStage(j.stage));
                            }
                            if (setShowJobPicker) setShowJobPicker(false);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            j.stage === 'done'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500'
                          }`}
                        >
                          {j.stage === 'done' ? '열기' : '이어서'}
                        </button>
                      )}

                      {confirmDeleteId === j.job_id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteJob(j.job_id)}
                            disabled={deletingJobId === j.job_id}
                            className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm"
                          >
                            {deletingJobId === j.job_id ? '삭제 중...' : '정말 지울까요?'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 text-xs"
                            title="취소"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(j.job_id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          title="작업 삭제 (되돌릴 수 없음)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 py-3 text-center">아직 최근 작업이 없어요. 아래에서 첫 곡을 올려 보세요!</p>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            로그인하지 않으면 이 브라우저에서만 보여요. 로그인하면 어느 기기에서나 '내 곡'에 모여요.
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          {jobStatus?.stage === 'failed' && jobStatus?.error?.retryable !== false && (
            <button
              type="button"
              onClick={() => handleRetryCurrentJob(jobData?.jobId)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>다시 시도</span>
            </button>
          )}
        </div>
      )}

      {/* D3 마지막 항목: 이미 수락한 작업으로 1단계에 돌아왔을 때 → 업로드 칸 숨기고 '완료된 곡 정보' 요약 + [기본 정보 수정] */}
      {isAcceptedStage ? (
        <div className="glass-panel rounded-2xl p-6 space-y-4 border-emerald-200 dark:border-emerald-500/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">완료된 곡 정보 요약</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  음원·가사·장르를 바꾸려면 상단의 <b>'새 곡 발매 준비하기'</b>로 새로 올려 주세요.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingBasicInfo((v) => !v)}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{editingBasicInfo ? '수정 닫기' : '기본 정보 수정 (제목·아티스트·크레딧)'}</span>
            </button>
          </div>

          {basicInfoSavedMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              {basicInfoSavedMsg}
            </div>
          )}

          {!editingBasicInfo ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5">
                <span className="text-zinc-400 block">곡 제목</span>
                <b className="text-zinc-900 dark:text-white text-sm">{title || '-'}</b>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5">
                <span className="text-zinc-400 block">아티스트</span>
                <b className="text-zinc-900 dark:text-white text-sm">{artist || '-'}</b>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5">
                <span className="text-zinc-400 block">피처링 / 장르</span>
                <b className="text-zinc-900 dark:text-white">{[featured, genre].filter(Boolean).join(' · ') || '-'}</b>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5">
                <span className="text-zinc-400 block">작곡 / 프로듀서</span>
                <b className="text-zinc-900 dark:text-white">{[songwriter, producer].filter(Boolean).join(' · ') || '-'}</b>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-white/10">
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 rounded-lg">
                💡 제목·아티스트를 바꾸면 홍보 글 속 이름을 즉시 바꾸고, 이미지·영상에 박힌 제목도 백그라운드로 새로 그려요 (약 40초).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">곡 제목 *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">아티스트명 *</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">피처링</label>
                  <input
                    type="text"
                    value={featured}
                    onChange={(e) => setFeatured(e.target.value)}
                    className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">작곡가 실명</label>
                  <input
                    type="text"
                    value={songwriter}
                    onChange={(e) => setSongwriter(e.target.value)}
                    className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">프로듀서</label>
                  <input
                    type="text"
                    value={producer}
                    onChange={(e) => setProducer(e.target.value)}
                    className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBasicInfo(false)}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveBasicInfoAfterAccept}
                  disabled={savingBasicInfo}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                >
                  {savingBasicInfo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>기본 정보 저장</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : displayedNote && !isAcceptedStage && !showFullUploadForm ? (
        /* 분석 완료 후: 간결한 곡 정보 요약 칩 + 정보 수정 토글 */
        <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-indigo-200 dark:border-indigo-500/30 bg-white/70 dark:bg-[#121215]/70 backdrop-blur-sm shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 border border-indigo-200/60 dark:border-indigo-500/30">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>분석 대상 음원</span>
                </span>
                {file && <span className="text-xs text-zinc-400">({file.name})</span>}
              </div>
              <h4 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white mt-1">
                {title || '무제'} <span className="text-zinc-400 font-normal">·</span> {artist || '아티스트 미정'}
                {featured && <span className="text-xs text-zinc-500 font-normal"> (feat. {featured})</span>}
              </h4>
              {(genre || songwriter || producer) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {[genre && `장르: ${genre}`, songwriter && `작곡: ${songwriter}`, producer && `프로듀서: ${producer}`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFullUploadForm(true)}
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>음원 / 곡 정보 수정</span>
          </button>
        </div>
      ) : (
        /* Main Upload Form Grid (수락 전 또는 정보 수정 모드) */
        <div className="space-y-4">
          {displayedNote && !isAcceptedStage && showFullUploadForm && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullUploadForm(false)}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 text-zinc-600 dark:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
                <span>수정 접기 (A&R 노트 바로 보기)</span>
              </button>
            </div>
          )}

          <div id="upload-section" className="max-w-2xl mx-auto space-y-5 scroll-mt-24">
            {/* 1. Hero Audio Dropzone (Primary Visual Anchor) */}
            <div className="space-y-2">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-2xl p-7 sm:p-9 flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed transition-all group ${
                  file
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/25 shadow-lg shadow-indigo-500/10'
                    : 'border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121216] hover:border-indigo-400 hover:bg-zinc-50 dark:hover:bg-[#16161c]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".wav,.mp3,audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                  <UploadCloud className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                </div>

                <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white mb-1">
                  {file ? file.name : '음원 파일을 마우스로 끌어다 놓으세요'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                  {file
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB • 준비 완료 (클릭하여 파일 변경)`
                    : '무손실 WAV (24bit/48kHz 권장) 또는 MP3 파일 (30초 이상)'}
                </p>

                {file && (
                  <div className="mt-3 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>선택된 음원 준비 완료</span>
                  </div>
                )}
              </div>

              {/* Discreet Audio Notice */}
              <div className="px-2 flex flex-wrap items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
                <span>• 유통사 정식 발매에는 24-bit / 48kHz WAV가 가장 안전해요</span>
                <span>• 자동 소리 지문 검사로 상용곡 여부를 확인해요</span>
              </div>
            </div>

            {/* 2. Metadata Inputs Card (Secondary Anchor) */}
            <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-4 shadow-md border-zinc-200 dark:border-white/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mb-1.5 flex items-center gap-1.5">
                    <span>곡 제목 (Track Title)</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 초여름 활주로"
                    className="w-full bg-zinc-50/50 dark:bg-[#16161c] border-2 border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mb-1.5 flex items-center gap-1.5">
                    <span>아티스트명 (Artist Name)</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">*</span>
                  </label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="예: 201"
                    className="w-full bg-zinc-50/50 dark:bg-[#16161c] border-2 border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* 점진적 공개: 가사 및 추가 크레딧 접이식 아코디언 */}
              <div className="border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => setShowOptionalMeta((prev) => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {showOptionalMeta ? (
                      <ChevronUp className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    )}
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      가사 및 추가 크레딧 입력하기 (선택)
                    </span>
                    {(featured || songwriter || producer || genre || lyrics) && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-xs font-extrabold">
                        입력됨
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 font-normal">
                    {showOptionalMeta ? '접기' : '피처링 · 작곡가 · 프로듀서 · 장르 · 가사'}
                  </span>
                </button>

                {showOptionalMeta && (
                  <div className="p-4 pt-1 space-y-3.5 border-t border-zinc-200 dark:border-white/10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">피처링 (선택)</label>
                        <input
                          type="text"
                          value={featured}
                          onChange={(e) => setFeatured(e.target.value)}
                          placeholder="예: feat. 아무개"
                          className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">작곡가 실명 (권장)</label>
                        <input
                          type="text"
                          value={songwriter}
                          onChange={(e) => setSongwriter(e.target.value)}
                          placeholder="홍길동"
                          className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">프로듀서 (선택)</label>
                        <input
                          type="text"
                          value={producer}
                          onChange={(e) => setProducer(e.target.value)}
                          placeholder="Producer Name"
                          className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">내가 생각하는 장르 (선택)</label>
                      <input
                        type="text"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        maxLength={50}
                        placeholder="예: 인디팝, 시티팝, 모던록"
                        className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">가사 (선택)</label>
                      <textarea
                        rows={3}
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        placeholder="가사를 입력하면 A&R 해석과 유통사 가사 형식 점검(줄바꿈, 대문자 규칙 등)에 활용됩니다."
                        className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none shadow-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Consent Checkboxes — 동의서 v1.6 반영 (서비스 종료일 10/31 일괄 삭제) */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2">
                <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">동의 (동의서 {CONSENT_VERSION})</span>
                {[
                  [
                    'privacy',
                    <>
                      [필수] 만 14세 이상이에요. 개인정보 수집·이용 — 곡 정보·음원·크레딧·발매 정보·소리 지문. 서비스 종료일({SERVICE_END_DATE})에 일괄 삭제 (
                      <a
                        href="https://api.201.n-e.kr/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="underline text-indigo-600 dark:text-indigo-400 font-bold hover:text-indigo-500"
                        title="새 창으로 개인정보처리방침 원문 열기"
                      >
                        개인정보처리방침 원문 ↗
                      </a>
                      )
                    </>,
                  ],
                  [
                    'external_ai',
                    '[필수] 외부 AI·음원 DB 전송 — 음원 분석은 Gemini, 글·이미지는 코디세이 API/OpenAI, 지문 확인은 AcoustID로 처리',
                  ],
                  [
                    'original',
                    '[필수] 직접 만든 곡이거나 올릴 권리가 있고 참여자 동의를 받았어요. AI 결과물은 저작권이 인정되지 않을 수 있어요',
                  ],
                  ['showcase', `[선택] 결과물 썸네일·이용 통계를 서비스 개선 및 발표 자료에 써도 돼요 (${SERVICE_END_DATE} 삭제)`],
                ].map(([key, text]) => (
                  <label key={key} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consents[key]}
                      onChange={(e) => setConsent(key, e.target.checked)}
                      className="mt-0.5 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{text}</span>
                  </label>
                ))}
              </div>

              {/* 3. Primary Action Button: Start Analysis */}
              {!displayedNote && (
                <button
                  type="button"
                  onClick={() => handleStartAnalysis(false)}
                  disabled={uploading || analyzing}
                  className="w-full btn-primary flex items-center justify-center gap-2.5 py-4 text-base font-extrabold shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>음원 업로드 & 소리 지문 확인 중...</span>
                    </>
                  ) : analyzing ? (
                    <>
                      <Sparkles className="w-5 h-5 animate-spin text-amber-300" />
                      <span>AI가 곡을 듣고 있어요 (진행 창 열기)</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-300" />
                      <span>⚡ AI 분석 시작 & A&R 콘셉트 도출</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* D3: AI A&R Note Card (수정 요청 5회, 직접 고치기, 하이라이트 15초 파형/미리듣기, 버전 전환) */}
      <AnimatePresence>
        {displayedNote && (
          <motion.div
            ref={noteCardRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel border-indigo-200 dark:border-indigo-500/40 rounded-2xl p-6 sm:p-8 space-y-6 bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900/60"
          >
            {/* Header & Version Chips */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white">AI A&R 콘셉트 노트 도출 완료</h3>
                  <p className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">
                    오디오 신호(BPM, 키, 에너지)와 AI 청취 결과를 결합한 콘셉트 리포트입니다.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {Object.keys(noteVersions).length > 1 && (() => {
                  const sortedVersions = Object.keys(noteVersions).map(Number).sort((a, b) => a - b);
                  const isLongList = sortedVersions.length > 7;
                  const latestVer = sortedVersions[sortedVersions.length - 1];
                  const firstVer = sortedVersions[0];

                  return (
                    <div className="flex items-center gap-1.5 max-w-full flex-wrap sm:flex-nowrap">
                      <span className="text-xs text-zinc-400 font-medium flex-shrink-0">버전:</span>
                      {isLongList ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <select
                            value={selectedVersion || latestVer}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSelectedVersion(v);
                              syncDirectEditState(noteVersions[v]);
                            }}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200"
                            title="버전 선택"
                          >
                            {sortedVersions.map((v) => (
                              <option key={v} value={v}>
                                v{v} {v === latestVer ? '(최신)' : v === firstVer ? '(최초)' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVersion(firstVer);
                              syncDirectEditState(noteVersions[firstVer]);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${
                              selectedVersion === firstVer
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            v{firstVer} (최초)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVersion(latestVer);
                              syncDirectEditState(noteVersions[latestVer]);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${
                              selectedVersion === latestVer
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            v{latestVer} (최신)
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {sortedVersions.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                setSelectedVersion(v);
                                syncDirectEditState(noteVersions[v]);
                              }}
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${
                                selectedVersion === v
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                              }`}
                            >
                              v{v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex-shrink-0">
                  {selectedVersion && selectedVersion !== displayedNote.version
                    ? `v${selectedVersion} 보는 중 (최신 v${displayedNote.version})`
                    : `분석 완료 (v${displayedNote.version || 1})`}
                </span>
              </div>
            </div>

            {/* R11: Top 2-Button Action Toolbar for Editing */}
            {!isAcceptedStage && (
              <div className="p-3.5 rounded-xl bg-white/90 dark:bg-[#121215]/90 border border-indigo-200 dark:border-indigo-500/30 shadow-sm space-y-2.5">
                {/* 신미영님 피드백: 버전 수정 가능 기한 및 횟수 안내 */}
                <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-2 rounded-lg border border-indigo-100 dark:border-indigo-800/40">
                  <Info className="w-4 h-4 flex-shrink-0 text-indigo-500" />
                  <span>
                    <strong>수정 기한 안내:</strong> 다음 <strong>2단계(패키지 제작)로 진행하기 전까지</strong> 언제든 자유롭게 수정하고 이전 버전을 불러올 수 있습니다. (AI 한 줄 수정 5회 / 직접 수정 무제한)
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      원하는 방식으로 콘셉트를 다듬어 보세요:
                    </span>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAiEdit((v) => !v);
                      if (directEditMode) setDirectEditMode(false);
                    }}
                    disabled={(displayedNote.edits_remaining ?? 5) <= 0}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                      showAiEdit
                        ? 'bg-amber-500 text-white shadow-amber-500/30'
                        : 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 hover:bg-amber-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>✨ AI에게 한 줄 요청 · {displayedNote.edits_remaining ?? 5}/5회</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDirectEditMode((v) => !v);
                      if (showAiEdit) setShowAiEdit(false);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                      directEditMode
                        ? 'bg-indigo-600 text-white shadow-indigo-500/30'
                        : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{directEditMode ? '✎ 직접 고치기 종료' : '✎ 직접 고치기'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

            {/* 1. HERO: 디렉터 코멘트 (AI 해석 & 핵심 콘셉트가 최상단 주인공) */}
            <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-zinc-900/60 to-zinc-900/80 border border-indigo-500/30 shadow-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
                    AI A&R Director's Concept
                  </span>
                </div>
                {/* 오디오 메트릭 배지 칩들 (BPM · 키 · 장르) */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  {displayedNote.evidence?.bpm && (
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-200">
                      ⚡ {Math.round(displayedNote.evidence.bpm)} BPM
                    </span>
                  )}
                  {displayedNote.evidence?.key && (
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-200">
                      🎵 {displayedNote.evidence.key}
                    </span>
                  )}
                  {displayedNote.genre_heard && (
                    <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/25 text-sky-300">
                      🎸 {displayedNote.genre_heard}
                    </span>
                  )}
                </div>
              </div>

              {/* 핵심 콘셉트 쿼트 (큼직하고 돋보이는 타이포) */}
              <blockquote className="text-base sm:text-xl font-extrabold text-zinc-900 dark:text-white leading-relaxed tracking-tight">
                "{displayedNote.interpretation}"
              </blockquote>

              {/* 무드 키워드 & 곡의 색상 팔레트 (연필 표시 명확화 및 상시 수정 가능) */}
              <div className={`flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-zinc-200 dark:border-white/10 transition-all ${
                directEditMode ? 'border-2 border-dashed border-indigo-400 dark:border-indigo-500 rounded-xl p-3.5 bg-indigo-50/20 dark:bg-indigo-950/20' : ''
              }`}>
                {/* 무드 키워드 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1 mr-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>무드 키워드 ✎</span>
                    <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500">(최대 5개 · 클릭하여 수정)</span>
                    <span className="text-zinc-400 dark:text-zinc-500">:</span>
                  </div>
                  {(directEditMode ? editMoods : displayedNote.mood_keywords || []).map((kw, idx) => (
                    <span
                      key={`${kw}-${idx}`}
                      onClick={() => {
                        if (!isAcceptedStage && !directEditMode) setDirectEditMode(true);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold border border-indigo-200 dark:border-indigo-500/30 transition-all ${
                        !isAcceptedStage && !directEditMode ? 'hover:scale-105 hover:border-indigo-400 cursor-pointer shadow-xs' : ''
                      }`}
                      title={!directEditMode ? '클릭하여 무드 키워드 수정' : undefined}
                    >
                      <span>#{kw}</span>
                      {directEditMode && editMoods.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditMoods((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="hover:text-rose-500 ml-0.5 text-zinc-400 hover:text-rose-600 transition-colors"
                          title="키워드 삭제"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}

                  {directEditMode && editMoods.length < 5 && (
                    <div className="inline-flex items-center gap-1 ml-1">
                      <input
                        type="text"
                        value={newMoodInput}
                        onChange={(e) => setNewMoodInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newMoodInput.trim() && editMoods.length < 5) {
                              setEditMoods((prev) => [...prev, newMoodInput.trim().slice(0, 20)]);
                              setNewMoodInput('');
                            }
                          }
                        }}
                        placeholder="새 키워드 입력"
                        maxLength={20}
                        className="w-28 px-2.5 py-1 rounded-lg border border-indigo-300 dark:border-indigo-500/40 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newMoodInput.trim() && editMoods.length < 5) {
                            setEditMoods((prev) => [...prev, newMoodInput.trim().slice(0, 20)]);
                            setNewMoodInput('');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition-colors"
                      >
                        ＋ 추가
                      </button>
                    </div>
                  )}

                  {!isAcceptedStage && !directEditMode && (
                    <button
                      type="button"
                      onClick={() => setDirectEditMode(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-all ml-1 shadow-xs"
                      title="클릭하여 무드 키워드 직접 수정"
                    >
                      <Edit3 className="w-3 h-3 text-indigo-500" />
                      <span>키워드 수정 ✎</span>
                    </button>
                  )}
                </div>

                {/* 곡의 색상 팔레트 (연필 표시 & 클릭 시 컬러 피커 상시 작동) */}
                <div className="flex flex-wrap items-center gap-2 bg-zinc-50/80 dark:bg-zinc-900/60 p-2 rounded-xl border border-zinc-200/60 dark:border-white/5">
                  <div className="flex items-center gap-1 text-xs font-bold text-zinc-700 dark:text-zinc-300 mr-1">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>색감 ✎:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(directEditMode ? editColors : displayedNote.colors || []).map((c, idx) => (
                      <label
                        key={idx}
                        className="group relative flex flex-col items-center cursor-pointer"
                        title={`색상 ${idx + 1} (${c}) · 클릭하여 원하는 색으로 변경`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg border-2 border-white dark:border-zinc-700 shadow-md relative overflow-hidden flex items-center justify-center transition-all group-hover:scale-110 active:scale-95 group-hover:ring-2 group-hover:ring-indigo-400"
                          style={{ background: c }}
                        >
                          {/* 연필 표시 오버레이 (클릭하여 수정 가능함을 명시) */}
                          <div className="w-4 h-4 rounded-full bg-black/45 backdrop-blur-[1px] flex items-center justify-center text-white shadow-xs group-hover:bg-black/65 transition-colors pointer-events-none">
                            <Edit3 className="w-2.5 h-2.5 text-white drop-shadow" />
                          </div>

                          {/* 상시 작동하는 네이티브 컬러 피커 */}
                          {!isAcceptedStage && (
                            <input
                              type="color"
                              value={c}
                              onChange={(e) => {
                                const newCol = e.target.value.toUpperCase();
                                const base = directEditMode ? editColors : (displayedNote.colors || []);
                                const next = [...base];
                                next[idx] = newCol;
                                setEditColors(next);
                                if (!directEditMode) setDirectEditMode(true);
                              }}
                              className="opacity-0 inset-0 w-full h-full cursor-pointer absolute z-20"
                            />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 mt-0.5 select-none font-semibold">
                          {c}
                        </span>
                      </label>
                    ))}
                  </div>

                  {!isAcceptedStage && !directEditMode && (
                    <button
                      type="button"
                      onClick={() => setDirectEditMode(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold border border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-xs ml-1"
                      title="색상 직접 수정 모드 열기"
                    >
                      <Edit3 className="w-3 h-3 text-indigo-500" />
                      <span>색상 수정 ✎</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 4: 하이라이트 15초 ✎ (파형 막대그래프 20개 + 추천 후보 + 미리 듣기) */}
            <div className={`p-4 sm:p-5 rounded-xl bg-white dark:bg-[#121215] space-y-3.5 shadow-sm transition-all ${
              directEditMode ? 'border-2 border-dashed border-indigo-400 dark:border-indigo-500' : 'border border-zinc-200 dark:border-white/5'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    하이라이트 15초 ✎ · 숏폼 영상과 커뮤니티 미리 듣기에 쓰여요
                  </span>
                </div>
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30">
                  선택 구간: {fmtTime(editHighlightStart)} – {fmtTime(editHighlightStart + 15)} (클릭하여 변경 ✎)
                </span>
              </div>

              {/* Waveform Bars (막대그래프) — 20개 막대로 다운샘플링되어 어떤 음원이든 100% 막대그래프 형태로 시각화 */}
              {effectiveWaveform?.length > 0 && (
                <div className="space-y-2 p-3 sm:p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-white/10">
                  <div
                    className="h-16 sm:h-20 flex items-end gap-1 sm:gap-1.5 pt-2 px-1 cursor-pointer select-none"
                    title="파형 막대를 클릭하면 해당 위치부터 15초 하이라이트 구간으로 변경됩니다"
                  >
                    {effectiveWaveform.map((val, i) => {
                      const totalBars = effectiveWaveform.length;
                      const barStart = (i / totalBars) * durationSec;
                      const barEnd = ((i + 1) / totalBars) * durationSec;
                      const hlStart = editHighlightStart || 0;
                      const hlEnd = hlStart + 15;
                      const inHighlight = barStart < hlEnd && barEnd > hlStart;
                      const heightPct = Math.max(20, Math.min(100, Math.round(val * 100)));

                      // 각 후보 구간에 속하는지 체크
                      const candList = displayedNote?.highlight?.candidates || [];
                      const inCand0 = candList[0] && barStart < candList[0].end && barEnd > candList[0].start;
                      const inCand1 = candList[1] && barStart < candList[1].end && barEnd > candList[1].start;
                      const inCand2 = candList[2] && barStart < candList[2].end && barEnd > candList[2].start;

                      let barColor = 'bg-zinc-300 dark:bg-zinc-700/80 hover:bg-zinc-400 dark:hover:bg-zinc-600';
                      if (inHighlight) {
                        barColor = 'bg-indigo-600 dark:bg-indigo-400 shadow-md shadow-indigo-500/40 ring-2 ring-indigo-300 dark:ring-indigo-300';
                      } else if (inCand0) {
                        barColor = 'bg-indigo-200 dark:bg-indigo-900/60 hover:bg-indigo-300 dark:hover:bg-indigo-700/60';
                      } else if (inCand1) {
                        barColor = 'bg-emerald-200 dark:bg-emerald-900/60 hover:bg-emerald-300 dark:hover:bg-emerald-700/60';
                      } else if (inCand2) {
                        barColor = 'bg-purple-200 dark:bg-purple-900/60 hover:bg-purple-300 dark:hover:bg-purple-700/60';
                      }

                      return (
                        <div
                          key={i}
                          onClick={() => {
                            const maxStart = Math.max(0, durationSec - 15);
                            const target = Math.min(maxStart, Math.max(0, Math.round(barStart)));
                            handleSelectHighlightStart(target, true);
                          }}
                          style={{ height: `${heightPct}%` }}
                          title={`${fmtTime(barStart)} ~ ${fmtTime(barEnd)} (클릭 시 15초 하이라이트 구간 지정 & 미리듣기)`}
                          className={`flex-1 min-w-[6px] rounded-[4px] transition-all duration-150 hover:brightness-110 active:scale-95 ${barColor}`}
                        />
                      );
                    })}
                  </div>

                  {/* 하단 시간 표시 & 안내 문구 (R11: 단일하고 명확한 안내 문구) */}
                  <div className="flex justify-between items-center text-xs text-zinc-400 font-mono px-1 pt-1.5 border-t border-zinc-200/60 dark:border-white/5">
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">0:00</span>
                    <span className="text-zinc-600 dark:text-zinc-300 font-sans text-xs flex items-center gap-1.5 font-bold">
                      <Edit3 className="w-3.5 h-3.5 text-indigo-500 inline" />
                      <span>막대를 눌러 15초 구간 바꾸기</span>
                    </span>
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">{fmtTime(durationSec || 180)}</span>
                  </div>
                </div>
              )}

              {/* Candidate Chips & Audio Preview Button */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(displayedNote.highlight?.candidates || []).map((cand, idx) => {
                    const isRec = cand.id === displayedNote.highlight?.recommended_id;
                    const isSel = Math.abs((editHighlightStart || 0) - cand.start) < 1.5;
                    const dotColor = idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-emerald-500' : 'bg-purple-500';

                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleSelectHighlightStart(cand.start, true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          isSel
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-1 ring-indigo-400'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400'
                        }`}
                        title="클릭 시 15초 구간 선택 및 자동 재생"
                      >
                        <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-white' : dotColor}`} />
                        <span>{isRec ? '추천 ' : ''}{fmtTime(cand.start)}–{fmtTime(cand.end)}</span>
                        <span className="opacity-70 font-normal">· {cand.reason}</span>
                      </button>
                    );
                  })}
                </div>

                {(jobStatus?.audio_url || isDemo) && (
                  <button
                    type="button"
                    onClick={handleTogglePreview}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                      playingPreview
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {playingPreview ? (
                      <>
                        <Pause className="w-3.5 h-3.5 animate-pulse" />
                        <span>15초 미리듣기 재생 중...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-indigo-500" />
                        <span>▶ 15초 미리 듣기</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Row 5: 커버 방향 3개 ✎ */}
            <div className={`p-4 sm:p-5 rounded-xl bg-white dark:bg-[#121215] space-y-3 shadow-sm transition-all ${
              directEditMode ? 'border-2 border-dashed border-indigo-400 dark:border-indigo-500' : 'border border-zinc-200 dark:border-white/5'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    커버 아트워크 방향 3가지 ✎ (수락하면 이 3가지로 커버가 만들어져요)
                  </span>
                </div>
                {!isAcceptedStage && (
                  <button
                    type="button"
                    onClick={() => setDirectEditMode((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 transition-all shadow-xs"
                    title="커버 방향 문구 직접 수정하기"
                  >
                    <Edit3 className="w-3 h-3 text-indigo-500" />
                    <span>{directEditMode ? '수정 완료' : '방향 문구 수정 ✎'}</span>
                  </button>
                )}
              </div>

              {directEditMode ? (
                <div className="space-y-2">
                  {editDirections.map((d, idx) => (
                    <div key={d.id} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 w-5">
                        {['①', '②', '③'][idx] || `${idx + 1}.`}
                      </span>
                      <input
                        type="text"
                        value={d.text}
                        maxLength={300}
                        onChange={(e) => {
                          const next = [...editDirections];
                          next[idx] = { ...next[idx], text: e.target.value };
                          setEditDirections(next);
                        }}
                        className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-white/15 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder={`커버 시안 ${idx + 1} 방향 설명`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                  {(displayedNote.cover_directions || []).map((d, idx) => (
                    <div
                      key={d.id}
                      onClick={() => !isAcceptedStage && setDirectEditMode(true)}
                      className="group flex items-center justify-between p-2 rounded-lg hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30"
                      title="클릭하여 문구 직접 수정"
                    >
                      <p className="flex-1">
                        <b className="text-indigo-600 dark:text-indigo-400 mr-2">{['①', '②', '③'][idx]}</b>
                        {d.text}
                      </p>
                      {!isAcceptedStage && (
                        <span className="opacity-0 group-hover:opacity-100 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-0.5 ml-2 shrink-0 transition-opacity">
                          <Edit3 className="w-3 h-3" />
                          <span>수정 ✎</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 직접 고치기 저장 바 */}
            {directEditMode && !isAcceptedStage && (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30">
                <span className="text-xs text-indigo-800 dark:text-indigo-200 font-medium">
                  직접 고치기는 AI 횟수를 쓰지 않고 무제한으로 바꿀 수 있어요.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      syncDirectEditState(displayedNote);
                      setDirectEditMode(false);
                    }}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDirectEdits}
                    disabled={savingDirect}
                    className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
                  >
                    {savingDirect && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>직접 고친 내용 반영</span>
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons (AI 수정 요청 / 직접 고치기 / 이대로 진행) */}
            {!isAcceptedStage ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAiEdit((v) => !v)}
                      disabled={(displayedNote.edits_remaining ?? 5) <= 0}
                      className="btn-secondary text-xs px-4 py-2.5 flex items-center gap-1.5 disabled:opacity-45"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>AI에게 수정 요청 · 남은 {displayedNote.edits_remaining ?? 5}/5</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDirectEditMode((v) => !v)}
                      className="btn-secondary text-xs px-4 py-2.5 flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{directEditMode ? '직접 고치기 닫기' : '직접 고치기'}</span>
                    </button>

                    {!isDemo && (
                      <button
                        type="button"
                        onClick={handleRelisten}
                        disabled={relistening || (displayedNote.edits_remaining ?? 5) <= 0}
                        title="추가한 가사나 장르를 반영해 AI가 다시 듣습니다 (수정 횟수 1회 차감)"
                        className="btn-secondary text-xs px-3.5 py-2.5 flex items-center gap-1.5 disabled:opacity-45"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>다시 듣기</span>
                      </button>
                    )}

                    {(displayedNote.edits_remaining ?? 5) <= 0 && (
                      <span className="text-xs text-zinc-500">AI 수정 횟수를 다 썼어요. 직접 고치기는 계속 돼요.</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={handleAcceptNote}
                      disabled={accepting}
                      className="btn-primary flex items-center justify-center gap-2.5 px-7 py-3.5 text-sm sm:text-base font-extrabold shadow-lg shadow-indigo-500/30"
                    >
                      {accepting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>커버 & 홍보글 생성 시작 중...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>이 콘셉트로 커버 & 홍보글 생성 (Step 2)</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Step 2로 넘어가기 전까지 위에서 언제든 콘셉트를 계속 수정할 수 있습니다.
                    </span>
                  </div>
                </div>

                {/* AI 수정 요청 패널 */}
                {showAiEdit && (displayedNote.edits_remaining ?? 5) > 0 && (
                  <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-indigo-200 dark:border-indigo-500/30 space-y-3">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                      AI에게 수정 요청 (10초 안팎 · 해석과 무드를 다시 써요)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {AI_QUICK_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          disabled={aiEditing}
                          onClick={() => handleAiCorrection(chip)}
                          className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/10"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aiCorrection}
                        onChange={(e) => setAiCorrection(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAiCorrection()}
                        maxLength={200}
                        placeholder="예: 터지는 게 아니라 체념하는 분위기야"
                        className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleAiCorrection()}
                        disabled={aiEditing}
                        className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                      >
                        {aiEditing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>다시 쓰기</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={onNextStep}
                  className="btn-primary flex items-center gap-2 px-6 py-3 text-sm shadow-md"
                >
                  <span>2단계 (비주얼 에셋) 보러 가기</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* D2: 업로드·분석 중 진행 팝업 (1~3분 + 발매 팁 8종 + 실패 시 다시 시도) */}
      <AnimatePresence>
        {showProgressModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-5 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-base text-zinc-900 dark:text-white truncate">
                  {jobStatus?.stage === 'failed'
                    ? `'${title || '곡'}' 분석이 멈췄어요`
                    : `'${title || '곡'}' 듣는 중`}
                </h3>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  {jobStatus?.queue_position
                    ? `차례를 기다리는 중 (${jobStatus.queue_position}번째)`
                    : jobStatus?.stage === 'failed'
                    ? '오류 발생'
                    : '약 1~2분 소요'}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    jobStatus?.stage === 'failed' ? 'bg-rose-500' : 'bg-indigo-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Steps Checklist */}
              <div className="space-y-2 text-xs">
                {modalSteps.map((st) => {
                  const isDone = st.status === 'done';
                  const isRun = st.status === 'running';
                  const isFail = st.status === 'failed';
                  return (
                    <div key={st.key} className="flex items-center gap-2.5">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isRun
                            ? 'bg-indigo-600 text-white animate-pulse'
                            : isFail
                            ? 'bg-rose-500 text-white'
                            : 'border border-zinc-300 dark:border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : isRun ? '●' : isFail ? '✕' : ''}
                      </span>
                      <span
                        className={
                          isDone || isRun
                            ? 'font-semibold text-zinc-900 dark:text-white'
                            : isFail
                            ? 'font-bold text-rose-600 dark:text-rose-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }
                      >
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 실패 시 다시 시도 버튼 */}
              {jobStatus?.stage === 'failed' && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 space-y-2.5 text-xs">
                  <p className="text-rose-700 dark:text-rose-300 font-semibold">
                    {jobStatus?.error?.message || error || '분석 중 문제가 생겼어요.'}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setProgressModalDismissed(true)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      닫기
                    </button>
                    {jobStatus?.error?.retryable !== false && (
                      <button
                        type="button"
                        onClick={() => handleRetryCurrentJob(jobData?.jobId)}
                        disabled={retryingJobId === jobData?.jobId}
                        className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>다시 시도</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Rotating Release Tip */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>발매 팁 {tipIdx + 1}/{RELEASE_TIPS.length}</span>
                  <button
                    type="button"
                    onClick={() => setTipIdx((prev) => (prev + 1) % RELEASE_TIPS.length)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    다음 팁 →
                  </button>
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">{currentTip.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{currentTip.desc}</p>
              </div>

              {/* Dots */}
              <div className="flex items-center justify-center gap-1.5">
                {RELEASE_TIPS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTipIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === tipIdx ? 'bg-indigo-600 w-3' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* D2 / B2: 알려진 곡과 비슷할 때 확인 모달 (409 KNOWN_SONG_MATCH) */}
      <AnimatePresence>
        {knownSongModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4 bg-white dark:bg-[#121215] border border-amber-300 dark:border-amber-500/40 shadow-2xl"
            >
              <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                아직 분석을 시작하지 않았어요
              </span>
              <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white leading-snug">
                {knownSongModal}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                직접 만든 자작곡이 맞으면 아래 버튼을 눌러 계속 진행해 주세요. 다른 사람의 음원이면 올릴 수 없어요.
              </p>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border-l-4 border-amber-500 text-xs text-amber-800 dark:text-amber-200">
                다른 사람의 곡을 무단으로 올리면 공개가 내려가고 이용이 제한될 수 있어요.
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setKnownSongModal(null)}
                  className="btn-secondary text-xs px-4 py-2.5"
                >
                  올리지 않을게요
                </button>
                <button
                  type="button"
                  onClick={() => handleStartAnalysis(true)}
                  className="btn-primary text-xs px-4 py-2.5 shadow-md"
                >
                  직접 만든 곡이 맞아요 — 계속
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* D2 / B2: 커뮤니티 중복 녹음 거절 모달 (409 DUPLICATE_TRACK / ALREADY_PUBLISHED) */}
      <AnimatePresence>
        {duplicateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4 bg-white dark:bg-[#121215] border border-rose-300 dark:border-rose-500/40 shadow-2xl"
            >
              <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300">
                올릴 수 없어요
              </span>
              <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white leading-snug">
                {duplicateModal.code === 'ALREADY_PUBLISHED'
                  ? '이미 커뮤니티에 공개한 곡이에요'
                  : '커뮤니티에 이미 같은 녹음이 있어요'}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {duplicateModal.message}
              </p>
              <div className="flex items-center justify-between gap-2 pt-2">
                {onGoToCommunity ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateModal(null);
                      onGoToCommunity();
                    }}
                    className="btn-secondary text-xs px-4 py-2.5"
                  >
                    {duplicateModal.code === 'ALREADY_PUBLISHED' ? '들어봐에서 보기' : '신고하러 가기'}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="btn-primary text-xs px-5 py-2.5"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF p.1 #4: 필수정보 미입력 팝업 모달 */}
      <AnimatePresence>
        {validationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4 bg-white dark:bg-[#121215] border border-amber-300 dark:border-amber-500/40 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white">
                  {validationModal.title}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {validationModal.message}
              </p>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setValidationModal(null)}
                  className="btn-primary text-xs px-5 py-2.5"
                >
                  확인하고 입력하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF p.2 #5: 개인정보처리방침 모달 */}
      <AnimatePresence>
        {privacyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  발매로 서비스 이용 및 개인정보처리방침 (v1.6)
                </h3>
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-300 space-y-4 leading-relaxed">
                <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                  발매로는 <strong>{SERVICE_END_DATE}</strong>까지 운영되며, 종료일에 모든 업로드 음원, 기획 자료, 공개 곡이 일괄 파기됩니다.
                </div>
                <h4 className="font-bold text-zinc-900 dark:text-white text-sm">1. 수집 항목 및 목적</h4>
                <p>• 수집 항목: 업로드 음원 파일, 곡 메타데이터(제목, 아티스트, 작곡/작사가 등), 생성된 앨범 커버 및 A&R 기획서, 소리 지문(AcoustID 검증용)</p>
                <p>• 수집 목적: 음원 발매 패키징(유통사별 서류/에셋) 생성, 권리 자가진단 및 커뮤니티 피드백 공간 제공</p>
                <h4 className="font-bold text-zinc-900 dark:text-white text-sm">2. 외부 처리 및 AI API 위탁</h4>
                <p>• 음원 분석·커버 검사: Google Gemini API (미국)</p>
                <p>• 기획서 및 비주얼 생성: 코디세이 API(대한민국)를 거쳐 OpenAI 모델(미국)로 처리</p>
                <p>• 알려진 곡 확인: AcoustID (소리 지문만 전송, 음원 파일 미전송)</p>
                <p>• 간편 로그인: 카카오(대한민국), Google(미국) — 선택 시</p>
                <h4 className="font-bold text-zinc-900 dark:text-white text-sm">3. 보유 및 파기</h4>
                <p>• 교육 과정 프로젝트 운영 서비스로, <strong>{SERVICE_END_DATE} 서비스 종료일</strong>에 모든 음원·곡 정보·결과물·공개 곡·로그인 데이터가 일괄 영구 삭제됩니다.</p>
                <p className="text-[11px] text-zinc-400">개인정보 보호책임자: 이원일 · 문의: admin@201.n-e.kr</p>
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
                <a
                  href="https://api.201.n-e.kr/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-semibold"
                >
                  웹페이지 공식 원문(v1.6)으로 보기 ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(false)}
                  className="btn-primary text-xs px-5 py-2"
                >
                  확인 완료
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
