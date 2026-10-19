import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image,
  Video,
  FileText,
  Check,
  Copy,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Upload,
  Maximize2,
  Download,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { api, toFileUrl, localJobsStorage } from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';

const cleanPitchBody = (text) => {
  if (!text) return '';
  let cleaned = text;
  // 은희님 피드백: [이름] / [아티스트명] 자리표시자 제거 및 [음원 링크] -> '없음' 처리
  cleaned = cleaned.replace(/\[\s*(이름|아티스트명|성함|활동명)\s*\]\s*\n?/g, '');
  cleaned = cleaned.replace(/\[\s*(음원\s*링크|음원링크|링크|미리듣기\s*링크)\s*\]/g, '없음');
  return cleaned;
};

const PROMO_TABS = [
  { id: 'instagram', label: '인스타그램' },
  { id: 'tiktok', label: '틱톡' },
  { id: 'threads', label: '스레드' },
  { id: 'x', label: 'X' },
  { id: 'pitch', label: '피칭 메일' },
  { id: 'editorial', label: '에디토리얼' },
];

export default function Step2Visual({ jobData, setJobData, onNextStep, onPrevStep }) {
  const isDemo = !jobData?.jobId || String(jobData.jobId).startsWith('demo');
  const [selectedCover, setSelectedCover] = useState(jobData?.selectedCover || 0);
  const [selectedVersionMap, setSelectedVersionMap] = useState({}); // { [item_id]: v }
  const [loadingAssets, setLoadingAssets] = useState(!isDemo);
  const [assets, setAssets] = useState(null); // 서버 Package
  const [jobStage, setJobStage] = useState(jobData?.stage || null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [error, setError] = useState(null);
  const [selecting, setSelecting] = useState(false);

  // D4: 커버 다시 만들기 / 내 커버 올리기 / 전체화면 보기
  const [coverRegenReq, setCoverRegenReq] = useState('');
  const [regeneratingCover, setRegeneratingCover] = useState(false);
  const [uploadingOwn, setUploadingOwn] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const ownFileInputRef = useRef(null);

  // D4: 영상 탭 (canvas | short) — 미영님 피드백: 커버 선택 시 Spotify Canvas가 기본으로 자동 실행되도록 canvas를 기본값으로 설정
  const [videoTab, setVideoTab] = useState('canvas');

  // D4: 채널별 홍보 세트 탭 & 더 보기 펼침 & 글 다시 만들기
  const [promoTab, setPromoTab] = useState('instagram');
  const [pitchLang, setPitchLang] = useState('ko');
  const [expandedCopy, setExpandedCopy] = useState(false);
  const [copyRegenReq, setCopyRegenReq] = useState('');
  const [regeneratingCopy, setRegeneratingCopy] = useState(false);
  const [retryingJob, setRetryingJob] = useState(false);

  // 미영님 피드백: 홍보 글/피칭 메일 직접 편집(추가/삭제) 상태
  const [customTexts, setCustomTexts] = useState({});
  const [isEditingText, setIsEditingText] = useState({});

  const pollTimerRef = useRef(null);

  const fetchAssets = async () => {
    if (isDemo) return;
    try {
      const st = await api.getJobStatus(jobData.jobId);
      setJobStage(st.stage);
      localJobsStorage.upsert({
        job_id: jobData.jobId,
        title: jobData.title,
        artist: jobData.artist,
        stage: st.stage,
        stage_label: st.stage_label,
      });

      if (st.stage === 'failed') {
        setError(st.error?.message || '결과물을 만들지 못했어요.');
        setLoadingAssets(false);
        clearInterval(pollTimerRef.current);
        return;
      }

      if (['awaiting_cover', 'rendering', 'done'].includes(st.stage)) {
        const pkg = await api.getPackage(jobData.jobId);
        setAssets(pkg);
        setLoadingAssets(false);

        const selIdx = pkg.covers.findIndex((c) => c.selected);
        if (selIdx >= 0) {
          setSelectedCover(selIdx);
          const selItem = pkg.covers[selIdx];
          if (selItem.selected_v) {
            setSelectedVersionMap((prev) => ({ ...prev, [selItem.item_id]: selItem.selected_v }));
          }
        }

        // awaiting_cover 일 때 아직 هیچ 커버도 선택 안 되어 있으면 첫 번째 커버로 바로 렌더링을 걸어 두어 영상을 바로 볼 수 있게 한다
        if (st.stage === 'awaiting_cover' && selIdx < 0 && pkg.covers.length > 0 && !selecting) {
          const first = pkg.covers[0];
          const lastV = first.versions[first.versions.length - 1]?.v;
          api
            .selectCover(jobData.jobId, first.item_id, lastV)
            .then((nextPkg) => {
              setAssets(nextPkg);
              setJobStage('rendering');
            })
            .catch(() => {});
        }

        if (st.stage === 'done') {
          clearInterval(pollTimerRef.current);
        }
      } else {
        setLoadingAssets(true);
      }
    } catch (err) {
      setError(err.message);
      setLoadingAssets(false);
      clearInterval(pollTimerRef.current);
    }
  };

  useEffect(() => {
    if (isDemo) return;
    fetchAssets();
    pollTimerRef.current = setInterval(fetchAssets, 3000);
    return () => clearInterval(pollTimerRef.current);
  }, [jobData?.jobId]);

  const startPolling = () => {
    clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(fetchAssets, 3000);
  };

  const handleCopy = async (text, key, usageEvent = null, usageTarget = null) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      if (usageEvent) api.logUsage(jobData?.jobId, usageEvent, usageTarget);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      setError('클립보드에 복사하지 못했어요. 브라우저 복사 권한을 확인해 주세요.');
    }
  };

  const latestVersionObj = (c) => c?.versions?.[c.versions.length - 1];

  const versionObjOf = (c) => {
    if (!c?.versions?.length) return null;
    const chosenV = selectedVersionMap[c.item_id] ?? c.selected_v;
    if (chosenV) {
      const found = c.versions.find((x) => x.v === chosenV);
      if (found) return found;
    }
    return latestVersionObj(c);
  };

  const coverUrlOf = (c) => {
    const vObj = versionObjOf(c);
    return vObj?.url_title || vObj?.url || '';
  };

  // 커버 썸네일이나 버전을 클릭했을 때 선택 + 영상 렌더링 시작
  const handleSelectCoverItem = async (idx, explicitV = null) => {
    setSelectedCover(idx);
    setVideoTab('canvas'); // 미영님 피드백: 커버 고르면 Spotify Canvas 영상으로 자동 전환
    const c = assets?.covers?.[idx];
    if (!c) return;
    const targetV = explicitV ?? selectedVersionMap[c.item_id] ?? latestVersionObj(c)?.v;
    setSelectedVersionMap((prev) => ({ ...prev, [c.item_id]: targetV }));
    if (isDemo) return;

    setSelecting(true);
    setError(null);
    try {
      const pkg = await api.selectCover(jobData.jobId, c.item_id, targetV);
      setAssets(pkg);
      setJobStage(pkg.stage);
      startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setSelecting(false);
    }
  };

  // D4: 이 커버 다시 만들기 (남은 N/3)
  const handleRegenerateCover = async () => {
    const c = assets?.covers?.[selectedCover];
    if (!c || isDemo) return;
    setRegeneratingCover(true);
    setError(null);
    try {
      const pkg = await api.regenerateItem(jobData.jobId, c.item_id, coverRegenReq.trim() || null);
      setAssets(pkg);
      setCoverRegenReq('');
      const updatedItem = pkg.covers[selectedCover];
      const newestV = latestVersionObj(updatedItem)?.v;
      if (newestV) {
        setSelectedVersionMap((prev) => ({ ...prev, [c.item_id]: newestV }));
        // 새로 만든 커버 버전으로 바로 선택·렌더링 갱신
        const pkg2 = await api.selectCover(jobData.jobId, c.item_id, newestV);
        setAssets(pkg2);
        startPolling();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRegeneratingCover(false);
    }
  };

  // D4: 내 커버 올리기 (cover-own) - 클라이언트 단 1000px 사전 체크 및 업스케일 안내
  const handleUploadOwnCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f || isDemo) return;
    setError(null);

    // 이미지 해상도 사전 검사
    const checkDimensions = (file) =>
      new Promise((resolve, reject) => {
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('이미지 파일을 읽을 수 없어요.'));
        };
        img.src = objectUrl;
      });

    try {
      const { width: w, height: h } = await checkDimensions(f);
      if (w < 1000 || h < 1000) {
        alert(
          `이미지 해상도가 너무 낮아요 (가로/세로 최소 1000px 이상이어야 해요. 현재: ${w}×${h}px).\n유통사 규격(3000×3000px)에 맞는 더 큰 이미지를 올려주세요.`
        );
        e.target.value = '';
        return;
      }

      if (w < 3000 || h < 3000) {
        alert(
          `현재 이미지 해상도(${w}×${h}px)는 3000px로 자동 업스케일되어 유통사에 등록됩니다.\n선명한 고화질을 원하시면 3000×3000px 이상의 이미지를 권장해요.`
        );
      }

      setUploadingOwn(true);
      const pkg = await api.uploadOwnCover(jobData.jobId, f);
      setAssets(pkg);
      const ownIdx = pkg.covers.findIndex((c) => c.item_id === 'cover-own');
      if (ownIdx >= 0) {
        await handleSelectCoverItem(ownIdx);
      }
    } catch (err) {
      setError(err.message || '커버 이미지를 올리지 못했어요.');
    } finally {
      setUploadingOwn(false);
      e.target.value = '';
    }
  };

  // D4: 홍보 글 / 피칭 메일 / 에디토리얼 다시 만들기
  const handleRegenerateCopy = async () => {
    if (isDemo) return;
    let itemId = null;
    if (['instagram', 'tiktok', 'threads', 'x'].includes(promoTab)) {
      itemId = `copy-${promoTab}`;
    } else if (promoTab === 'pitch') {
      itemId = `pitch-${pitchLang}`;
    } else if (promoTab === 'editorial') {
      itemId = 'editorial';
    }
    if (!itemId) return;

    setRegeneratingCopy(true);
    setError(null);
    try {
      const pkg = await api.regenerateItem(jobData.jobId, itemId, copyRegenReq.trim() || null);
      setAssets(pkg);
      setCopyRegenReq('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRegeneratingCopy(false);
    }
  };

  const handleRetryFailedJob = async () => {
    if (isDemo || !jobData?.jobId) return;
    setRetryingJob(true);
    setError(null);
    setJobStage('generating');
    try {
      await api.retryJob(jobData.jobId);
      setLoadingAssets(true);
      setTimeout(() => {
        startPolling();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRetryingJob(false);
    }
  };

  const handleProceed = async () => {
    if (!isDemo) {
      const c = assets?.covers?.[selectedCover];
      if (!c) return setError('커버가 아직 준비되지 않았어요.');
      const chosenV = selectedVersionMap[c.item_id] ?? latestVersionObj(c)?.v;
      if (!c.selected || c.selected_v !== chosenV) {
        setSelecting(true);
        setError(null);
        try {
          await api.selectCover(jobData.jobId, c.item_id, chosenV);
        } catch (err) {
          setSelecting(false);
          return setError(err.message);
        }
        setSelecting(false);
      }
    }
    setJobData((prev) => ({
      ...prev,
      selectedCover,
      coverUrl: assets?.covers?.[selectedCover] ? coverUrlOf(assets.covers[selectedCover]) : null,
    }));
    onNextStep();
  };

  // 커버 목록 준비
  const demoCovers = [
    {
      item_id: 'cover-1',
      direction_id: 'c1',
      regenerate_remaining: 3,
      versions: [{ v: 1, url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80' }],
    },
    {
      item_id: 'cover-2',
      direction_id: 'c2',
      regenerate_remaining: 3,
      versions: [{ v: 1, url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80' }],
    },
    {
      item_id: 'cover-3',
      direction_id: 'c3',
      regenerate_remaining: 3,
      versions: [{ v: 1, url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80' }],
    },
  ];

  const coverItems = assets?.covers?.length ? assets.covers : isDemo ? demoCovers : [];
  const activeCoverItem = coverItems[selectedCover] || coverItems[0] || null;
  const activeCoverUrl = activeCoverItem ? toFileUrl(coverUrlOf(activeCoverItem)) : '';

  // 영상 준비 (canvas / short)
  const canvasVideo =
    assets?.videos?.find((v) => v.kind === 'canvas') ||
    (isDemo ? { kind: 'canvas', url: 'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-1610-large.mp4' } : null);
  const shortVideo =
    assets?.videos?.find((v) => v.kind === 'short') ||
    (isDemo ? { kind: 'short', url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4' } : null);
  const activeVideoObj = videoTab === 'canvas' ? canvasVideo : shortVideo;
  const activeVideoUrl = activeVideoObj ? toFileUrl(activeVideoObj.url) : null;
  const rendering = jobStage === 'rendering' || assets?.stage === 'rendering';

  // 현재 탭의 홍보 글 데이터
  const activeChannel = ['instagram', 'tiktok', 'threads', 'x'].includes(promoTab)
    ? assets?.channels?.[promoTab] || (isDemo
        ? {
            text: `출발선에 선 모든 여름에게. ${jobData?.artist || '201'}의 새 싱글 '${jobData?.title || '초여름 활주로'}'가 발매됩니다.\n128BPM 기타 리프 위로 이륙 직전의 설렘을 담았어요. 활주로 끝에서 들리는 바람 소리까지 꼭 이어폰으로 들어 주세요.\n프로필 링크에서 미리 저장할 수 있어요!`,
            hashtags: ['#초여름활주로', '#인디팝', '#신곡추천', '#싱어송라이터'],
            hook: promoTab === 'tiktok' ? '이어폰 끼고 3초만 들어보세요 🎧' : null,
            regenerate_remaining: 3,
          }
        : null)
    : null;

  const activePitch =
    promoTab === 'pitch'
      ? assets?.pitch?.[pitchLang] ||
        (isDemo
          ? {
              subject:
                pitchLang === 'ko'
                  ? `[플레이리스트 피칭] ${jobData?.artist || '201'} — '${jobData?.title || '초여름 활주로'}' (인디팝)`
                  : `[Playlist Pitch] ${jobData?.artist || '201'} — '${jobData?.title || 'Early Summer Runway'}'`,
              body:
                pitchLang === 'ko'
                  ? `안녕하세요, 에디터님.\n싱어송라이터 ${jobData?.artist || '201'}의 새 싱글 '${jobData?.title || '초여름 활주로'}'를 소개합니다.\n128BPM의 청량한 기타 리프와 후렴의 시원한 질주감이 드라이브·초여름 플레이리스트에 잘 어울리는 곡입니다.`
                  : `Hi Editor,\nIntroducing '${jobData?.title || 'Early Summer Runway'}' by indie artist ${jobData?.artist || '201'}.\nAn upbeat 128 BPM indie/city-pop track capturing the excitement right before takeoff.`,
              regenerate_remaining: 3,
            }
          : null)
      : null;

  const activeEditorial =
    promoTab === 'editorial'
      ? assets?.editorial ||
        (isDemo
          ? {
              spotify_ko:
                '128BPM의 밝은 일렉트릭 기타 리프로 시작해 후렴에서 풀밴드 사운드로 터져 나오는 시티팝·인디팝 트랙입니다. 출발 직전 활주로에 선 설렘을 청량한 보컬로 풀어냈습니다.',
              spotify_en:
                'An upbeat 128 BPM indie/city-pop track driven by bright guitar riffs and an uplifting full-band chorus, capturing the thrill of standing on a summer runway right before takeoff.',
              dsp_intro_ko: `출발선에 선 모든 여름에게 건네는 노래, ${jobData?.artist || '201'}의 새 싱글 [${jobData?.title || '초여름 활주로'}].\n\n[Credit]\n작사/작곡/편곡: ${jobData?.songwriter || '이원일'}`,
              tags: {
                genres: ['Indie Pop', 'City Pop'],
                moods: ['Uplifting', 'Breezy', 'Energetic'],
                instruments: ['Electric Guitar', 'Synthesizer', 'Drums', 'Bass'],
              },
              regenerate_remaining: 3,
            }
          : null)
      : null;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 2. 비주얼 에셋 & 채널별 홍보 스튜디오
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          3000×3000px 앨범 커버를 고르고, 숏폼·Canvas 영상과 6개 채널별 홍보 글을 확인하세요.
        </p>
      </div>

      {/* 은희님 피드백: 에러 및 다시 시도 모달 팝업 (어느 위치에서든 한 화면에 보이고 닫기 가능) */}
      <AnimatePresence>
        {error && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md glass-panel rounded-2xl p-6 bg-white dark:bg-[#18181b] border border-rose-200 dark:border-rose-500/30 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                      {jobStage === 'failed' ? '작업 처리 오류' : '안내'}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {jobStage === 'failed' ? '에셋 생성 중 문제가 발생했습니다.' : '요청을 처리하는 중 문제가 발생했어요.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  title="닫기"
                >
                  ✕
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs sm:text-sm text-rose-800 dark:text-rose-200 leading-relaxed">
                {error}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="btn-secondary text-xs px-4 py-2 font-bold"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={jobStage === 'failed' ? handleRetryFailedJob : () => { setError(null); fetchAssets(); }}
                  disabled={retryingJob || loadingAssets}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-md font-bold bg-rose-600 hover:bg-rose-500 text-white"
                >
                  {retryingJob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>다시 시도</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={jobStage === 'failed' ? handleRetryFailedJob : fetchAssets}
            disabled={retryingJob || loadingAssets}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0 shadow-sm transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>다시 시도</span>
          </button>
        </div>
      )}

      {loadingAssets && (
        <div className="p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span>AI가 커버 3종과 6개 채널 홍보 글을 만들고 있어요 (약 1~2분). 완성되면 자동으로 나타나요.</span>
        </div>
      )}

      {/* Top Grid: Large Cover & Controls (Left 7) + Video Tabs (Right 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Large Selected Cover + 3 Thumbnails + Regenerate + Own Upload (7 cols) */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-7 space-y-5 border border-zinc-200/80 dark:border-white/10 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200/80 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <h3 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Image className="w-5 h-5 text-indigo-500" />
                <span>1. 앨범 커버 아트워크 (Cover Artwork)</span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                3000 × 3000px · sRGB 무손실
              </span>
              {activeCoverItem?.item_id !== 'cover-own' && activeCoverItem?.regenerate_remaining != null && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  남은 재생성: {activeCoverItem.regenerate_remaining}/3회
                </span>
              )}
            </div>
          </div>

          {/* Large Hero Preview of Selected Cover */}
          {activeCoverUrl ? (
            <div
              onClick={() => setLightboxOpen(true)}
              className="relative aspect-square w-full max-w-md mx-auto rounded-2xl overflow-hidden border-2 border-indigo-500/70 shadow-2xl shadow-indigo-950/30 cursor-zoom-in group bg-zinc-950"
            >
              <img src={activeCoverUrl} alt="Selected Cover" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              
              {/* Top Badge: Selection State */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>
                  {activeCoverItem?.item_id === 'cover-own'
                    ? '내 업로드 커버'
                    : `메인 선택: 후보 ${selectedCover + 1}`}
                </span>
                {activeCoverItem?.versions?.length > 1 && (
                  <span className="text-indigo-300 font-bold">· v{versionObjOf(activeCoverItem)?.v}</span>
                )}
              </div>

              {/* Bottom Right: Zoom Badge */}
              <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 opacity-90 group-hover:opacity-100 group-hover:bg-black/90 transition-all shadow-lg">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-300" />
                <span>크게 보기 (원본 확인)</span>
              </div>
            </div>
          ) : (
            <div className="aspect-square w-full max-w-md mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-xs text-zinc-400">
              커버 이미지를 불러오는 중...
            </div>
          )}

          {/* Own Cover Information Banner (source_size & note from server) */}
          {activeCoverItem?.item_id === 'cover-own' && (
            <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-xs text-sky-950 dark:text-sky-200 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sky-800 dark:text-sky-300">
                <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                <span>직접 올린 커버 이미지가 적용되었습니다</span>
              </div>
              {versionObjOf(activeCoverItem)?.source_size && (
                <p className="text-zinc-600 dark:text-zinc-300 pl-6">
                  📐 원본 해상도:{' '}
                  <strong className="text-zinc-900 dark:text-white font-mono">
                    {versionObjOf(activeCoverItem).source_size[0]} × {versionObjOf(activeCoverItem).source_size[1]}px
                  </strong>{' '}
                  → 유통 규격:{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400 font-mono">3000 × 3000px</strong>
                </p>
              )}
              {versionObjOf(activeCoverItem)?.note && (
                <p className="text-zinc-600 dark:text-zinc-300 pl-6">
                  💡 {versionObjOf(activeCoverItem).note}
                </p>
              )}
            </div>
          )}

          {/* Thumbnails Row (3~4 covers with visual contrast) */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
              후보 중에서 마음에 드는 커버를 클릭하세요:
            </span>
            {coverItems.length > 0 && (
              <div className={`grid gap-3 ${coverItems.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {coverItems.map((c, idx) => {
                  const isSelected = selectedCover === idx;
                  const thumbUrl = toFileUrl(coverUrlOf(c));
                  return (
                    <div key={c.item_id} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectCoverItem(idx)}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all group w-full ${
                          isSelected
                            ? 'border-indigo-500 ring-4 ring-indigo-500/25 shadow-lg scale-[1.02]'
                            : 'border-zinc-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:border-zinc-400 dark:hover:border-white/30'
                        }`}
                      >
                        <img src={thumbUrl} alt={c.item_id} className="w-full h-full object-cover" />
                        <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[11px] font-extrabold ${
                          isSelected ? 'bg-indigo-600 text-white shadow' : 'bg-black/70 text-white'
                        }`}>
                          {c.item_id === 'cover-own' ? '내 커버' : `후보 ${idx + 1}`}
                        </span>
                        {isSelected && (
                          <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                      <div className="text-center">
                        <span className={`text-[11px] font-medium leading-tight block ${
                          isSelected ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {c.item_id === 'cover-own'
                            ? '내 커버'
                            : `후보 ${idx + 1} · 남은 재시도 ${c.regenerate_remaining ?? 3}/3회`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Version chips + Regenerate button + Upload Own Cover button */}
          <div className="space-y-3 pt-3 border-t border-zinc-200/80 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {activeCoverItem?.versions?.length > 1 && (
                  <div className="flex items-center gap-1 mr-2">
                    <span className="text-xs font-bold text-zinc-500">버전:</span>
                    {activeCoverItem.versions.map((ver) => {
                      const isVerOn = versionObjOf(activeCoverItem)?.v === ver.v;
                      return (
                        <button
                          key={ver.v}
                          type="button"
                          onClick={() => handleSelectCoverItem(selectedCover, ver.v)}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                            isVerOn
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          v{ver.v}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeCoverItem?.item_id !== 'cover-own' && (
                  <button
                    type="button"
                    onClick={handleRegenerateCover}
                    disabled={
                      regeneratingCover ||
                      isDemo ||
                      (activeCoverItem?.regenerate_remaining != null && activeCoverItem.regenerate_remaining <= 0)
                    }
                    className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 disabled:opacity-45 shadow-sm"
                  >
                    {regeneratingCover ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                    <span className="font-bold">↻ 이 커버 다시 만들기</span>
                  </button>
                )}

                <input
                  ref={ownFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleUploadOwnCover}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => ownFileInputRef.current?.click()}
                  disabled={uploadingOwn || isDemo}
                  className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 disabled:opacity-45 shadow-sm"
                >
                  {uploadingOwn ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" /> : <Upload className="w-3.5 h-3.5 text-sky-500" />}
                  <span className="font-bold">⬆ 내 커버 이미지 올리기</span>
                </button>
              </div>
            </div>

            {activeCoverItem?.item_id !== 'cover-own' && (
              <div className="relative">
                <input
                  type="text"
                  value={coverRegenReq}
                  onChange={(e) => setCoverRegenReq(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegenerateCover()}
                  placeholder="다시 만들 때 요청사항 (선택): 예) 더 어둡게, 텍스트 없이, 필름 그레인 질감으로"
                  className="w-full bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Video Tabs [Canvas · 8초 반복 | 숏폼 · 15초 ♪] (5 cols) */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-5 border border-zinc-200/80 dark:border-white/10 shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-white/10">
              <h3 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-500" />
                <span>2. 모션 비디오 에셋</span>
              </h3>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                자동 렌더링
              </span>
            </div>

            {/* Segmented Control Tabs */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-white/5">
              <button
                type="button"
                onClick={() => setVideoTab('canvas')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  videoTab === 'canvas'
                    ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Canvas · 8초 루프
              </button>
              <button
                type="button"
                onClick={() => setVideoTab('short')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  videoTab === 'short'
                    ? 'bg-white dark:bg-[#121215] text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                숏폼 · 15초 ♪
              </button>
            </div>

            {/* 9:16 Video Player Box - Styled like modern smartphone screen */}
            <div className="rounded-2xl overflow-hidden aspect-[9/16] max-h-84 mx-auto bg-zinc-950 flex items-center justify-center border-2 border-zinc-800 relative shadow-2xl">
              {activeVideoUrl ? (
                <video
                  key={activeVideoUrl}
                  src={activeVideoUrl}
                  autoPlay={videoTab === 'canvas'}
                  loop={videoTab === 'canvas'}
                  muted={videoTab === 'canvas'}
                  controls={videoTab === 'short'}
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-lg">
                    {rendering || selecting ? (
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                    ) : (
                      <Video className="w-6 h-6" />
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-200">
                    {rendering || selecting
                      ? '영상을 렌더링하고 있어요 (약 30~40초)'
                      : '커버를 선택하면 영상이 즉시 자동 생성돼요'}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
                    {videoTab === 'short'
                      ? '선택된 15초 하이라이트 음원이 합성된 인스타 릴스·틱톡·유튜브 쇼츠 전용 영상입니다.'
                      : 'Spotify 모바일 앱 재생 화면 배경에 무한 반복되는 8초 Canvas 루프 영상입니다.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 text-center pt-3 border-t border-zinc-200/80 dark:border-white/10">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {videoTab === 'short'
                ? '릴스·틱톡·쇼츠 규격 (9:16 MP4 · 1080×1920 · 15초)'
                : 'Spotify Canvas 규격 (9:16 MP4 · 8초 무음 루프)'}
            </p>
            {activeVideoUrl ? (
              <a
                href={activeVideoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs px-5 py-2.5 inline-flex items-center gap-2 shadow-sm font-bold"
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                <span>이 영상 다운로드</span>
              </a>
            ) : (
              <span className="inline-block text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/25 text-indigo-600 dark:text-indigo-300 font-bold">
                ✨ 4단계 최종 ZIP 패키지에도 자동 수록됩니다
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Card: 채널별 홍보 세트 (6개 탭) */}
      <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-6 border border-zinc-200/80 dark:border-white/10 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h3 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <span>3. 채널별 맞춤 홍보 카피 & 피칭 레터 (Promo Studio)</span>
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              선택한 앨범 커버와 A&R 분석 콘셉트에 맞게 자동 작성된 채널별 카피입니다. 바로 복사하거나 직접 수정하세요.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            6개 플랫폼 최적화
          </span>
        </div>

        {/* 6 Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {PROMO_TABS.map((t) => {
            const on = promoTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPromoTab(t.id);
                  setExpandedCopy(false);
                }}
                className={`px-4 py-2 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-all ${
                  on
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 scale-[1.02]'
                    : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content 1: SNS 4개 채널 (instagram / tiktok / threads / x) */}
        {['instagram', 'tiktok', 'threads', 'x'].includes(promoTab) && (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
            <div className="sm:col-span-3 max-w-[140px]">
              {activeCoverUrl && (
                <img
                  src={
                    assets?.channels?.[promoTab]?.images
                      ? toFileUrl(Object.values(assets.channels[promoTab].images)[0])
                      : activeCoverUrl
                  }
                  alt={promoTab}
                  className="w-full aspect-square object-cover rounded-xl border border-zinc-200 dark:border-white/10 shadow-sm"
                />
              )}
            </div>

            <div className="sm:col-span-9 space-y-3 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500">
                  {PROMO_TABS.find((x) => x.id === promoTab)?.label} 홍보 본문
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const tabKey = promoTab;
                      const isEditing = Boolean(isEditingText[tabKey]);
                      if (!isEditing && customTexts[tabKey] === undefined) {
                        setCustomTexts((prev) => ({ ...prev, [tabKey]: activeChannel?.text || '' }));
                      }
                      setIsEditingText((prev) => ({ ...prev, [tabKey]: !isEditing }));
                    }}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <span>{isEditingText[promoTab] ? '수정 완료 ✓' : '✏️ 직접 수정'}</span>
                  </button>

                  {copiedKey === `body-${promoTab}` && (
                    <span className="px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      복사했어요 ✓
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy = customTexts[promoTab] !== undefined ? customTexts[promoTab] : (activeChannel?.text || '');
                      handleCopy(textToCopy, `body-${promoTab}`, 'copied_channel', promoTab);
                    }}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shadow-sm"
                  >
                    <Copy className="w-3 h-3" />
                    <span>본문 복사</span>
                  </button>
                </div>
              </div>

              {activeChannel?.hook && (
                <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 text-xs">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 mr-1.5">영상 위 훅(Hook):</span>
                  <span className="text-zinc-800 dark:text-zinc-200">{activeChannel.hook}</span>
                </div>
              )}

              {/* 스크롤 가능한 본문 및 인라인 수정 박스 (미영님 피드백 반영) */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 space-y-2">
                {isEditingText[promoTab] ? (
                  <textarea
                    rows={6}
                    value={customTexts[promoTab] !== undefined ? customTexts[promoTab] : (activeChannel?.text || '')}
                    onChange={(e) => setCustomTexts({ ...customTexts, [promoTab]: e.target.value })}
                    className="w-full bg-white dark:bg-[#18181b] border border-indigo-300 dark:border-indigo-500/50 rounded-lg p-3 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed resize-y"
                    placeholder="홍보 글을 자유롭게 수정해 보세요."
                  />
                ) : (
                  <div className="max-h-60 overflow-y-auto pr-1">
                    <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-line">
                      {customTexts[promoTab] !== undefined ? customTexts[promoTab] : (activeChannel?.text || '홍보 글을 불러오는 중이에요...')}
                    </p>
                  </div>
                )}
              </div>

              {/* Hashtags */}
              {activeChannel?.hashtags?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeChannel.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-medium"
                    >
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        activeChannel.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '),
                        `tags-${promoTab}`,
                        'copied_channel',
                        `${promoTab}_tags`
                      )
                    }
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:bg-zinc-50 text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>해시태그 복사</span>
                  </button>
                  {copiedKey === `tags-${promoTab}` && (
                    <span className="px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      복사했어요 ✓
                    </span>
                  )}
                </div>
              )}

              {/* Regenerate copy */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <input
                  type="text"
                  value={copyRegenReq}
                  onChange={(e) => setCopyRegenReq(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegenerateCopy()}
                  placeholder="이 글 다시 만들 때 한 줄 요청 (예: 반말 말고 존댓말로, 더 담백하게)"
                  className="flex-1 min-w-[200px] bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleRegenerateCopy}
                  disabled={regeneratingCopy || isDemo}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {regeneratingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>↻ 이 글 다시 만들기</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: 피칭 메일 (한국어 / 영어) */}
        {promoTab === 'pitch' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-white/10 overflow-hidden">
                {[
                  ['ko', '한국어 (국내 큐레이터·블로그·라디오)'],
                  ['en', 'English (해외 플레이리스트 큐레이터)'],
                ].map(([lang, label]) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPitchLang(lang)}
                    className={`px-3 py-1.5 text-xs font-bold ${
                      pitchLang === lang
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pitchKey = `pitch_${pitchLang}`;
                    const isEditing = Boolean(isEditingText[pitchKey]);
                    if (!isEditing && customTexts[pitchKey] === undefined) {
                      setCustomTexts((prev) => ({ ...prev, [pitchKey]: cleanPitchBody(activePitch?.body || '') }));
                    }
                    setIsEditingText((prev) => ({ ...prev, [pitchKey]: !isEditing }));
                  }}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 flex items-center gap-1 shadow-sm transition-colors"
                >
                  <span>{isEditingText[`pitch_${pitchLang}`] ? '수정 완료 ✓' : '✏️ 직접 수정'}</span>
                </button>

                {copiedKey === `pitch-${pitchLang}` && (
                  <span className="px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                    복사했어요 ✓
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const pitchKey = `pitch_${pitchLang}`;
                    const bodyToCopy = customTexts[pitchKey] !== undefined ? customTexts[pitchKey] : cleanPitchBody(activePitch?.body || '');
                    handleCopy(
                      `${activePitch?.subject || ''}\n\n${bodyToCopy}`.trim(),
                      `pitch-${pitchLang}`,
                      'copied_pitch',
                      pitchLang
                    );
                  }}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shadow-sm"
                >
                  <Copy className="w-3 h-3" />
                  <span>제목+본문 복사</span>
                </button>
              </div>
            </div>

            {/* 스크롤 가능한 피칭 메일 본문 및 인라인 수정 박스 */}
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 space-y-2">
              <p className="text-xs font-bold text-zinc-900 dark:text-white">
                제목: {activePitch?.subject || '-'}
              </p>
              {isEditingText[`pitch_${pitchLang}`] ? (
                <textarea
                  rows={8}
                  value={customTexts[`pitch_${pitchLang}`] !== undefined ? customTexts[`pitch_${pitchLang}`] : cleanPitchBody(activePitch?.body || '')}
                  onChange={(e) => setCustomTexts({ ...customTexts, [`pitch_${pitchLang}`]: e.target.value })}
                  className="w-full bg-white dark:bg-[#18181b] border border-indigo-300 dark:border-indigo-500/50 rounded-lg p-3 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed resize-y"
                  placeholder="피칭 메일 내용을 자유롭게 수정해 보세요."
                />
              ) : (
                <div className="max-h-64 overflow-y-auto pr-1">
                  <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                    {customTexts[`pitch_${pitchLang}`] !== undefined ? customTexts[`pitch_${pitchLang}`] : (cleanPitchBody(activePitch?.body) || '피칭 메일을 불러오는 중이에요...')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={copyRegenReq}
                onChange={(e) => setCopyRegenReq(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegenerateCopy()}
                placeholder="피칭 메일 다시 만들 때 한 줄 요청 (예: 라이브 클럽 공연 이력을 강조해 줘)"
                className="flex-1 min-w-[200px] bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleRegenerateCopy}
                disabled={regeneratingCopy || isDemo}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                {regeneratingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>↻ 이 메일 다시 만들기</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content 3: 에디토리얼 (Spotify 피칭 & 국내 음원 사이트 소개글) */}
        {promoTab === 'editorial' && (
          <div className="space-y-4">
            {activeEditorial ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Spotify 에디토리얼 피칭 (한국어 · 500자 이내)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(activeEditorial.spotify_ko, 'ed-ko', 'copied_editorial', 'spotify_ko')
                        }
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedKey === 'ed-ko' ? '복사했어요 ✓' : '복사'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                      {activeEditorial.spotify_ko}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Spotify Editorial Pitch (English · ≤500 chars)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(activeEditorial.spotify_en, 'ed-en', 'copied_editorial', 'spotify_en')
                        }
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedKey === 'ed-en' ? '복사했어요 ✓' : '복사'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                      {activeEditorial.spotify_en}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      국내 음원 사이트(멜론·지니·FLO) 앨범 소개글 초안
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(activeEditorial.dsp_intro_ko, 'ed-dsp', 'copied_editorial', 'dsp_intro_ko')
                      }
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === 'ed-dsp' ? '복사했어요 ✓' : '복사'}</span>
                    </button>
                  </div>
                  <p
                    className={`text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line ${
                      expandedCopy ? '' : 'line-clamp-4'
                    }`}
                  >
                    {activeEditorial.dsp_intro_ko}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedCopy((v) => !v)}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
                  >
                    <span>{expandedCopy ? '접기' : '더 보기'}</span>
                    {expandedCopy ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {activeEditorial.tags && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-zinc-500">Spotify 추천 태그:</span>
                    {[
                      ...(activeEditorial.tags.genres || []),
                      ...(activeEditorial.tags.moods || []),
                      ...(activeEditorial.tags.instruments || []),
                    ].map((t, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-500 py-4">
                아직 에디토리얼 피칭 글이 없어요. 아래 버튼을 누르면 바로 만들어 드려요.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={copyRegenReq}
                onChange={(e) => setCopyRegenReq(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegenerateCopy()}
                placeholder="에디토리얼 글 요청 한 줄 (선택)"
                className="flex-1 min-w-[200px] bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleRegenerateCopy}
                disabled={regeneratingCopy || isDemo}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                {regeneratingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>↻ 에디토리얼 글 {activeEditorial ? '다시 만들기' : '만들기'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Actions (D4: 이전 (분석 결과·곡 정보)) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200/80 dark:border-white/10">
        <button
          type="button"
          onClick={onPrevStep}
          className="btn-secondary text-sm px-6 py-3 flex items-center gap-2 shadow-sm font-bold w-full sm:w-auto justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
          <span>이전 (곡 정보 & A&R 콘셉트)</span>
        </button>

        <button
          type="button"
          onClick={handleProceed}
          disabled={selecting || (!isDemo && !coverItems.length)}
          className="btn-primary text-base font-extrabold px-9 py-3.5 flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-500/25 disabled:opacity-50 w-full sm:w-auto"
        >
          {selecting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-indigo-200" />
          )}
          <span>선택한 커버로 유통사 규격 검사하기 (Step 3)</span>
          <ArrowRight className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Lightbox Modal: 커버 크게 보기 & 버전 비교 */}
      <AnimatePresence>
        {lightboxOpen && activeCoverItem && (
          <div
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl rounded-2xl p-4 sm:p-6 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-900 dark:text-white">
                  {activeCoverItem.item_id === 'cover-own' ? '내 커버 이미지' : `커버 후보 ${selectedCover + 1}`} (3000×3000px 규격)
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="text-zinc-400 hover:text-zinc-800 dark:hover:text-white font-bold text-lg px-2"
                >
                  ✕
                </button>
              </div>
              <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                <img src={activeCoverUrl} alt="Full Cover" className="w-full h-full object-cover" />
              </div>
              {activeCoverItem.versions?.length > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-zinc-500">버전 비교:</span>
                  {activeCoverItem.versions.map((ver) => (
                    <button
                      key={ver.v}
                      type="button"
                      onClick={() => handleSelectCoverItem(selectedCover, ver.v)}
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        versionObjOf(activeCoverItem)?.v === ver.v
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      v{ver.v}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
