import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Sparkles, CheckCircle2, AlertCircle, ArrowRight, Loader2, Volume2 } from 'lucide-react';
import { api, CONSENT_VERSION, toFileUrl } from '../../services/api';

const ACTIVE = ['uploaded', 'analyzing'];
const NOTE_STAGES = ['note_ready', 'generating', 'awaiting_cover', 'rendering', 'done'];

/** 서버 A&R 노트(ARNote) → 이 화면 카드에 쓰는 값 */
function toCard(note) {
  return {
    bpm: Math.round(note.evidence?.bpm || 0) || null,
    key: note.evidence?.key,
    genre: note.genre_heard,
    sound_characteristics: note.evidence?.energy_change,
    mood: (note.mood_keywords || []).join(' / '),
    colors: note.colors || [],
    concept_summary: note.interpretation,
  };
}

export default function Step1Upload({ jobData, setJobData, onNextStep }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState(jobData?.title || '');
  const [artist, setArtist] = useState(jobData?.artist || '');
  const [featured, setFeatured] = useState('');
  const [songwriter, setSongwriter] = useState('');
  const [producer, setProducer] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [genre, setGenre] = useState('');
  // 동의 (서버 /studio 와 같은 항목 — 필수 3개는 미리 체크하지 않는다)
  const [consents, setConsents] = useState({ privacy: false, external_ai: false, original: false, showcase: false });
  const setConsent = (k, v) => setConsents((prev) => ({ ...prev, [k]: v }));
  const consentAgree = consents.privacy && consents.external_ai && consents.original;
  const [progress, setProgress] = useState(null); // 분석 중 진행 상태 문구

  // Status & Polling
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [noteData, setNoteData] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (jobData?.jobId && !jobData.jobId.toString().startsWith('demo')) {
      pollJobStatus(jobData.jobId);
    }
    return () => clearInterval(pollRef.current);
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

  // 분석은 1~3분 걸린다. 2.5초마다 상태를 보고 note_ready 가 되면 노트를 가져온다
  const pollJobStatus = (jobId) => {
    clearInterval(pollRef.current);
    setAnalyzing(true);
    const tick = async () => {
      try {
        const res = await api.getJobStatus(jobId);
        if (NOTE_STAGES.includes(res.stage) || (res.stage === 'failed' && res.steps?.some((x) => x.key === 'note' && x.status === 'done'))) {
          clearInterval(pollRef.current);
          const note = await api.getNote(jobId);
          setNoteData(toCard(note));
          setJobData((prev) => ({ ...prev, stage: res.stage }));
          setAnalyzing(false);
          setProgress(null);
        } else if (res.stage === 'failed') {
          clearInterval(pollRef.current);
          setAnalyzing(false);
          setProgress(null);
          setError(res.error?.message || '음원 분석에 실패했습니다.');
        } else if (ACTIVE.includes(res.stage)) {
          setProgress(res.queue_position ? `대기 ${res.queue_position}번째` : `${res.stage_label} ${Math.round((res.progress || 0) * 100)}%`);
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setAnalyzing(false);
        setError(err.message);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
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
      setError('필수 동의 세 가지에 체크해 주세요.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('artist', artist);
      formData.append('genre', genre);
      if (lyrics.trim()) formData.append('lyrics', lyrics.trim());
      formData.append('consent_privacy', consents.privacy);
      formData.append('consent_external_ai', consents.external_ai);
      formData.append('consent_original', consents.original);
      formData.append('consent_showcase', consents.showcase);
      formData.append('consent_version', CONSENT_VERSION);

      const res = await api.createJob(formData);
      const jobId = res.job_id;

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
      // jobId 가 바뀌면 위 useEffect 가 상태 확인을 시작한다
    } catch (err) {
      setUploading(false);
      setError(err.message || '업로드 중 오류가 발생했습니다.');
    }
  };

  // 체험 모드: 서버의 예시 곡으로 실제 작업을 만든다 (노트는 바로 나오고, 커버·영상·글은 실제로 만들어짐)
  const handleLoadSample = async () => {
    setError(null);
    setUploading(true);
    try {
      const { job_id: jobId } = await api.createDemoJob();
      const info = (await api.getReleaseInfo(jobId)).info;
      setTitle(info.title || '');
      setArtist(info.artist || '');
      setNoteData(null);
      setJobData((prev) => ({ ...prev, jobId, demo: true, title: info.title || '', artist: info.artist || '' }));
    } catch (err) {
      setError(err.message || '체험 모드를 시작하지 못했어요.');
    } finally {
      setUploading(false);
    }
  };

  // 수락 전에 피처링·작곡가·프로듀서·가사를 발매 정보에 넣는다 (3단계 검사·제출 준비표에 쓰임)
  const handleAcceptNote = async () => {
    if (!jobData?.jobId || jobData?.jobId?.toString().startsWith('demo')) {
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
      if (st.stage === 'note_ready' || st.stage === 'failed') await api.acceptNote(jobData.jobId);
      setJobData((prev) => ({ ...prev, featured, songwriter, producer, lyrics }));
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
            disabled={uploading || analyzing}
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 border border-indigo-200 dark:border-indigo-500/30 transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>⚡ 파일이 없으신가요? 예시 곡으로 체험해 보기</span>
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
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">장르 (선택)</label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              maxLength={50}
              placeholder="예: 인디 록, 발라드"
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

          {/* Consent Checkboxes — 서버 /studio 와 같은 문구 */}
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2">
            <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">동의 (동의서 {CONSENT_VERSION})</span>
            {[
              ['privacy', <>[필수] 만 14세 이상이에요. 개인정보 수집·이용 — 곡 정보·음원·크레딧(참여자 이름)·발매 정보·접속 IP. 유통사 제출 준비표·ZIP도 이 정보로 만들어요. 업로드 7일 뒤 자동 삭제 (<a href={toFileUrl('/privacy')} target="_blank" rel="noopener noreferrer" className="underline">개인정보처리방침</a>)</>],
              ['external_ai', '[필수] 외부 AI 전송(미국) — 음원은 Google Gemini(무료 등급, 학습에 쓰일 수 있음), 글·이미지는 코디세이 API(OpenAI 모델, 학습 미사용)로 처리'],
              ['original', '[필수] 직접 만든 곡이거나 올릴 권리가 있고, 크레딧에 넣는 참여자에게 동의를 받았어요. 규격 검사·권리 자가진단은 참고용이라 유통사 통과를 보장하지 않아요. AI 결과물은 저작권이 인정되지 않을 수 있어요'],
              ['showcase', '[선택] 결과물을 서비스 개선·발표 자료에 써도 돼요'],
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
                  <span>AI가 곡을 듣고 있어요 (1~3분){progress ? ` · ${progress}` : '...'}</span>
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
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">BPM · 키 · 장르감</span>
                <p className="font-bold text-base text-zinc-900 dark:text-white">
                  {[noteData.bpm && `${noteData.bpm} BPM`, noteData.key, noteData.genre].filter(Boolean).join(' • ')}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3">{noteData.sound_characteristics}</p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1 shadow-sm">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">무드 키워드</span>
                <p className="font-bold text-base text-indigo-600 dark:text-indigo-400">{noteData.mood}</p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1 shadow-sm">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">곡의 색 (커버·영상에 쓰여요)</span>
                <div className="flex gap-2 pt-1">
                  {(noteData.colors || []).map((c) => (
                    <span key={c} title={c} className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-white/10 shadow-sm" style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-2 shadow-sm">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-300">A&R 디렉터 코멘트</span>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                "{noteData.concept_summary}"
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
