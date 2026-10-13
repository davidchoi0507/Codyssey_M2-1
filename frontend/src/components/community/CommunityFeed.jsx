import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Star, PlusCircle, Sparkles, Send, ShieldAlert } from 'lucide-react';
import { api, toFileUrl } from '../../services/api';

const QUICK_TAGS = ['새벽감성', '비트맛집', '보컬독보적', '가사감동', '드라이브곡', '믹싱깔끔'];

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

  const fetchTracks = async (sortBy) => {
    setLoading(true);
    try {
      const res = await api.getCommunityTracks(sortBy, 20);
      setTracks(res.tracks || res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks(sort);
  }, [sort]);

  const togglePlay = (track) => {
    const trackId = track.track_id || track.id;
    if (currentPlayingId === trackId) {
      audioObj?.pause();
      setCurrentPlayingId(null);
    } else {
      audioObj?.pause();
      const soundUrl = toFileUrl(track.audio_url || track.preview_url);
      const audio = new Audio(soundUrl);
      audio.play().catch((err) => console.warn('Audio play error:', err));
      audio.onended = () => setCurrentPlayingId(null);
      setAudioObj(audio);
      setCurrentPlayingId(trackId);
    }
  };

  const handleRate = async (trackId, rating) => {
    try {
      await api.rateTrack(trackId, rating);
      fetchTracks(sort);
    } catch (err) {
      alert(err.message || '별점 등록 실패');
    }
  };

  const handleAddComment = async (trackId) => {
    const text = commentInput[trackId];
    if (!text?.trim()) return;

    try {
      await api.rateTrack(trackId, 5, text);
      setCommentInput((prev) => ({ ...prev, [trackId]: '' }));
      fetchTracks(sort);
    } catch (err) {
      alert(err.message || '댓글 등록 실패');
    }
  };

  const handleReport = async (trackId) => {
    if (window.confirm('이 곡을 무단 도용/저작권 침해로 신고하시겠습니까?')) {
      try {
        await api.reportTrack(trackId);
        alert('신고가 접수되었습니다.');
        fetchTracks(sort);
      } catch (err) {
        alert(err.message || '신고 실패');
      }
    }
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    if (!quickFile || !quickTitle || !quickArtist) {
      alert('음원 파일, 곡명, 아티스트명을 입력해 주세요.');
      return;
    }

    setQuickUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', quickFile);
      formData.append('title', quickTitle);
      formData.append('artist', quickArtist);
      formData.append('description', quickDesc);
      formData.append('consent_version', 'v1.2');

      const jobRes = await api.createJob(formData);
      const jobId = jobRes.job_id || jobRes.id;

      await api.publishToCommunity({
        job_id: jobId,
        title: quickTitle,
        artist: quickArtist,
        genre: 'Indie',
      });

      setShowQuickModal(false);
      setQuickTitle('');
      setQuickArtist('');
      setQuickDesc('');
      setQuickFile(null);
      fetchTracks('new');
    } catch (err) {
      alert(err.message || '등록 실패');
    } finally {
      setQuickUploading(false);
    }
  };

  const displayTracks = tracks.length > 0 ? tracks : [
    {
      id: 'demo-1',
      title: '새벽 2시의 유영 (Night Drift)',
      artist: '웨이브사운드 (WaveSound)',
      genre: 'City Pop / Indie',
      rating_avg: 4.8,
      rating_count: 14,
      cover_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
      description: '보컬 녹음 끝내고 유통사 넣기 전에 피드백 받고 싶어서 올립니다! 믹싱 밸런스 어떤가요?',
      tags: ['새벽감성', '믹싱깔끔'],
    },
    {
      id: 'demo-2',
      title: '비 내리는 성수동 골목길',
      artist: '밍키 (Minki)',
      genre: 'Acoustic / Lo-Fi',
      rating_avg: 4.9,
      rating_count: 22,
      cover_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80',
      description: '통기타 원테이크로 녹음한 미발매곡입니다. 첫 싱글 발매 예정인데 많은 피드백 부탁드려요!',
      tags: ['가사감동', '보컬독보적'],
    },
  ];

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

        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">총 {displayTracks.length}개의 미발매 트랙</span>
      </div>

      {/* Tracks Feed List */}
      <div className="space-y-6">
        {displayTracks.map((track) => {
          const trackId = track.track_id || track.id;
          const isPlaying = currentPlayingId === trackId;
          const cover = toFileUrl(track.cover_url) || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80';

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
                        {track.genre || 'Indie'}
                      </span>
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
                    <span>{track.rating_avg ? Number(track.rating_avg).toFixed(1) : '5.0'}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">({track.rating_count || 1})</span>
                  </div>

                  <button
                    onClick={() => handleReport(trackId)}
                    className="text-[11px] text-zinc-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>신고</span>
                  </button>
                </div>
              </div>

              {/* Creator Description */}
              {track.description && (
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-[#121215] p-3 rounded-xl border border-zinc-200 dark:border-white/5 leading-relaxed">
                  "{track.description}"
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

                {/* Quick Feedback Tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(track.tags || QUICK_TAGS.slice(0, 3)).map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/5"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

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
              className="glass-panel w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-5 bg-white dark:bg-[#121215] border-zinc-200 dark:border-white/10 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-3">
                <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">AI 분석 없이 곡 바로 올리기</h3>
                <button
                  onClick={() => setShowQuickModal(false)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

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

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickModal(false)}
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
