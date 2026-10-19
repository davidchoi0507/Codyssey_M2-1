import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Star,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Share2,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Save,
  Volume2,
} from 'lucide-react';
import { api, toFileUrl } from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';

export default function TrackManageView({ trackId, ownerKey, onClose, onGoToCommunity }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [track, setTrack] = useState(null);

  // Form states for settings
  const [listenMode, setListenMode] = useState('highlight');
  const [commentsPublic, setCommentsPublic] = useState(true);
  const [intro, setIntro] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Feedback action state
  const [hidingFeedbackId, setHidingFeedbackId] = useState(null);

  // Track deletion states
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Copy notice
  const [copiedKey, setCopiedKey] = useState(null);

  // Audio preview
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const loadTrackData = async () => {
    if (!trackId || !ownerKey) {
      setError('관리 링크가 올바르지 않거나 관리 열쇠(key)가 누락되었습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getTrackOwnerView(trackId, ownerKey);
      setTrack(data);
      setListenMode(data.listen_mode || 'highlight');
      setCommentsPublic(Boolean(data.comments_public));
      setIntro(data.intro || '');
    } catch (err) {
      if (err.code === 'OWNER_KEY_MISMATCH' || err.status === 403 || err.status === 401) {
        setError('곡의 관리 열쇠(Owner Key)가 일치하지 않습니다. 올바른 관리 링크로 접속해 주세요.');
      } else if (err.status === 404) {
        setError('해당 곡을 찾을 수 없습니다. 이미 삭제되었거나 만료된 곡일 수 있습니다.');
      } else {
        setError(err.message || '곡 관리 정보를 불러오는 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrackData();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [trackId, ownerKey]);

  // Audio Play/Pause Toggle
  const togglePlay = () => {
    if (!track?.audio_url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(toFileUrl(track.audio_url));
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updated = await api.updateTrackOwner(
        trackId,
        {
          listen_mode: listenMode,
          comments_public: commentsPublic,
          intro: intro.trim(),
        },
        ownerKey
      );
      setTrack((prev) => ({
        ...prev,
        ...updated,
        listen_mode: listenMode,
        comments_public: commentsPublic,
        intro: intro.trim(),
      }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || '설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Feedback Hide/Show
  const handleToggleHideFeedback = async (feedbackId, currentHidden) => {
    setHidingFeedbackId(feedbackId);
    try {
      await api.hideTrackFeedback(trackId, feedbackId, !currentHidden, ownerKey);
      setTrack((prev) => {
        if (!prev) return prev;
        const nextFeedback = (prev.feedback || []).map((f) =>
          f.id === feedbackId ? { ...f, hidden: !currentHidden } : f
        );
        return { ...prev, feedback: nextFeedback };
      });
    } catch (err) {
      alert(err.message || '피드백 상태를 변경하지 못했습니다.');
    } finally {
      setHidingFeedbackId(null);
    }
  };

  // Delete Track
  const handleDeleteTrack = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteTrackOwner(trackId, ownerKey);

      // Remove from localStorage if cached
      try {
        const raw = localStorage.getItem('balmaero_published_tracks');
        if (raw) {
          const list = JSON.parse(raw);
          const next = list.filter((x) => x.track_id !== trackId);
          localStorage.setItem('balmaero_published_tracks', JSON.stringify(next));
        }
      } catch {}

      alert('곡이 커뮤니티에서 안전하게 삭제되었습니다.');
      if (onClose) onClose();
      else if (onGoToCommunity) onGoToCommunity();
      else window.location.href = '/';
    } catch (err) {
      setDeleteError(err.message || '곡을 삭제하지 못했습니다.');
      setDeleting(false);
    }
  };

  // Copy to Clipboard
  const handleCopy = async (text, keyName) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const currentManageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const publicShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?track=${trackId}`
    : '';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-600 dark:text-zinc-400 font-medium text-sm">곡 관리 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="glass-panel p-8 rounded-2xl border-rose-200 dark:border-rose-900/50 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">곡 관리 정보 오류</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{error}</p>
          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => (onClose ? onClose() : (window.location.href = '/'))}
              className="btn-secondary text-sm px-4 py-2 font-bold"
            >
              홈으로 돌아가기
            </button>
            <button
              onClick={() => (onGoToCommunity ? onGoToCommunity() : (window.location.href = '/?tab=community'))}
              className="btn-primary text-sm px-4 py-2 font-bold"
            >
              '들어봐' 커뮤니티로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tagsList = Object.entries(track.stats?.tags || {}).sort((a, b) => b[1] - a[1]);
  const maxTagCount = Math.max(...tagsList.map(([, cnt]) => cnt), 1);
  const ratingDist = track.stats?.rating_dist || {};
  const totalRatings = track.stats?.rating_count || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => (onGoToCommunity ? onGoToCommunity() : onClose ? onClose() : (window.location.href = '/'))}
          className="inline-flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>'들어봐' 커뮤니티로 돌아가기</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Lock className="w-3.5 h-3.5" />
            <span>곡 관리자 전용 대시보드</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>LIVE 공개 중</span>
          </span>
        </div>
      </div>

      {/* Track Overview Card */}
      <div className="glass-panel p-6 rounded-3xl border border-zinc-200/80 dark:border-white/10 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-sm">
        {/* Cover Art with Play Button */}
        <div className="relative group w-36 h-36 rounded-2xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-lg">
          <img
            src={toFileUrl(track.cover_url)}
            alt={track.title}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity"
            title={isPlaying ? '일시정지' : '미리듣기 재생'}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md transform group-hover:scale-105 transition-transform">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </div>
          </button>
        </div>

        {/* Track Details */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              {track.genre || 'Indie'}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {track.listen_mode === 'highlight' ? `하이라이트 ${Math.round(track.clip_sec || 15)}초 공개` : '전곡 공개'}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              track.comments_public
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
            }`}>
              {track.comments_public ? '의견 공개 중' : '의견 나만 보는 중'}
            </span>
          </div>

          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            {track.title}
          </h1>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            {track.artist || '아티스트 미상'}
          </p>

          {track.intro && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 italic pt-1 max-w-xl">
              "{track.intro}"
            </p>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-2">
            <button
              type="button"
              onClick={() => handleCopy(publicShareUrl, 'public-share')}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-bold"
            >
              {copiedKey === 'public-share' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'public-share' ? '공유 링크 복사됨 ✓' : '리스너 공유 링크 복사'}</span>
            </button>
            <a
              href={publicShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 font-bold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>커뮤니티 곡 페이지 보기</span>
            </a>
          </div>
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-zinc-200/60 dark:border-white/5 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">총 재생 수</span>
          <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
            {track.plays || 0}
            <span className="text-xs font-normal text-zinc-400 ml-1">회</span>
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-zinc-200/60 dark:border-white/5 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">총 반응 수</span>
          <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
            {(track.stats?.reactions || 0) + (track.stats?.comments || 0)}
            <span className="text-xs font-normal text-zinc-400 ml-1">개</span>
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-zinc-200/60 dark:border-white/5 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">평균 별점</span>
          <p className="text-2xl font-extrabold text-amber-500 mt-1 flex items-center justify-center gap-1">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span>{track.stats?.rating_avg ? Number(track.stats.rating_avg).toFixed(1) : '-'}</span>
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-zinc-200/60 dark:border-white/5 text-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">별점 평가 인원</span>
          <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
            {track.stats?.rating_count || 0}
            <span className="text-xs font-normal text-zinc-400 ml-1">명</span>
          </p>
        </div>
      </div>

      {/* Listener Insights (Tags & Ratings) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Keywords chosen by listeners */}
        <div className="glass-panel p-6 rounded-3xl border border-zinc-200/60 dark:border-white/5 space-y-4">
          <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>들은 사람들이 고른 키워드</span>
          </h3>

          {tagsList.length === 0 ? (
            <p className="text-xs text-zinc-400 py-6 text-center">아직 선택된 키워드가 없습니다.</p>
          ) : (
            <div className="space-y-2.5">
              {tagsList.map(([tag, count]) => (
                <div key={tag} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{tag}</span>
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{count}회</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((count / maxTagCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rating Distribution */}
        <div className="glass-panel p-6 rounded-3xl border border-zinc-200/60 dark:border-white/5 space-y-4">
          <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            <span>별점 분포</span>
          </h3>

          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((score) => {
              const count = ratingDist[String(score)] || ratingDist[score] || 0;
              const pct = totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0;
              return (
                <div key={score} className="flex items-center gap-3 text-xs">
                  <span className="w-7 font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-0.5">
                    <span>{score}</span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Received Feedback / Comments List */}
      <div className="glass-panel p-6 rounded-3xl border border-zinc-200/60 dark:border-white/5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200/60 dark:border-white/5">
          <div>
            <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              <span>받은 한마디 & 피드백</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              비공개 의견을 포함한 모든 피드백 목록입니다. 부적절하거나 숨기고 싶은 의견은 '숨기기'를 누르면 커뮤니티에서 보이지 않게 처리할 수 있습니다.
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            총 {(track.feedback || []).length}개
          </span>
        </div>

        {(!track.feedback || track.feedback.length === 0) ? (
          <div className="py-12 text-center space-y-2">
            <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">아직 받은 한마디가 없어요</p>
            <p className="text-xs text-zinc-400">
              커뮤니티 공유 링크를 친구들이나 SNS에 전달하고 소중한 첫 감상평을 받아보세요.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-white/5">
            {track.feedback.map((f) => (
              <div
                key={f.id}
                className={`py-4 space-y-2 transition-opacity ${f.hidden ? 'opacity-40 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 rounded-xl' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white">
                      {f.nickname || '익명의 리스너'}
                    </span>
                    {f.rating && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{f.rating}</span>
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString('ko-KR') : ''}
                    </span>
                    {f.hidden && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                        숨김 처리됨
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={hidingFeedbackId === f.id}
                    onClick={() => handleToggleHideFeedback(f.id, f.hidden)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium transition-colors flex items-center gap-1"
                  >
                    {f.hidden ? <Eye className="w-3 h-3 text-indigo-500" /> : <EyeOff className="w-3 h-3 text-rose-500" />}
                    <span>{f.hidden ? '다시 보이기' : '숨기기'}</span>
                  </button>
                </div>

                {f.tags && f.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {f.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {f.comment && (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap pt-0.5">
                    {f.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Modification Card */}
      <form onSubmit={handleSaveSettings} className="glass-panel p-6 rounded-3xl border border-zinc-200/60 dark:border-white/5 space-y-5">
        <div>
          <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
            <Save className="w-4 h-4 text-indigo-500" />
            <span>곡 공개 설정 변경</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            청취 범위와 피드백 공개 범위를 언제든지 자유롭게 변경할 수 있습니다.
          </p>
        </div>

        {/* Listen Mode */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            어떻게 들려줄까요?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              listenMode === 'highlight'
                ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300'
            }`}>
              <input
                type="radio"
                name="listenMode"
                value="highlight"
                checked={listenMode === 'highlight'}
                onChange={() => setListenMode('highlight')}
                className="mt-0.5 text-indigo-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-white block">
                  하이라이트 구간만 공개
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  A&R 노트에서 추출한 핵심 15초 하이라이트만 안전하게 들려줍니다.
                </span>
              </div>
            </label>

            <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              listenMode === 'full'
                ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300'
            }`}>
              <input
                type="radio"
                name="listenMode"
                value="full"
                checked={listenMode === 'full'}
                onChange={() => setListenMode('full')}
                className="mt-0.5 text-indigo-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-white block">
                  전곡 공개
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  음원의 전체 길이를 리스너들에게 완곡으로 들려줍니다.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Feedback Public / Private */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            받은 피드백은 누가 볼까요?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              commentsPublic
                ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300'
            }`}>
              <input
                type="radio"
                name="commentsPublic"
                value="public"
                checked={commentsPublic === true}
                onChange={() => setCommentsPublic(true)}
                className="mt-0.5 text-indigo-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-white block">
                  모두에게 공개
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  커뮤니티 곡 상세 카드에 리스너들의 댓글과 별점이 함께 표시됩니다.
                </span>
              </div>
            </label>

            <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              !commentsPublic
                ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300'
            }`}>
              <input
                type="radio"
                name="commentsPublic"
                value="private"
                checked={commentsPublic === false}
                onChange={() => setCommentsPublic(false)}
                className="mt-0.5 text-indigo-600"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-white block">
                  나만 보기 (비공개)
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  오직 이 관리자 페이지에서만 받은 의견을 나만 확인할 수 있습니다.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Intro */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            창작자 한 줄 소개 (선택)
          </label>
          <input
            type="text"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            maxLength={500}
            placeholder="곡에 대한 간단한 소개나 리스너에게 남기고 싶은 메시지를 적어보세요."
            className="w-full text-xs p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/10 focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Save Button & Status */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs px-5 py-2.5 font-bold shadow-md flex items-center gap-1.5"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? '저장 중...' : '설정 저장하기'}</span>
          </button>

          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>설정이 안전하게 저장되었어요!</span>
            </span>
          )}

          {saveError && (
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{saveError}</span>
            </span>
          )}
        </div>
      </form>

      {/* Secret Key & Manage Link Backup */}
      <div className="glass-panel p-6 rounded-3xl border border-zinc-200/60 dark:border-white/5 space-y-4">
        <div className="space-y-1">
          <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-500" />
            <span>이 곡의 관리 링크 (비밀 열쇠)</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            비로그인 상태에서 이 곡을 수정하거나 삭제할 수 있는 유일한 열쇠입니다. 브라우저 북마크나 메모장에 안전하게 보관하세요.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code className="flex-1 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate">
            {currentManageUrl}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(currentManageUrl, 'manage-url')}
            className="btn-secondary text-xs px-4 py-2 flex items-center justify-center gap-1.5 font-bold shadow-sm"
          >
            {copiedKey === 'manage-url' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === 'manage-url' ? '주소 복사됨 ✓' : '관리 주소 복사'}</span>
          </button>
        </div>
      </div>

      {/* Danger Zone: Delete Track */}
      <div className="p-6 rounded-3xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/10 space-y-3">
        <div className="space-y-1">
          <h3 className="font-extrabold text-base text-rose-700 dark:text-rose-400 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            <span>곡 내리기 (삭제)</span>
          </h3>
          <p className="text-xs text-rose-600/80 dark:text-rose-300/80">
            커뮤니티에서 곡을 내리면 음원, 커버, 그리고 지금까지 리스너들에게 받은 소중한 피드백이 모두 영구 삭제되며 되돌릴 수 없습니다.
          </p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={deleting}
            onClick={handleDeleteTrack}
            className={`text-xs px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1.5 ${
              confirmDelete
                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                : 'border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/30'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleting ? '삭제 처리 중...' : confirmDelete ? '정말 삭제할게요 (한 번 더 누르기)' : '커뮤니티에서 곡 내리기'}</span>
          </button>

          {confirmDelete && !deleting && (
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              취소
            </button>
          )}

          {deleteError && (
            <span className="text-xs text-rose-600 font-bold">{deleteError}</span>
          )}
        </div>
      </div>
    </div>
  );
}
