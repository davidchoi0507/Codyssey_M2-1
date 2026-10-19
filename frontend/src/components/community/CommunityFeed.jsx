import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Star,
  PlusCircle,
  Sparkles,
  Send,
  ShieldAlert,
  Search,
  Share2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Shuffle,
  Volume2,
  X,
  Check,
  LayoutGrid,
  List,
  ArrowLeft,
} from 'lucide-react';
import { api, toFileUrl } from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';
import SurveyPanel from '../survey/SurveyPanel';

const REPORT_REASONS = {
  stolen: '남의 곡을 허락 없이 올림',
  abuse: '욕설·비하·혐오',
  ad: '광고·도배',
  other: '기타',
};

const GENRE_OPTIONS = [
  { value: '', label: '전체 장르' },
  { value: 'Indie', label: '인디 (Indie)' },
  { value: 'Pop', label: '팝 (Pop)' },
  { value: 'R&B', label: 'R&B / Soul' },
  { value: 'Hip-Hop', label: '힙합 (Hip-Hop)' },
  { value: 'Rock', label: '록 / 밴드 (Rock)' },
  { value: 'Ballad', label: '발라드 (Ballad)' },
  { value: 'Electronic', label: '일렉트로닉 (Electronic)' },
  { value: 'Folk', label: '포크 / 어쿠스틱' },
];

export default function CommunityFeed({ onStartNewRelease, onGoToStudio, initialTrackId }) {
  const [tracks, setTracks] = useState([]);
  const [sort, setSort] = useState('new'); // 'new' | 'popular' | 'random'
  const [genreFilter, setGenreFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const initialTrackHandled = useRef(false);

  // 뷰 모드 토글 상태 ('card' | 'list')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('balmaero_community_view_mode') || 'card';
    } catch {
      return 'card';
    }
  });

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('balmaero_community_view_mode', mode);
    } catch {}
  };

  // 오디오 미니 플레이어 상태 (D8-5)
  const [playingTrack, setPlayingTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ current: 0, duration: 0 });
  const audioRef = useRef(null);

  // 카드별 펼침 상태 (반응 남기기는 한 번에 한 카드만 열림)
  const [openReactionId, setOpenReactionId] = useState(null);
  const [openCommentsId, setOpenCommentsId] = useState(null);
  const [trackDetails, setTrackDetails] = useState({}); // { [trackId]: { feedback: [], showAll: false, loading: false } }
  const [copiedTrackId, setCopiedTrackId] = useState(null);

  // 반응 입력 상태 (은희님 피드백: 별점+태그+감상평 동시 전송 및 중복 반영 방지)
  const [tags, setTags] = useState([]); // GET /community/meta
  const [selectedRating, setSelectedRating] = useState({}); // { [trackId]: number }
  const [selectedTags, setSelectedTags] = useState({}); // { [trackId]: string[] }
  const [nicknameInput, setNicknameInput] = useState({});
  const [commentInput, setCommentInput] = useState({});
  const [submittingReaction, setSubmittingReaction] = useState({});
  const [notice, setNotice] = useState({});
  const [reportFor, setReportFor] = useState(null); // 곡 신고
  const [commentReportFor, setCommentReportFor] = useState(null); // 한마디 신고 { trackId, feedbackId }

  // 바로 올리기 모달 상태
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickArtist, setQuickArtist] = useState('');
  const [quickGenre, setQuickGenre] = useState('Indie');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickFile, setQuickFile] = useState(null);
  const [quickCover, setQuickCover] = useState(null);
  const [quickUploading, setQuickUploading] = useState(false);
  const [quickMode, setQuickMode] = useState('highlight');
  const [quickPublic, setQuickPublic] = useState(true);
  const [quickAi, setQuickAi] = useState('none');
  const [quickConsent, setQuickConsent] = useState({ rights: false, public: false });
  const [quickError, setQuickError] = useState(null);
  const [quickDone, setQuickDone] = useState(null);
  const [quickKnown, setQuickKnown] = useState(null);

  const noticeTimers = useRef({});
  const say = (trackId, text) => {
    clearTimeout(noticeTimers.current[trackId]);
    setNotice((prev) => ({ ...prev, [trackId]: text }));
    noticeTimers.current[trackId] = setTimeout(
      () => setNotice((prev) => ({ ...prev, [trackId]: null })),
      6000
    );
  };

