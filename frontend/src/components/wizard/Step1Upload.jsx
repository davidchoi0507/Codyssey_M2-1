import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Sparkles, CheckCircle2, AlertCircle, ArrowRight, Loader2, Volume2 } from 'lucide-react';
import { api } from '../../services/api';

export default function Step1Upload({ jobData, setJobData, onNextStep }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState(jobData?.title || '');
  const [artist, setArtist] = useState(jobData?.artist || '');
  const [featured, setFeatured] = useState('');
  const [songwriter, setSongwriter] = useState('');
  const [producer, setProducer] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [genreHint, setGenreHint] = useState('');
  const [consentAgree, setConsentAgree] = useState(true);

  // Status & Polling
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [noteData, setNoteData] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (jobData?.jobId) {
      pollJobStatus(jobData.jobId);
    }
  }, [jobData?.jobId]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && (dropped.type.includes('audio') || dropped.name.endsWith('.wav') || dropped.name.endsWith('.mp3'))) {
      setFile(dropped);
      if (!title) {
        setTitle(dropped.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const pollJobStatus = async (jobId) => {
    setAnalyzing(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await api.getJobStatus(jobId);
        const stage = res.stage;

        if (stage === 'note_ready' || stage === 'generating' || stage === 'awaiting_cover' || stage === 'done') {
          clearInterval(interval);
          setAnalyzing(false);
          const noteRes = await api.getNote(jobId);
          setNoteData(noteRes.note || noteRes);
        } else if (stage === 'failed') {
          clearInterval(interval);
          setAnalyzing(false);
          setError(res.error || '음원 분석에 실패했습니다.');
        }

        if (attempts > 60) {
          clearInterval(interval);
          setAnalyzing(false);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2500);
  };

  const handleStartAnalysis = async () => {
    if (!file) {
      setError('음원 파일(.wav 또는 .mp3)을 선택해 주세요.');
      return;
    }
    if (!title.trim() || !artist.trim()) {
      setError('곡 제목과 아티스트명을 입력해 주세요.');
      return;
    }
    if (!consentAgree) {
      setError('자작곡 확인 및 가이드라인 동의가 필요합니다.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('artist', artist);
      formData.append('featured', featured);
      formData.append('songwriter', songwriter);
      formData.append('producer', producer);
      formData.append('lyrics', lyrics);
      formData.append('genre_hint', genreHint);
      formData.append('consent_version', 'v1.2');

      const res = await api.createJob(formData);
      const jobId = res.job_id || res.id;

      setJobData((prev) => ({
        ...prev,
        jobId,
        title,
        artist,
        featured,
        songwriter,
        producer,
        lyrics,
      }));

      setUploading(false);
      pollJobStatus(jobId);
    } catch (err) {
      setUploading(false);
      setError(err.message || '업로드 중 오류가 발생했습니다.');
    }
  };

  const handleLoadSample = () => {
    setTitle('Midnight Echo (한밤의 잔향)');
    setArtist('Lucid (루시드)');
    setFeatured('feat. Stella');
    setSongwriter('김루시드');
    setProducer('Echo Lab');
    setLyrics('자정의 시계탑 소리가 울리면\n길었던 하루의 기억들이 잔향처럼 흩어진다\n아무도 묻지 않는 밤의 끝에서...');
    setConsentAgree(true);
    setError(null);
    setJobData((prev) => ({
      ...prev,
      jobId: 'demo-sample-1',
      title: 'Midnight Echo (한밤의 잔향)',
      artist: 'Lucid (루시드)',
      featured: 'feat. Stella',
      songwriter: '김루시드',
      producer: 'Echo Lab',
      lyrics: '자정의 시계탑 소리가 울리면\n길었던 하루의 기억들이 잔향처럼 흩어진다',
    }));
    setNoteData({
      bpm: 98,
      genre: 'Alternative Pop / Indie',
      sound_characteristics: '선명한 808 신스 베이스와 몽환적인 리버브 기타 사운드',
      mood: '몽환적 / 새벽의 잔향과 서정성',
      emotion_flow: '차분한 어쿠스틱 피아노 도입부에서 후반부 감정 빌드업',
      concept_summary: '자정의 고요함을 닮은 공간계 사운드와 진솔한 가사가 돋보이는 곡입니다. 3000px 규격 아트워크와 Spotify Canvas 영상으로 시각적 브랜딩을 강화하면 스트리밍 노출에 매우 유리합니다.',
    });
  };

  const handleAcceptNote = async () => {
    if (!jobData?.jobId || jobData?.jobId?.toString().startsWith('demo')) {
      onNextStep();
      return;
    }
    setAccepting(true);
    try {
      await api.saveReleaseInfo(jobData.jobId, {
        title,
        artist,
        featured,
        songwriter,
        producer,
        lyrics,
      });

      await api.acceptNote(jobData.jobId);
      setAccepting(false);
      onNextStep();
    } catch (err) {
      setAccepting(false);
      setError(err.message || '노트 수락 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title Header */}
      <div className="text-center space-y-2.5">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 1. 곡 업로드 & 스마트 발매 정보 입력
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          음원 파일을 올리시면 오디오 신호 분석과 AI 청취를 통해 맞춤 A&R 콘셉트 노트를 도출합니다.
        </p>

        {/* Quick Demo Sample Button */}
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
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left: Audio Dropzone (5 cols) */}
        <div className="md:col-span-5 space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`glass-panel rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer border-2 border-dashed transition-all group ${
              file
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                : 'border-zinc-300 dark:border-white/10 hover:border-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,audio/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>

            <h3 className="font-bold text-base text-zinc-900 dark:text-white mb-1">
              {file ? file.name : '음원 파일 드래그 & 클릭'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px]">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(1)} MB • 준비 완료`
                : '무손실 WAV (권장) 또는 MP3 파일'}
            </p>

            {file && (
              <div className="mt-4 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>선택된 음원</span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/5 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-200 font-semibold">
              <Volume2 className="w-4 h-4 text-sky-500" />
              <span>유통사 표준 오디오 안내</span>
            </div>
            <p>• 유통사 정식 발매에는 <b>24-bit / 48kHz WAV</b>가 가장 안전합니다.</p>
            <p>• MP3도 분석 가능하며, 3단계 검사에서 규격 적합도를 정밀 진단합니다.</p>
          </div>
        </div>

        {/* Right: Metadata Inputs (7 cols) */}
        <div className="md:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">곡 제목 (Track Title) *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: Midnight Echo"
                className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">아티스트명 (Artist Name) *</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="예: Lucid"
                className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-sm"
              />
            </div>
          </div>

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
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">작곡가 실명 (필수권장)</label>
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
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">가사 또는 곡 설명 (선택)</label>
            <textarea
              rows={3}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="가사를 입력하면 A&R 해석과 유통사 가사 형식 점검(줄바꿈, 대문자 규칙 등)에 활용됩니다."
              className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none shadow-sm"
            />
          </div>

          {/* Consent Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAgree}
              onChange={(e) => setConsentAgree(e.target.checked)}
              className="mt-0.5 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              [필수] 본 음원은 자작곡이며, 유통사 규격 사전 검수 및 AI 어시스턴트 활용 약관(v1.2)에 동의합니다.
            </span>
          </label>

          {/* Action Button: Start Analysis */}
          {!noteData && (
            <button
              onClick={handleStartAnalysis}
              disabled={uploading || analyzing}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>음원 업로드 중...</span>
                </>
              ) : analyzing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Gemini & DSP 하이브리드 오디오 분석 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>AI 분석 시작 & A&R 노트 도출</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* AI A&R Note Card */}
      <AnimatePresence>
        {noteData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel border-indigo-200 dark:border-indigo-500/40 rounded-2xl p-6 sm:p-8 space-y-6 bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900/60"
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white">AI A&R 콘셉트 노트 도출 완료</h3>
                  <p className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">오디오 신호(BPM, 에너지)와 보컬 감정선을 종합 분석한 결과입니다.</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                분석 완료 (Ready)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1 shadow-sm">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">사운드 특성 & BPM</span>
                <p className="font-bold text-base text-zinc-900 dark:text-white">
                  {noteData.bpm ? `${noteData.bpm} BPM` : 'BPM 측정 완료'} • {noteData.genre || 'Alternative Pop'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{noteData.sound_characteristics || '선명한 신스 베이스와 서정적인 멜로디 라인'}</p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1 shadow-sm">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">감정선 & 무드</span>
                <p className="font-bold text-base text-indigo-600 dark:text-indigo-400">{noteData.mood || '몽환적 / 새벽 잔향'}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{noteData.emotion_flow || '도입부의 차분함에서 후반부 고조되는 감정 빌드업'}</p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1 shadow-sm">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">추천 타깃 플레이리스트</span>
                <p className="font-bold text-base text-sky-600 dark:text-sky-400">새벽 드라이브 / 감성 인디</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">Spotify '인디 감성 충전', 멜론 '새벽 감성 믹스' 타깃</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-2 shadow-sm">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-300">A&R 디렉터 코멘트</span>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                "{noteData.concept_summary || '자정의 고요함을 닮은 공간계 사운드와 진솔한 가사가 돋보이는 곡입니다. 3000px 규격 아트워크와 Spotify Canvas 영상으로 시각적 브랜딩을 강화하면 스트리밍 노출에 매우 유리합니다.'}"
              </p>
            </div>

            {/* Accept Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleAcceptNote}
                disabled={accepting}
                className="btn-primary flex items-center gap-2 px-6 py-3 text-sm shadow-md"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>커버 생성 시작 중...</span>
                  </>
                ) : (
                  <>
                    <span>A&R 노트 수락하고 비주얼 만들기</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
