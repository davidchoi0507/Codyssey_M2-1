import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Star, PlusCircle, Sparkles, Send, ShieldAlert } from 'lucide-react';
import { api, toFileUrl } from '../../services/api';
import SurveyPanel from '../survey/SurveyPanel';

const REPORT_REASONS = { stolen: '남의 곡을 허락 없이 올림', abuse: '욕설·비하·혐오', ad: '광고·도배', other: '기타' };

export default function CommunityFeed({ onStartNewRelease }) {
  const [tracks, setTracks] = useState([]);
  const [sort, setSort] = useState('new');
  const [loading, setLoading] = useState(true);
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const [audioObj, setAudioObj] = useState(null);

  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickArtist, setQuickArtist] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickFile, setQuickFile] = useState(null);
  const [quickUploading, setQuickUploading] = useState(false);

  const [commentInput, setCommentInput] = useState({});
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [tags, setTags] = useState([]);           // 서버가 정한 반응 태그 (GET /community/meta)
  const [notice, setNotice] = useState({});       // 곡별 안내 문구 {trackId: '...'}
  const [reportFor, setReportFor] = useState(null); // 신고 사유를 고르는 곡
  // 바로 공개: 들려줄 범위·반응 공개·AI 사용·필수 동의 (서버 /studio 와 같은 항목)
  const [quickMode, setQuickMode] = useState('highlight');
  const [quickPublic, setQuickPublic] = useState(true);
  const [quickAi, setQuickAi] = useState('none');
  const [quickConsent, setQuickConsent] = useState({ rights: false, public: false });
  const [quickError, setQuickError] = useState(null);
  const [quickDone, setQuickDone] = useState(null); // 공개한 곡 (manage_url)
  const [quickKnown, setQuickKnown] = useState(null); // 409 KNOWN_SONG_MATCH 안내

  // 곡별 안내 문구. 새 문구가 오면 이전 문구의 지우기 타이머는 취소한다
  const noticeTimers = useRef({});
  const say = (trackId, text) => {
    clearTimeout(noticeTimers.current[trackId]);
    setNotice((prev) => ({ ...prev, [trackId]: text }));
    noticeTimers.current[trackId] = setTimeout(() => setNotice((prev) => ({ ...prev, [trackId]: null })), 6000);
  };

  const fetchTracks = async (sortBy) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCommunityTracks(sortBy, 20);
      setTracks(res.tracks);
      setTotal(res.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks(sort);
  }, [sort]);

  useEffect(() => {
    api.getCommunityMeta().then((m) => setTags(m.tags)).catch(() => {});
  }, []);

  const togglePlay = (track) => {
    const trackId = track.track_id;
    if (currentPlayingId === trackId) {
      audioObj?.pause();
      setCurrentPlayingId(null);
    } else {
      audioObj?.pause();
      const audio = new Audio(toFileUrl(track.audio_url));
      audio.play().catch((err) => say(trackId, `재생하지 못했어요: ${err.message}`));
      audio.onended = () => setCurrentPlayingId(null);
      setAudioObj(audio);
      setCurrentPlayingId(trackId);
      api.countPlay(trackId).catch(() => {}); // 같은 접속은 하루 한 번만 올라간다
    }
  };

  // 반응은 1회용 토큰을 받고 3초 뒤에 보내야 해서 잠깐 걸린다 (매크로 방지)
  const sendReaction = async (trackId, reaction, done) => {
    say(trackId, '보내는 중...');
    try {
      await api.sendFeedback(trackId, reaction);
      say(trackId, done);
      fetchTracks(sort);
    } catch (err) {
      say(trackId, err.message);
    }
  };

  const handleRate = (trackId, rating) => sendReaction(trackId, { rating }, `별점 ${rating}점을 남겼어요.`);
  const handleTag = (trackId, tag) => sendReaction(trackId, { tags: [tag] }, `'${tag}' 반응을 남겼어요.`);

  const handleAddComment = async (trackId) => {
    const text = commentInput[trackId];
    if (!text?.trim()) return;
    setCommentInput((prev) => ({ ...prev, [trackId]: '' }));
    sendReaction(trackId, { comment: text.trim() }, '한마디를 남겼어요.');
  };

  const handleReport = async (trackId, reason) => {
    setReportFor(null);
    try {
      const r = await api.reportTrack(trackId, reason);
      say(trackId, r.message);
      if (r.hidden) fetchTracks(sort);
    } catch (err) {
      say(trackId, err.message);
    }
  };

  const handleQuickSubmit = async (e, confirmOriginal = false) => {
    e?.preventDefault();
    if (!quickFile || !quickTitle || !quickArtist) {
      setQuickError('음원 파일, 곡명, 아티스트명을 입력해 주세요.');
      return;
    }
    if (!quickConsent.rights || !quickConsent.public) {
      setQuickError('필수 동의 두 가지에 체크해 주세요.');
      return;
    }

    setQuickUploading(true);
    setQuickError(null);
    try {
      const formData = new FormData();
      formData.append('file', quickFile);
      formData.append('title', quickTitle.trim());
      formData.append('artist', quickArtist.trim());
      formData.append('intro', quickDesc.trim());
      formData.append('listen_mode', quickMode);
      formData.append('comments_public', quickPublic);
      formData.append('ai_usage', quickAi);
      formData.append('consent_rights', true);
      formData.append('consent_public', true);
      formData.append('confirm_original', confirmOriginal);
      formData.append('website', ''); // 사람은 비워 두는 칸 (매크로 방지)

      const t = await api.publishQuick(formData);
      setQuickKnown(null);
      setQuickDone(t);
      setQuickTitle('');
      setQuickArtist('');
      setQuickDesc('');
      setQuickFile(null);
      fetchTracks('new');
    } catch (err) {
      if (err.code === 'KNOWN_SONG_MATCH') setQuickKnown(err.message);
      else setQuickError(err.message);
    } finally {
      setQuickUploading(false);
    }
  };

  const closeQuick = () => {
    setShowQuickModal(false);
    setQuickDone(null);
    setQuickError(null);
    setQuickKnown(null);
  };

  const topTags = (track) => Object.entries(track.stats?.tags || {}).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 3);

  const displayTracks = tracks;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Community Header Banner */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-indigo-50/70 via-white to-white dark:from-indigo-950/30 dark:via-[#121215] dark:to-[#121215] border-indigo-200 dark:border-indigo-500/20 shadow-sm">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>발매 전/후 리스너 반응 공간</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
            '들어봐' 피드백 커뮤니티
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-lg">
            발매를 앞둔 자작곡을 미리 들려주고 동료 창작자들과 리스너들의 생생한 별점과 한마디를 수집하세요.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowQuickModal(true)}
            className="btn-secondary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-4 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>AI 없이 곡만 바로 올리기</span>
          </button>

          <button
            onClick={onStartNewRelease}
            className="btn-primary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-5 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            <span>정규 발매 패키징 시작</span>
          </button>
        </div>
      </div>

      {/* Sort Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort('new')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              sort === 'new'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900/60'
            }`}
          >
            최신 업로드순
          </button>
          <button
            onClick={() => setSort('popular')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              sort === 'popular'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900/60'
            }`}
          >
            인기 피드백순
          </button>
        </div>

        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">총 {total}곡</span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">{error}</div>
      )}
      {!loading && !error && displayTracks.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-10">아직 올라온 곡이 없어요. 첫 곡을 올려 보세요!</p>
      )}

      {/* Tracks Feed List */}
      <div className="space-y-6">
        {displayTracks.map((track) => {
          const trackId = track.track_id;
          const isPlaying = currentPlayingId === trackId;
          const cover = toFileUrl(track.cover_url);

          return (
            <motion.div
              key={trackId}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 hover:border-zinc-300 dark:hover:border-white/15 transition-all shadow-sm"
            >
              {/* Track Info Row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Cover & Play Button */}
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 group shadow-md border border-zinc-200 dark:border-white/10">
                    <img src={cover} alt={track.title} className="w-full h-full object-cover" />
                    <button
                      onClick={() => togglePlay(track)}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center text-white opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {isPlaying ? (
                        <Pause className="w-7 h-7 text-indigo-400 fill-current" />
                      ) : (
                        <Play className="w-7 h-7 text-white fill-current translate-x-0.5" />
                      )}
                    </button>
                  </div>

                  {/* Title & Artist */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                        {track.genre || '장르 미입력'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {track.listen_mode === 'highlight' ? `하이라이트 ${Math.round(track.clip_sec)}초` : '전곡'}
                      </span>
                      {track.ai_usage === 'generated' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">AI 활용</span>
                      )}
                      {isPlaying && (
                        <span className="text-[10px] font-bold text-emerald-500 animate-pulse flex items-center gap-1">
                          ● 재생 중
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white leading-tight">
                      {track.title}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{track.artist}</p>
                  </div>
                </div>

                {/* Rating Badge & Report */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{track.stats?.rating_avg ? Number(track.stats.rating_avg).toFixed(1) : '-'}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">({track.stats?.rating_count || 0})</span>
                  </div>

                  <span className="text-[10px] text-zinc-400">재생 {track.plays} · 반응 {track.reactions}</span>
                  <button
                    onClick={() => setReportFor(reportFor === trackId ? null : trackId)}
                    className="text-[11px] text-zinc-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>신고</span>
                  </button>
                </div>
              </div>

              {/* 신고 사유 고르기 — 서로 다른 3명이 신고하면 자동으로 숨겨져요 */}
              {reportFor === trackId && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs">
                  <span className="font-semibold text-rose-700 dark:text-rose-300">신고 사유</span>
                  {Object.entries(REPORT_REASONS).map(([k, label]) => (
                    <button key={k} onClick={() => handleReport(trackId, k)} className="px-2.5 py-1 rounded-full border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20">{label}</button>
                  ))}
                </div>
              )}

              {/* Creator Description */}
              {track.intro && (
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-[#121215] p-3 rounded-xl border border-zinc-200 dark:border-white/5 leading-relaxed">
                  "{track.intro}"
                </p>
              )}

              {/* Interactive Rating & Tags */}
              <div className="pt-2 border-t border-zinc-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mr-1">별점 주기:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleRate(trackId, star)}
                      className="text-zinc-300 dark:text-zinc-600 hover:text-amber-400 hover:scale-125 transition-transform"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  ))}
                </div>

                {/* 많이 받은 반응 태그 (반응 공개한 곡만) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {topTags(track).map(([tag, n]) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/5"
                    >
                      #{tag} {n}
                    </span>
                  ))}
                </div>
              </div>

              {/* 태그로 반응 남기기 */}
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTag(trackId, tag)}
                    className="px-2.5 py-1 rounded-full text-[11px] border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              {!track.comments_public && (
                <p className="text-[11px] text-zinc-400">올린 분이 반응을 '나만 보기'로 해 두었어요. 남긴 반응은 올린 분만 봐요.</p>
              )}
              {notice[trackId] && (
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{notice[trackId]}</p>
              )}

              {/* Comment Input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="곡에 대한 따뜻한 피드백이나 감상평을 한마디 남겨주세요."
                  value={commentInput[trackId] || ''}
                  onChange={(e) => setCommentInput({ ...commentInput, [trackId]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment(trackId)}
                  className="flex-1 bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 shadow-sm"
                />
                <button
                  onClick={() => handleAddComment(trackId)}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
                >
                  <Send className="w-3 h-3" />
                  <span>남기기</span>
                </button>
              </div>

            </motion.div>
          );
        })}
      </div>

      {/* Quick Upload Modal */}
      <AnimatePresence>
        {showQuickModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 sm:p-8 space-y-5 bg-white dark:bg-[#121215] border-zinc-200 dark:border-white/10 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-3">
                <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">AI 분석 없이 곡 바로 올리기</h3>
                <button
                  onClick={closeQuick}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {quickDone ? (
                <div className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">공개했어요! 아래 관리 링크를 꼭 저장해 두세요.</p>
                  <p>이 링크가 있어야 받은 반응(비공개 포함)을 보고, 설정을 바꾸고, 곡을 내릴 수 있어요.</p>
                  <code className="block break-all p-2 rounded bg-zinc-100 dark:bg-zinc-900">{toFileUrl(quickDone.manage_url)}</code>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => navigator.clipboard.writeText(toFileUrl(quickDone.manage_url))} className="btn-secondary text-xs px-4 py-2">링크 복사</button>
                    <button type="button" onClick={closeQuick} className="btn-primary text-xs px-4 py-2">닫기</button>
                  </div>
                  <SurveyPanel kind="track" id={quickDone.track_id} ownerKey={quickDone.owner_key} />
                </div>
              ) : (
              <form onSubmit={handleQuickSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">음원 파일 (.mp3, .wav) *</label>
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav"
                    onChange={(e) => setQuickFile(e.target.files?.[0])}
                    className="w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">곡 제목 *</label>
                    <input
                      type="text"
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      placeholder="곡 제목"
                      className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">아티스트명 *</label>
                    <input
                      type="text"
                      value={quickArtist}
                      onChange={(e) => setQuickArtist(e.target.value)}
                      placeholder="아티스트명"
                      className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">리스너에게 전하는 한마디</label>
                  <textarea
                    rows={3}
                    value={quickDesc}
                    onChange={(e) => setQuickDesc(e.target.value)}
                    placeholder="어떤 부분에 집중해서 들어줬으면 좋겠는지 적어주세요."
                    className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-white resize-none"
                  />
                </div>

                <div className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="w-16">들려줄 범위</b>
                    {[['highlight', '하이라이트 15초'], ['full', '전곡']].map(([v, l]) => (
                      <button type="button" key={v} onClick={() => setQuickMode(v)} className={`px-3 py-1 rounded-full border ${quickMode === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/10'}`}>{l}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="w-16">반응 공개</b>
                    {[[true, '모두에게 공개'], [false, '나만 보기']].map(([v, l]) => (
                      <button type="button" key={l} onClick={() => setQuickPublic(v)} className={`px-3 py-1 rounded-full border ${quickPublic === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/10'}`}>{l}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="w-16">AI 사용</b>
                    {[['none', '안 썼어요'], ['tool', '도구로만'], ['generated', 'AI가 곡·목소리를 만듦']].map(([v, l]) => (
                      <button type="button" key={v} onClick={() => setQuickAi(v)} className={`px-3 py-1 rounded-full border ${quickAi === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/10'}`}>{l}</button>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={quickConsent.rights} onChange={(e) => setQuickConsent((c) => ({ ...c, rights: e.target.checked }))} className="mt-0.5" />
                    <span>[필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={quickConsent.public} onChange={(e) => setQuickConsent((c) => ({ ...c, public: e.target.checked }))} className="mt-0.5" />
                    <span>[필수] 커뮤니티에 공개하고, 내가 내릴 때까지(서비스 종료일까지) 보관돼요. 듣는 사람의 반응과 접속 IP(도배 방지용, 7일 보관)가 모여요. 공개 음원은 녹음될 수 있으니 발매 전 곡은 하이라이트만 공개하길 권해요</span>
                  </label>
                </div>

                {quickError && <p className="text-xs text-rose-600 dark:text-rose-400">{quickError}</p>}
                {quickKnown && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2 text-xs">
                    <p>{quickKnown}</p>
                    <button type="button" onClick={() => handleQuickSubmit(null, true)} disabled={quickUploading} className="btn-secondary text-xs px-3 py-1.5">
                      직접 만든 곡이 맞아요 — 올리기
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeQuick}
                    className="btn-secondary text-xs px-4 py-2"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={quickUploading}
                    className="btn-primary text-xs px-5 py-2 shadow-md"
                  >
                    {quickUploading ? '업로드 중...' : '커뮤니티에 등록'}
                  </button>
                </div>
              </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