const matchesGenre = (trackGenre, selectedGenre) => {
  if (!selectedGenre) return true;
  const raw = (trackGenre || '').trim();
  const g = raw.toLowerCase();
  
  if (selectedGenre === 'Indie') {
    // 발매로는 인디 뮤지션 플랫폼이므로, 장르 미입력(기본값)이거나 indie/인디가 포함된 곡 모두 매칭
    return !raw || g.includes('indie') || raw.includes('인디');
  }
  if (selectedGenre === 'Pop') {
    return g.includes('pop') || raw.includes('팝');
  }
  if (selectedGenre === 'R&B') {
    return g.includes('r&b') || g.includes('soul') || raw.includes('소울') || raw.includes('알앤비');
  }
  if (selectedGenre === 'Hip-Hop') {
    return g.includes('hip') || raw.includes('힙합') || raw.includes('랩');
  }
  if (selectedGenre === 'Rock') {
    return g.includes('rock') || raw.includes('록') || raw.includes('락') || raw.includes('밴드');
  }
  if (selectedGenre === 'Ballad') {
    return g.includes('ballad') || raw.includes('발라드');
  }
  if (selectedGenre === 'Electronic') {
    return g.includes('electro') || g.includes('edm') || raw.includes('일렉');
  }
  if (selectedGenre === 'Folk') {
    return g.includes('folk') || g.includes('acoustic') || raw.includes('포크') || raw.includes('어쿠스틱');
  }
  return g.includes(selectedGenre.toLowerCase()) || raw.includes(selectedGenre);
};

  const fetchTracks = async ({
    reset = true,
    nextOffset = 0,
    customSort = sort,
    customGenre = genreFilter,
    customQ = appliedQuery,
  } = {}) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const apiSort =
        customSort === 'rating' || customSort === 'reactions' ? 'popular' : customSort;
      // 서버에서 genre=Indie 등 영문 필터가 한글 장르 및 빈 장르도 찾도록 배포 완료됨
      let list = [];
      let totalCount = 0;
      try {
        const res = await api.getCommunityTracks({
          sort: apiSort,
          genre: customGenre || '',
          q: customQ,
          limit: 50,
          offset: nextOffset,
        });
        list = res.tracks || [];
        totalCount = res.total || list.length;
      } catch (feedErr) {
        if (!initialTrackId) throw feedErr;
      }

      // 스마트 장르 필터링 적용 (신미영님 피드백: Indie 및 한글 장르 필터링 완벽 지원)
      if (customGenre) {
        list = list.filter((t) => matchesGenre(t.genre, customGenre));
      }

      if (customSort === 'rating') {
        list = [...list].sort(
          (a, b) => (Number(b.stats?.rating_avg) || 0) - (Number(a.stats?.rating_avg) || 0)
        );
      } else if (customSort === 'reactions') {
        list = [...list].sort((a, b) => {
          const rA =
            (Number(a.stats?.rating_count) || 0) +
            (Number(a.stats?.comment_count) || 0) +
            (Number(a.reactions) || 0);
          const rB =
            (Number(b.stats?.rating_count) || 0) +
            (Number(b.stats?.comment_count) || 0) +
            (Number(b.reactions) || 0);
          return rB - rA;
        });
      }

      // 공유 링크(?track=ID)로 진입한 경우: api.getTrackDetail(id)로 해당 곡을 맨 위에 노출
      if (reset && initialTrackId && !initialTrackHandled.current) {
        initialTrackHandled.current = true;
        try {
          const sharedTrack = await api.getTrackDetail(initialTrackId);
          if (sharedTrack && sharedTrack.track_id) {
            list = list.filter((t) => t.track_id !== sharedTrack.track_id);
            list.unshift(sharedTrack);
            if (sharedTrack.feedback) {
              setTrackDetails((prev) => ({
                ...prev,
                [sharedTrack.track_id]: {
                  feedback: (sharedTrack.feedback || []).filter((f) => f.comment && !f.hidden),
                  showAll: false,
                  loading: false,
                },
              }));
            }
          }
        } catch (detailErr) {
          console.warn('Failed to fetch shared track detail:', detailErr);
        }
      }

      if (reset) {
        setTracks(list);
      } else {
        setTracks((prev) => [...prev, ...list]);
      }
      setTotal(customGenre ? list.length : (totalCount || list.length));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTracks({ reset: true, nextOffset: 0 });
  }, [sort, genreFilter, appliedQuery]);

  useEffect(() => {
    api
      .getCommunityMeta()
      .then((m) => setTags(m.tags || []))
      .catch(() => {});
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // 오디오 재생/일시정지 토글
  const togglePlay = (track) => {
    const trackId = track.track_id;
    if (playingTrack?.track_id === trackId && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch((err) => say(trackId, `재생하지 못했어요: ${err.message}`));
        setIsPlaying(true);
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(toFileUrl(track.audio_url));
    audioRef.current = audio;
    setPlayingTrack(track);
    setAudioProgress({ current: 0, duration: track.clip_sec || track.duration_sec || 0 });

    audio.ontimeupdate = () => {
      setAudioProgress({
        current: audio.currentTime || 0,
        duration: audio.duration || track.clip_sec || 0,
      });
    };
    audio.onended = () => {
      setIsPlaying(false);
    };
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        setIsPlaying(false);
        say(trackId, `재생하지 못했어요: ${err.message}`);
      });

    api.countPlay(trackId).catch(() => {});
  };

  const stopMiniPlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setPlayingTrack(null);
  };

  // 한마디(댓글) 목록 불러오기
  const loadTrackDetail = async (trackId, force = false) => {
    if (trackDetails[trackId]?.feedback && !force) return;
    setTrackDetails((prev) => ({
      ...prev,
      [trackId]: { ...(prev[trackId] || {}), loading: true },
    }));
    try {
      const detail = await api.getTrackDetail(trackId);
      setTrackDetails((prev) => ({
        ...prev,
        [trackId]: {
          feedback: (detail.feedback || []).filter((f) => f.comment && !f.hidden),
          showAll: prev[trackId]?.showAll || false,
          loading: false,
        },
      }));
    } catch (err) {
      setTrackDetails((prev) => ({
        ...prev,
        [trackId]: { ...(prev[trackId] || {}), loading: false },
      }));
    }
  };

  const toggleComments = (trackId) => {
    if (openCommentsId === trackId) {
      setOpenCommentsId(null);
    } else {
      setOpenCommentsId(trackId);
      loadTrackDetail(trackId);
    }
  };

  const handleSelectRating = (trackId, rating) => {
    setSelectedRating((prev) => ({
      ...prev,
      [trackId]: prev[trackId] === rating ? 0 : rating,
    }));
  };

  const handleToggleTag = (track, tag) => {
    const trackId = track.track_id;
    const current = selectedTags[trackId] !== undefined ? selectedTags[trackId] : (track.my_tags || []);
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag].slice(0, 3);
    setSelectedTags((prev) => ({ ...prev, [trackId]: next }));
  };

  // 은희님 피드백: 별점+태그+감상평 동시 전송 및 중복 클릭 방지 통합 핸들러
  const handleSubmitFeedback = async (track) => {
    const trackId = track.track_id;
    const currentRating = selectedRating[trackId] !== undefined ? selectedRating[trackId] : track.my_rating;
    const currentTags = selectedTags[trackId] !== undefined ? selectedTags[trackId] : (track.my_tags || []);
    const comment = (commentInput[trackId] || '').trim();
    const nick = (nicknameInput[trackId] || '').trim();

    if (!currentRating && currentTags.length === 0 && !comment) {
      say(trackId, '별점, 태그, 또는 감상평 중 최소 하나를 선택해 주세요.');
      return;
    }

    setSubmittingReaction((prev) => ({ ...prev, [trackId]: true }));
    say(trackId, '피드백을 안전하게 등록하는 중이에요...');
    try {
      // 1. 즉시 반응 (0ms 낙관적 UI 업데이트): 별점, 태그, 한마디, 총 반응 수 모두 즉각 반영
      setTracks((prev) =>
        prev.map((t) => {
          if (t.track_id !== trackId) return t;

          // 신규 반응 여부 (기존에 반응이 없었으면 총 반응수 +1)
          const hadReactionBefore = Boolean(t.my_rating || (t.my_tags && t.my_tags.length > 0));
          const isNewReaction = !hadReactionBefore && (currentRating > 0 || currentTags.length > 0 || Boolean(comment));
          const newReactions = (t.reactions || 0) + (isNewReaction ? 1 : 0);

          // 별점 통계 계산
          let nextRatingAvg = t.stats?.rating_avg || null;
          let nextRatingCount = t.stats?.rating_count || 0;
          const nextRatingDist = { ...(t.stats?.rating_dist || {}) };

          if (currentRating > 0) {
            const prevRating = t.my_rating || 0;
            if (prevRating > 0) {
              const totalSum = (Number(t.stats?.rating_avg) || 0) * nextRatingCount - prevRating + currentRating;
              nextRatingAvg = Math.round((totalSum / nextRatingCount) * 10) / 10;
              nextRatingDist[String(prevRating)] = Math.max(0, (nextRatingDist[String(prevRating)] || 1) - 1);
              nextRatingDist[String(currentRating)] = (nextRatingDist[String(currentRating)] || 0) + 1;
            } else {
              const totalSum = (Number(t.stats?.rating_avg) || 0) * nextRatingCount + currentRating;
              nextRatingCount += 1;
              nextRatingAvg = Math.round((totalSum / nextRatingCount) * 10) / 10;
              nextRatingDist[String(currentRating)] = (nextRatingDist[String(currentRating)] || 0) + 1;
            }
          }

          // 태그 통계 계산
          const nextTags = { ...(t.stats?.tags || {}) };
          currentTags.forEach((tag) => {
            if (!(t.my_tags || []).includes(tag)) {
              nextTags[tag] = (nextTags[tag] || 0) + 1;
            }
          });

          return {
            ...t,
            my_rating: currentRating || t.my_rating,
            my_tags: currentTags.length > 0 ? currentTags : t.my_tags,
            reactions: newReactions,
            comment_count: comment ? (t.comment_count || 0) + 1 : t.comment_count,
            stats: {
              ...(t.stats || {}),
              reactions: newReactions,
              comments: comment ? (t.stats?.comments || 0) + 1 : (t.stats?.comments || 0),
              rating_avg: nextRatingAvg,
              rating_count: nextRatingCount,
              rating_dist: nextRatingDist,
              tags: nextTags,
            },
          };
        })
      );

      // 한마디(댓글) 등록 시 댓글창 낙관적 렌더링 & 댓글창 자동 열기
      if (comment) {
        setTrackDetails((prev) => {
          const prevList = prev[trackId]?.feedback || [];
          const optimisticItem = {
            id: `temp-${Date.now()}`,
            nickname: nick || '익명 리스너',
            rating: currentRating,
            comment: comment,
            created_at: new Date().toISOString(),
          };
          return {
            ...prev,
            [trackId]: {
              ...prev[trackId],
              feedback: [optimisticItem, ...prevList],
            },
          };
        });
        setOpenCommentsId(trackId);
      }

      // 2. 서버로 피드백 전송
      await api.sendFeedback(trackId, {
        rating: currentRating || null,
        tags: currentTags.length > 0 ? currentTags : [],
        comment: comment || null,
        nickname: nick || '익명 리스너',
      });
      say(trackId, '소중한 피드백(별점·반응·한마디)이 등록되었어요 ✓');
      setCommentInput((prev) => ({ ...prev, [trackId]: '' }));

      // 3. 서버 계산 결과로 최신 동기화 (별점 평균, 전체 태그 분포, 피드백 목록 최신화)
      try {
        const freshTrack = await api.getTrackDetail(trackId);
        if (freshTrack && freshTrack.track_id) {
          setTracks((prev) =>
            prev.map((t) => (t.track_id === trackId ? { ...t, ...freshTrack } : t))
          );
          if (freshTrack.feedback) {
            setTrackDetails((prev) => ({
              ...prev,
              [trackId]: {
                feedback: (freshTrack.feedback || []).filter((f) => f.comment && !f.hidden),
                showAll: prev[trackId]?.showAll || false,
                loading: false,
              },
            }));
          }
        }
      } catch (freshErr) {
        console.warn('Failed to refresh track detail after feedback:', freshErr);
      }
    } catch (err) {
      say(trackId, err.message);
    } finally {
      setSubmittingReaction((prev) => ({ ...prev, [trackId]: false }));
    }
  };

  const handleShareTrack = async (track) => {
    const url = `${window.location.origin}${window.location.pathname}?track=${track.track_id}`;
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: track.title,
          text: `${track.artist || ''} - ${track.title}`,
          url,
        });
      } catch {}
    } else {
      const ok = await copyToClipboard(url);
      if (ok) {
        setCopiedTrackId(track.track_id);
        say(track.track_id, '곡 공유 링크가 클립보드에 복사되었어요 ✓');
        setTimeout(() => setCopiedTrackId(null), 2000);
      } else {
        say(track.track_id, '공유 링크 복사에 실패했어요. 브라우저 주소를 복사해 주세요.');
      }
    }
  };

  const handleReport = async (trackId, reason) => {
    setReportFor(null);
    try {
      const r = await api.reportTrack(trackId, reason);
      say(trackId, r.message);
      if (r.hidden) fetchTracks({ reset: true, nextOffset: 0 });
    } catch (err) {
      say(trackId, err.message);
    }
  };

  const handleReportComment = async (trackId, feedbackId, reason) => {
    setCommentReportFor(null);
    try {
      const r = await api.reportFeedback(trackId, feedbackId, reason);
      say(trackId, r.message || '한마디를 신고했어요.');
      loadTrackDetail(trackId, true);
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
      setQuickError('필수 동의 두 가지에 모두 체크해 주세요.');
      return;
    }

    setQuickUploading(true);
    setQuickError(null);
    try {
      const formData = new FormData();
      formData.append('file', quickFile);
      if (quickCover) formData.append('cover', quickCover);
      formData.append('title', quickTitle.trim());
      formData.append('artist', quickArtist.trim());
      formData.append('genre', quickGenre);
      formData.append('intro', quickDesc.trim());
      formData.append('listen_mode', quickMode);
      formData.append('comments_public', quickPublic);
      formData.append('ai_usage', quickAi);
      formData.append('consent_rights', true);
      formData.append('consent_public', true);
      formData.append('confirm_original', confirmOriginal);
      formData.append('website', '');

      const t = await api.publishQuick(formData);
      setQuickKnown(null);
      setQuickDone(t);
      setQuickTitle('');
      setQuickArtist('');
      setQuickDesc('');
      setQuickFile(null);
      setQuickCover(null);
      setSort('new');
      fetchTracks({ reset: true, nextOffset: 0, customSort: 'new' });
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

  const topTags = (track) =>
    Object.entries(track.stats?.tags || {})
      .filter(([, n]) => n > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3);

  const formatTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const renderDrawers = (track) => {
    const trackId = track.track_id;
    const isReactionOpen = openReactionId === trackId;
    const isCommentsOpen = openCommentsId === trackId;
    const detail = trackDetails[trackId] || {};
    const commentsList = detail.feedback || [];
    const visibleComments = detail.showAll ? commentsList : commentsList.slice(0, 3);

    return (
      <>
        {/* 신고 사유 선택 */}
        {reportFor === trackId && (
          <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs">
            <span className="font-bold text-rose-700 dark:text-rose-300 mr-1">신고 사유:</span>
            {Object.entries(REPORT_REASONS).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => handleReport(trackId, k)}
                className="px-2.5 py-1 rounded-full border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 펼침 영역 1 — 반응 남기기 */}
        {isReactionOpen && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-indigo-200 dark:border-indigo-500/25 space-y-3.5 text-xs shadow-sm">
            {/* 별점 선택부 */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-200/60 dark:border-white/5">
              <div>
                <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs">
                  별점 선택 (1~5점)
                </span>
                <span className="text-xs text-zinc-500">
                  {selectedRating[trackId] || track.my_rating
                    ? `선택된 별점: ★${selectedRating[trackId] || track.my_rating}.0점`
                    : '원하는 별점을 골라주세요'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => {
                  const cur =
                    selectedRating[trackId] !== undefined
                      ? selectedRating[trackId]
                      : track.my_rating || 0;
                  const isFilled = cur >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleSelectRating(trackId, star)}
                      className={`p-1 rounded-md transition-transform hover:scale-125 ${
                        isFilled
                          ? 'text-amber-400 bg-amber-400/10'
                          : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'
                      }`}
                    >
                      <Star className={`w-5 h-5 ${isFilled ? 'fill-amber-400' : ''}`} />
                    </button>
                  );
                })}
                {(selectedRating[trackId] || track.my_rating) > 0 && (
                  <span className="text-xs font-black text-amber-500 ml-1">
                    {(selectedRating[trackId] || track.my_rating).toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* 반응 태그 칩 */}
            <div className="space-y-1.5">
              <span className="font-bold text-zinc-700 dark:text-zinc-300 block text-xs">
                어울리는 태그 선택 (최대 3개)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const curTags =
                    selectedTags[trackId] !== undefined
                      ? selectedTags[trackId]
                      : track.my_tags || [];
                  const selected = curTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleTag(track, tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400'
                      }`}
                    >
                      #{tag} {selected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            {!track.comments_public && (
              <p className="text-xs text-zinc-400">
                올린 분이 반응을 '나만 보기'로 설정했어요. 남긴 한마디는 곡 주인에게만 전달돼요.
              </p>
            )}

            {/* 닉네임 + 한마디 입력 + 통합 등록 버튼 */}
            <div className="space-y-2 pt-1 border-t border-zinc-200/60 dark:border-white/5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="닉네임 (선택 / 기본: 익명 리스너)"
                  value={nicknameInput[trackId] || ''}
                  onChange={(e) =>
                    setNicknameInput({ ...nicknameInput, [trackId]: e.target.value })
                  }
                  className="sm:w-44 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="따뜻한 감상평이나 피드백 한마디를 적어주세요..."
                  value={commentInput[trackId] || ''}
                  onChange={(e) =>
                    setCommentInput({ ...commentInput, [trackId]: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitFeedback(track)}
                  className="flex-1 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSubmitFeedback(track)}
                  disabled={submittingReaction[trackId]}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm disabled:opacity-50 font-bold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingReaction[trackId] ? '등록 중...' : '피드백 등록하기'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 펼침 영역 2 — 공개된 한마디 목록 */}
        {isCommentsOpen && track.comments_public && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 space-y-2.5 text-xs">
            {detail.loading ? (
              <p className="text-zinc-400">한마디를 불러오는 중...</p>
            ) : commentsList.length === 0 ? (
              <p className="text-zinc-400">아직 남겨진 한마디가 없어요. 첫 한마디를 남겨 보세요!</p>
            ) : (
              <>
                <div className="space-y-2">
                  {visibleComments.map((fb) => (
                    <div
                      key={fb.id}
                      className="p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-200/70 dark:border-white/5 flex items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            {fb.nickname || '익명'}
                          </span>
                          {fb.rating && (
                            <span className="text-amber-500 font-bold text-xs">
                              ★{fb.rating}
                            </span>
                          )}
                          <span className="text-xs text-zinc-400">
                            {(fb.created_at || '').slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300 break-words">
                          {fb.comment}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentReportFor(
                            commentReportFor?.feedbackId === fb.id
                              ? null
                              : { trackId, feedbackId: fb.id }
                          )
                        }
                        className="text-xs text-zinc-400 hover:text-rose-500 flex-shrink-0"
                      >
                        신고
                      </button>
                    </div>
                  ))}
                </div>

                {commentReportFor?.trackId === trackId && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                    <span className="font-bold text-rose-700 dark:text-rose-300">
                      한마디 신고 사유:
                    </span>
                    {Object.entries(REPORT_REASONS).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          handleReportComment(trackId, commentReportFor.feedbackId, k)
                        }
                        className="px-2 py-0.5 rounded-full border border-rose-300 text-rose-700 dark:text-rose-300"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {commentsList.length > 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      setTrackDetails((prev) => ({
                        ...prev,
                        [trackId]: {
                          ...prev[trackId],
                          showAll: !prev[trackId]?.showAll,
                        },
                      }))
                    }
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    {detail.showAll
                      ? '한마디 접기 ▴'
                      : `한마디 ${commentsList.length - 3}개 더 보기 ▾`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-20">
      {/* Community Header Banner */}
      <div className="w-full max-w-5xl mx-auto glass-panel rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-gradient-to-r from-indigo-50/70 via-white to-white dark:from-indigo-950/30 dark:via-[#121215] dark:to-[#121215] border-indigo-200 dark:border-indigo-500/20 shadow-sm relative overflow-hidden">
        {/* Background Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="space-y-3 max-w-2xl relative z-10 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {onGoToStudio && (
              <button
                type="button"
                onClick={onGoToStudio}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100/90 hover:bg-indigo-200 dark:bg-indigo-900/60 dark:hover:bg-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-bold transition-all shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>발매 준비로 돌아가기</span>
              </button>
            )}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>발매 전/후 리스너 반응 공간</span>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            '들어봐' 피드백 커뮤니티
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            발매를 앞둔 자작곡을 미리 들려주고 동료 창작자들과 리스너들의 생생한 별점(1인 1표)과 한마디를 받아보세요.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto flex-shrink-0 relative z-10">
          <button
            onClick={() => setShowQuickModal(true)}
            className="btn-secondary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-4 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white shadow-sm font-bold"
          >
            <PlusCircle className="w-4 h-4 text-indigo-500" />
            <span>AI 없이 곡만 바로 올리기</span>
          </button>

          <button
            onClick={onStartNewRelease}
            className="btn-primary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-5 shadow-md font-bold"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span>정규 발매 패키징 시작</span>
          </button>
        </div>
      </div>

      {/* D8-1: 상단 정렬(최신/인기/랜덤) · 장르 필터 · 검색 바 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {[
            { id: 'new', label: '최신순' },
            { id: 'popular', label: '인기/재생순' },
            { id: 'rating', label: '별점 높은순', icon: Star },
            { id: 'reactions', label: '반응 많은순', icon: MessageSquare },
            { id: 'random', label: '랜덤 발견', icon: Shuffle },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'random' && sort === 'random') {
                    fetchTracks({ reset: true, nextOffset: 0, customSort: 'random' });
                  } else {
                    setSort(tab.id);
                  }
                }}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  sort === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900/60'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
              </button>
            );
          })}

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/10"
          >
            {GENRE_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        {/* 검색창 + 총 곡 수 */}
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedQuery(searchQuery.trim());
            }}
            className="relative flex-1 sm:w-60"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="제목·아티스트 검색..."
              className="w-full pl-8 pr-14 py-2 rounded-xl text-xs bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            {appliedQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setAppliedQuery('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-700"
              >
                초기화
              </button>
            ) : (
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-600 dark:text-indigo-400"
              >
                검색
              </button>
            )}
          </form>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold whitespace-nowrap">
            총 {total}곡
          </span>

          {/* 뷰 모드 토글: 카드 뷰 vs 리스트 뷰 (피드백 반영) */}
          <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 items-center">
            <button
              type="button"
              onClick={() => handleToggleViewMode('card')}
              title="카드 뷰로 보기"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">카드</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('list')}
              title="리스트 뷰로 보기"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">리스트</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && tracks.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
          조건에 맞는 곡이 없어요. 첫 번째로 곡을 올려 보세요!
        </p>
      )}

      {/* D8-2: 트랙 피드: 카드 뷰 (기본) vs 리스트 뷰 (토글 지원) */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {tracks.map((track) => {
            const trackId = track.track_id;
            const isCurrentTrack = playingTrack?.track_id === trackId;
            const isTrackPlaying = isCurrentTrack && isPlaying;
            const cover = toFileUrl(track.cover_url);
            const isReactionOpen = openReactionId === trackId;
            const isCommentsOpen = openCommentsId === trackId;
            const detail = trackDetails[trackId] || {};
            const commentsList = detail.feedback || [];
            const commentCount = Math.max(track.comment_count || 0, commentsList.length);

            return (
              <motion.div
                key={trackId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-panel rounded-2xl p-5 space-y-3.5 transition-all shadow-sm border ${
                  isTrackPlaying
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30'
                    : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                {/* 상단: 커버 + 곡 정보 + 별점 요약 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 group shadow-md border border-zinc-200 dark:border-white/10">
                      <img src={cover} alt={track.title} className="w-full h-full object-cover" />
                      <button
                        onClick={() => togglePlay(track)}
                        className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center text-white transition-opacity"
                      >
                        {isTrackPlaying ? (
                          <Pause className="w-6 h-6 text-indigo-400 fill-current" />
                        ) : (
                          <Play className="w-6 h-6 text-white fill-current translate-x-0.5" />
                        )}
                      </button>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                          {track.genre || 'Indie'}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {track.listen_mode === 'highlight'
                            ? `${Math.round(track.clip_sec || 15)}초 하이라이트`
                            : '전곡'}
                        </span>
                        {track.ai_usage === 'generated' && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">
                            AI 활용
                          </span>
                        )}
                      </div>
                      <h3 className="font-extrabold text-base text-zinc-900 dark:text-white truncate">
                        {track.title}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  {/* 우측 별점 & 재생 수 */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {track.stats?.rating_avg ? Number(track.stats.rating_avg).toFixed(1) : '-'}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500 text-xs">
                        ({track.stats?.rating_count || 0}명)
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400">
                      재생 {track.plays || 0} · 반응 {track.reactions || 0}
                    </span>
                  </div>
                </div>

                {/* 한 줄 소개 */}
                {track.intro && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-[#121215] px-3 py-2 rounded-xl border border-zinc-200/70 dark:border-white/5 line-clamp-2">
                    "{track.intro}"
                  </p>
                )}

                {/* 상위 태그 3개 뱃지 */}
                {topTags(track).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {topTags(track).map(([tag, n]) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/5"
                      >
                        #{tag} <b className="text-indigo-600 dark:text-indigo-400">{n}</b>
                      </span>
                    ))}
                  </div>
                )}

                {notice[trackId] && (
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                    {notice[trackId]}
                  </p>
                )}

                {/* 카드 하단 액션 버튼 바 */}
                <div className="pt-2 border-t border-zinc-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReactionId(isReactionOpen ? null : trackId)
                      }
                      className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                        isReactionOpen || track.my_rating
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {track.my_rating ? `내 별점 ★${track.my_rating}` : '반응 남기기'}
                      </span>
                      {isReactionOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {track.comments_public && (
                      <button
                        type="button"
                        onClick={() => toggleComments(trackId)}
                        className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                          isCommentsOpen
                            ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>한마디 {commentCount}개</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleShareTrack(track)}
                      className="px-2.5 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
                    >
                      {copiedTrackId === trackId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 font-bold">복사됨</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>공유</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportFor(reportFor === trackId ? null : trackId)}
                      className="text-zinc-400 hover:text-rose-500 flex items-center gap-1"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>신고</span>
                    </button>
                  </div>
                </div>

                {/* 반응, 한마디, 신고 드로어 */}
                {renderDrawers(track)}
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* 리스트 뷰 (리스트 형식 - 피드백 반영) */
        <div className="space-y-3">
          {tracks.map((track, idx) => {
            const trackId = track.track_id;
            const isCurrentTrack = playingTrack?.track_id === trackId;
            const isTrackPlaying = isCurrentTrack && isPlaying;
            const cover = toFileUrl(track.cover_url);
            const isReactionOpen = openReactionId === trackId;
            const isCommentsOpen = openCommentsId === trackId;
            const detail = trackDetails[trackId] || {};
            const commentsList = detail.feedback || [];
            const commentCount = Math.max(track.comment_count || 0, commentsList.length);

            return (
              <motion.div
                key={trackId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-panel rounded-2xl p-3.5 sm:p-4 space-y-3 transition-all shadow-sm border ${
                  isTrackPlaying
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30'
                    : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-3 sm:gap-4">
                  {/* Left: Index / Thumbnail / Info */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <span className="text-xs font-mono font-bold text-zinc-400 w-5 text-center flex-shrink-0">
                      {idx + 1}
                    </span>

                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden flex-shrink-0 group shadow-md border border-zinc-200 dark:border-white/10">
                      <img src={cover} alt={track.title} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => togglePlay(track)}
                        className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center text-white transition-opacity"
                      >
                        {isTrackPlaying ? (
                          <Pause className="w-5 h-5 text-indigo-400 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                        )}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* 곡 제목: 모바일 화면에서도 잘리지 않도록 단독 전체 폭 라인으로 노출 (은희님 피드백 해결) */}
                      <h3
                        className="font-extrabold text-sm sm:text-base text-zinc-900 dark:text-white truncate block w-full"
                        title={track.title}
                      >
                        {track.title}
                      </h3>

                      {/* 아티스트명 & 배지들 (2번째 줄에 유연하게 배치) */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[110px] sm:max-w-xs">
                          {track.artist}
                        </span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 flex-shrink-0">
                          {track.genre || 'Indie'}
                        </span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex-shrink-0">
                          {track.listen_mode === 'highlight'
                            ? `${Math.round(track.clip_sec || 15)}초`
                            : '전곡'}
                        </span>
                        {track.ai_usage === 'generated' && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 flex-shrink-0">
                            AI
                          </span>
                        )}
                      </div>
                      {track.intro && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate hidden lg:block">
                          "{track.intro}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Rating, Plays & Action Buttons (모바일 여백 최적화) */}
                  <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {track.stats?.rating_avg ? Number(track.stats.rating_avg).toFixed(1) : '-'}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500 text-xs hidden sm:inline">
                        ({track.stats?.rating_count || 0})
                      </span>
                    </div>

                    <span className="hidden md:inline-block text-xs text-zinc-400 min-w-[50px] text-right">
                      ▶ {track.plays || 0}
                    </span>

                    <button
                      type="button"
                      onClick={() => setOpenReactionId(isReactionOpen ? null : trackId)}
                      className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                        isReactionOpen || track.my_rating
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                      <span className="hidden sm:inline">
                        {track.my_rating ? `★${track.my_rating}` : '반응'}
                      </span>
                      {isReactionOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {track.comments_public && (
                      <button
                        type="button"
                        onClick={() => toggleComments(trackId)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                          isCommentsOpen
                            ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 shadow-sm'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{commentCount}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleShareTrack(track)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                      title="공유"
                    >
                      {copiedTrackId === trackId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Drawers */}
                {renderDrawers(track)}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 더 보기 페이지네이션 버튼 */}
      {tracks.length < total && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => fetchTracks({ reset: false, nextOffset: tracks.length })}
            disabled={loadingMore}
            className="btn-secondary text-xs sm:text-sm px-6 py-3 font-bold shadow-sm"
          >
            {loadingMore ? '불러오는 중...' : `더 보기 (${tracks.length} / ${total}곡)`}
          </button>
        </div>
      )}

      {/* D8-5: 하단 고정 미니 오디오 플레이어 바 (은희님 피드백: body 포털로 스크롤 상관없이 뷰포트 하단에 항상 고정) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {playingTrack && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-t border-zinc-200 dark:border-white/10 shadow-2xl px-4 py-3"
              >
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={toFileUrl(playingTrack.cover_url)}
                      alt={playingTrack.title}
                      className="w-11 h-11 rounded-lg object-cover border border-zinc-200 dark:border-white/10 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-500 animate-pulse flex-shrink-0" />
                        <p className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-white truncate">
                          {playingTrack.title}
                        </p>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {playingTrack.artist} ·{' '}
                        {playingTrack.listen_mode === 'highlight' ? '15초 하이라이트' : '전곡 재생'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-1 max-w-md">
                    <button
                      type="button"
                      onClick={() => togglePlay(playingTrack)}
                      className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 shadow"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current translate-x-0.5" />
                      )}
                    </button>

                    <span className="text-xs font-mono text-zinc-500 w-10 text-right">
                      {formatTime(audioProgress.current)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, audioProgress.duration)}
                      step={0.1}
                      value={audioProgress.current}
                      onChange={(e) => {
                        const nextTime = Number(e.target.value);
                        if (audioRef.current) {
                          audioRef.current.currentTime = nextTime;
                          setAudioProgress((prev) => ({ ...prev, current: nextTime }));
                        }
                      }}
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-zinc-500 w-10">
                      {formatTime(audioProgress.duration)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={stopMiniPlayer}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                    title="플레이어 닫기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

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
                <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">
                  AI 분석 없이 곡 바로 올리기
                </h3>
                <button
                  onClick={closeQuick}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {quickDone ? (
                <div className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    공개했어요! 아래 관리 링크를 꼭 저장해 두세요.
                  </p>
                  <p>
                    이 링크가 있어야 받은 반응(비공개 포함)을 보고, 설정을 바꾸고, 곡을 내릴 수 있어요.
                  </p>
                  <code className="block break-all p-2 rounded bg-zinc-100 dark:bg-zinc-900">
                    {toFileUrl(quickDone.manage_url)}
                  </code>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(toFileUrl(quickDone.manage_url))}
                      className="btn-secondary text-xs px-4 py-2"
                    >
                      링크 복사
                    </button>
                    <button
                      type="button"
                      onClick={closeQuick}
                      className="btn-primary text-xs px-4 py-2"
                    >
                      닫기
                    </button>
                  </div>
                  <SurveyPanel kind="track" id={quickDone.track_id} ownerKey={quickDone.owner_key} />
                </div>
              ) : (
                <form onSubmit={handleQuickSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        음원 파일 (.mp3, .wav) *
                      </label>
                      <input
                        type="file"
                        accept="audio/*,.mp3,.wav"
                        onChange={(e) => setQuickFile(e.target.files?.[0])}
                        className="w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        커버 이미지 (선택)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setQuickCover(e.target.files?.[0])}
                        className="w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-200 dark:file:bg-zinc-800 file:text-zinc-800 dark:file:text-zinc-200 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        곡 제목 *
                      </label>
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
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        아티스트명 *
                      </label>
                      <input
                        type="text"
                        value={quickArtist}
                        onChange={(e) => setQuickArtist(e.target.value)}
                        placeholder="아티스트명"
                        className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                        장르
                      </label>
                      <select
                        value={quickGenre}
                        onChange={(e) => setQuickGenre(e.target.value)}
                        className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
                      >
                        {GENRE_OPTIONS.filter((g) => g.value).map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      리스너에게 전하는 한마디
                    </label>
                    <textarea
                      rows={2}
                      value={quickDesc}
                      onChange={(e) => setQuickDesc(e.target.value)}
                      placeholder="어떤 부분에 집중해서 들어줬으면 좋겠는지 적어주세요."
                      className="w-full bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-white resize-none"
                    />
                  </div>

                  <div className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="w-16">들려줄 범위</b>
                      {[
                        ['highlight', '하이라이트 15초'],
                        ['full', '전곡'],
                      ].map(([v, l]) => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => setQuickMode(v)}
                          className={`px-3 py-1 rounded-full border ${
                            quickMode === v
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-zinc-300 dark:border-white/10'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="w-16">반응 공개</b>
                      {[
                        [true, '모두에게 공개'],
                        [false, '나만 보기'],
                      ].map(([v, l]) => (
                        <button
                          type="button"
                          key={l}
                          onClick={() => setQuickPublic(v)}
                          className={`px-3 py-1 rounded-full border ${
                            quickPublic === v
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-zinc-300 dark:border-white/10'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="w-16">AI 사용</b>
                      {[
                        ['none', '안 썼어요'],
                        ['tool', '도구로만'],
                        ['generated', 'AI가 곡·목소리를 만듦'],
                      ].map(([v, l]) => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => setQuickAi(v)}
                          className={`px-3 py-1 rounded-full border ${
                            quickAi === v
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-zinc-300 dark:border-white/10'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    <div
                      className={`p-3 rounded-xl space-y-2 ${
                        quickError && (!quickConsent.rights || !quickConsent.public)
                          ? 'ring-2 ring-rose-500 bg-rose-50/50 dark:bg-rose-500/10'
                          : 'bg-zinc-50 dark:bg-[#18181b]'
                      }`}
                    >
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quickConsent.rights}
                          onChange={(e) =>
                            setQuickConsent((c) => ({ ...c, rights: e.target.checked }))
                          }
                          className="mt-0.5"
                        />
                        <span>[필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quickConsent.public}
                          onChange={(e) =>
                            setQuickConsent((c) => ({ ...c, public: e.target.checked }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          [필수] 커뮤니티에 공개하고, 내가 내릴 때까지(서비스 종료일 2026-10-31까지) 보관돼요. 듣는 사람의 반응과 접속 IP(도배 방지용, 7일 보관)가 모여요.
                        </span>
                      </label>
                    </div>
                  </div>

                  {quickError && (
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      {quickError}
                    </p>
                  )}
                  {quickKnown && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2 text-xs">
                      <p>{quickKnown}</p>
                      <button
                        type="button"
                        onClick={() => handleQuickSubmit(null, true)}
                        disabled={quickUploading}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
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
