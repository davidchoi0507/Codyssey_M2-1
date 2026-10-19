import React, { useState, useEffect } from 'react';
import { User, LogOut, Disc3, ExternalLink, Plus, RotateCcw, ArrowDownToLine, Trash2, AlertCircle, CheckCircle2, Loader2, Copy, X } from 'lucide-react';
import { api, tokenStorage, toFileUrl, localJobsStorage, stepForStage, SERVICE_END_DATE } from '../../services/api';
import { copyToClipboard, toAppUrl } from '../../utils/clipboard';

function stagePill(stage, stageLabel) {
  if (stage === 'done') {
    return <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">{stageLabel || '완성'}</span>;
  }
  if (stage === 'failed') {
    return <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300">{stageLabel || '실패'}</span>;
  }
  return <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">{stageLabel || '진행 중'}</span>;
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MyTracksModal({
  isOpen = true,
  asPage = false,
  onClose,
  user,
  setUser,
  onSelectJob,
  onStartNewJob,
  onGoToCommunity,
}) {
  const [loading, setLoading] = useState(false);
  const [myData, setMyData] = useState({ jobs: [], tracks: [] });
  const [browserJobs, setBrowserJobs] = useState([]);
  const [publishedLocalTracks, setPublishedLocalTracks] = useState([]);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'published' | 'draft'
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState(null);
  const [deleteNotice, setDeleteNotice] = useState(null);

  useEffect(() => {
    if (!isOpen && !asPage) return;
    refreshAll();
  }, [isOpen, asPage, user?.user_id]);

  const handleRemovePublishedTrack = (trackId) => {
    const next = publishedLocalTracks.filter((pt) => pt.track_id !== trackId);
    setPublishedLocalTracks(next);
    try {
      localStorage.setItem('balmaero_published_tracks', JSON.stringify(next));
    } catch {}
  };

  const refreshBrowserJobs = async (serverTracks = []) => {
    const list = localJobsStorage.list();
    setBrowserJobs(list);

    // 원일님 피드백 & 은희님 피드백: localStorage에 저장된 공개 곡 관리 링크 검증 및 동기화
    try {
      const rawPub = localStorage.getItem('balmaero_published_tracks');
      let pubList = rawPub ? JSON.parse(rawPub) : [];

      // 1. 이미 로그인된 사용자의 /me/tracks 에 있는 곡은 '이 브라우저에서 공개한 곡'에서 제외 (중복 표시 방지)
      const myTrackIds = new Set((serverTracks || []).map((t) => t.track_id));
      if (myTrackIds.size > 0) {
        pubList = pubList.filter((pt) => !myTrackIds.has(pt.track_id));
      }

      setPublishedLocalTracks(pubList);

      // 2. 서버에서 삭제된 곡(404) 검증 및 제목·아티스트 변경사항 실시간 최신화
      const verifiedList = [];
      await Promise.all(
        pubList.map(async (pt) => {
          if (!pt.track_id) return;
          try {
            const track = await api.getCommunityTrackDetail(pt.track_id);
            if (track) {
              verifiedList.push({
                ...pt,
                title: track.title || pt.title,
                artist: track.artist || pt.artist,
              });
            }
          } catch (err) {
            // 404이면 서버에서 삭제된 곡이므로 목록에서 자동 제외
            if (err.status === 404 || err.code === 'NOT_FOUND') {
              return;
            }
            verifiedList.push(pt);
          }
        })
      );

      setPublishedLocalTracks(verifiedList);
      localStorage.setItem('balmaero_published_tracks', JSON.stringify(verifiedList));
    } catch {
      setPublishedLocalTracks([]);
    }

    // 최신 상태를 백그라운드로 갱신
    const updated = await Promise.all(
      list.slice(0, 15).map(async (j) => {
        try {
          const st = await api.getJobStatus(j.job_id);
          const next = { ...j, stage: st.stage, stage_label: st.stage_label };
          localJobsStorage.upsert(next);
          return next;
        } catch {
          return j;
        }
      })
    );
    if (updated.length) setBrowserJobs(localJobsStorage.list());
  };

  const handleCopyUrl = async (url, key) => {
    if (!url) return;
    const fullUrl = toAppUrl(url);
    const ok = await copyToClipboard(fullUrl);
    if (ok) {
      setCopiedUrl(key);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  const refreshAll = async () => {
    setError(null);
    setLoading(true);
    let serverTracks = [];
    try {
      const me = await api.getMe();
      setUser(me);
      const [jobs, tracks] = await Promise.all([api.getMyJobs(), api.getMyTracks()]);
      serverTracks = tracks || [];
      setMyData({ jobs: jobs || [], tracks: serverTracks });
    } catch {
      // 비로그인 상태
      setUser(null);
      setMyData({ jobs: [], tracks: [] });
    } finally {
      await refreshBrowserJobs(serverTracks);
      setLoading(false);
    }
  };

  const handleLogin = (provider) => {
    // 백엔드 safe_next 가 허용하는 오리진은 http://localhost:3000 및 https://api.201.n-e.kr
    const returnUrl = window.location.origin + import.meta.env.BASE_URL;
    const loginUrl = api.getLoginUrl(provider, returnUrl);

    // 팝업 창 중앙 배치
    const w = 500;
    const h = 650;
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);

    const popup = window.open(
      loginUrl,
      `balmaero_oauth_${provider}`,
      `width=${w},height=${h},top=${top},left=${left},status=no,menubar=no,toolbar=no`
    );

    // 브라우저 설정으로 팝업이 차단된 경우 현재 창 이동으로 fallback
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = loginUrl;
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    tokenStorage.clear();
    setUser(null);
    setMyData({ jobs: [], tracks: [] });
  };

  const handleWithdraw = async () => {
    if (!window.confirm('정말 탈퇴하시겠어요? 로그인 정보가 삭제되며, 커뮤니티에 올린 곡은 저장해 둔 관리 링크로만 관리할 수 있습니다.')) return;
    try {
      await api.withdraw();
      tokenStorage.clear();
      setUser(null);
      setMyData({ jobs: [], tracks: [] });
    } catch (err) {
      setError(err.message);
    }
  };

  // B6: 이 브라우저에서 연 작업(로그인 전)을 내 계정으로 가져오기
  const handleClaimBrowserJobs = async () => {
    setClaiming(true);
    setClaimMsg(null);
    setError(null);
    try {
      const res = await api.claimJobs(localJobsStorage.ids());
      setClaimMsg(`작업 ${res.jobs || 0}건, 공개 곡 ${res.tracks || 0}건을 내 계정으로 가져왔어요.`);
      await refreshAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleOpenJob = (job) => {
    const step = stepForStage(job.stage);
    if (onSelectJob) onSelectJob(job, step);
    if (onClose && !asPage) onClose();
  };

  const handleRetryJob = async (job, e) => {
    e?.stopPropagation();
    setRetryingId(job.job_id);
    setError(null);
    try {
      const st = await api.retryJob(job.job_id);
      const updated = { ...job, stage: st.stage, stage_label: st.stage_label };
      localJobsStorage.upsert(updated);
      handleOpenJob(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteJob = async (jobId, e) => {
    e?.stopPropagation();
    setDeletingJobId(jobId);
    setError(null);
    setDeleteNotice(null);
    try {
      const res = await api.deleteJob(jobId);
      localJobsStorage.remove(jobId);
      if (res?.track_kept) {
        setDeleteNotice('작업 기록이 삭제되었습니다. (커뮤니티에 공개된 곡은 관리 링크에서 내릴 수 있어요)');
      } else {
        setDeleteNotice('작업이 삭제되었습니다.');
      }
      await refreshAll();
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err) {
      if (err.status === 409 || err.code === 'JOB_BUSY') {
        setError('작업이 진행 중이어서 지금은 삭제할 수 없어요.');
      } else if (err.status === 403 || err.code === 'NOT_OWNER') {
        setError('이 작업을 삭제할 권한이 없어요.');
      } else {
        setError(err.message || '작업을 삭제하지 못했어요.');
      }
    } finally {
      setDeletingJobId(null);
      setConfirmDeleteJobId(null);
    }
  };

  const handleDeleteAllJobs = async () => {
    if (!window.confirm('진행 중인 작업을 제외하고 내 모든 발매 준비 작업을 지울까요? (커뮤니티에 공개한 곡은 유지됩니다)')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.deleteMyJobs();
      if (res?.tracks_kept) {
        setDeleteNotice('모든 작업이 삭제되었습니다. (커뮤니티에 공개한 곡은 관리 링크에서 관리할 수 있어요)');
      } else {
        setDeleteNotice('모든 발매 준비 작업이 삭제되었습니다.');
      }
      await refreshAll();
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err) {
      setError(err.message || '작업을 삭제하지 못했어요.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !asPage) return null;

  const myJobIds = new Set((myData.jobs || []).map((j) => j.job_id));
  const unclaimedBrowserJobs = user
    ? browserJobs.filter((j) => !myJobIds.has(j.job_id))
    : browserJobs;

  const content = (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Page / Modal Header */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            {user ? (
              <>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {user.provider === 'kakao' ? '카카오 로그인' : user.provider === 'google' ? '구글 로그인' : '로그인 계정'}
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white">
                  {user.nickname || '창작자'} 님의 곡
                </h2>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">비로그인 상태</span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white">
                  내 곡 & 발매 작업 모아보기
                </h2>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <button
                onClick={handleLogout}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>로그아웃</span>
              </button>
              <button
                onClick={handleWithdraw}
                className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>탈퇴</span>
              </button>
            </>
          )}
          {!asPage && onClose && (
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white font-bold text-lg p-1.5 rounded-lg">
              ✕
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {claimMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{claimMsg}</span>
        </div>
      )}

      {deleteNotice && (
        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{deleteNotice}</span>
        </div>
      )}

      {/* 비로그인 안내 및 로그인 버튼 */}
      {!user && (
        <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-5 text-center">
          <div className="space-y-1.5">
            <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white">
              로그인하면 어느 기기에서나 내 곡과 작업을 모아볼 수 있어요
            </h3>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              로그인하지 않아도 모든 기능을 쓸 수 있어요. 단, 비로그인 시에는 <b>관리 링크</b>를 꼭 저장해 두세요.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <button
              onClick={() => handleLogin('kakao')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span>💬 카카오로 로그인</span>
            </button>

            <button
              onClick={() => handleLogin('google')}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-50 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-zinc-200 shadow-sm"
            >
              <span>🌐 구글 계정으로 로그인</span>
            </button>
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            닉네임과 고유 식별값만 수집하며, 서비스 종료일({SERVICE_END_DATE})에 모두 삭제됩니다.
          </p>
        </div>
      )}

      {/* 탭 필터: 전체 | 커뮤니티 등록 곡 (LIVE) | 발매 준비 중 (미등록) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10">
        {[
          {
            id: 'all',
            label: '전체 보기',
            count:
              (myData.tracks?.length || 0) +
              (myData.jobs?.length || 0) +
              (publishedLocalTracks.length || 0) +
              (unclaimedBrowserJobs.length || 0),
          },
          {
            id: 'published',
            label: '🟢 커뮤니티 등록 곡 (LIVE)',
            count: (myData.tracks?.length || 0) + (publishedLocalTracks.length || 0),
          },
          {
            id: 'draft',
            label: '📝 발매 준비 중 (미등록)',
            count:
              (myData.jobs?.filter((j) => !j.track_id).length || 0) +
              (unclaimedBrowserJobs.length || 0),
          },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === tab.id
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                filterTab === tab.id
                  ? 'bg-white/25 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 은희님 피드백 & 원일님 PDF 3/4페이지: 비로그인 공개 곡 관리 링크 분실 복구 UI */}
      {(filterTab === 'all' || filterTab === 'published') && publishedLocalTracks.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 border-emerald-200/80 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-white/5">
            <div>
              <h3 className="font-extrabold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>이 브라우저에서 공개한 곡 (관리 링크)</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                로그인하지 않고 공개했던 곡들의 관리 링크예요. 링크를 복사하거나 열어서 반응을 확인하고 설정을 바꿀 수 있어요.
              </p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              {publishedLocalTracks.length}곡 저장됨
            </span>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-white/5">
            {publishedLocalTracks.map((pt, idx) => (
              <div key={idx} className="py-3 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {pt.title || '제목 없음'}
                    </span>
                    {pt.artist && (
                      <span className="text-xs text-zinc-500 truncate">· {pt.artist}</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">
                    {formatShortDate(pt.published_at)} 공개
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(pt.manage_url, `local-pub-${idx}`)}
                    className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 shadow-sm"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedUrl === `local-pub-${idx}` ? '복사됨 ✓' : '관리 링크 복사'}</span>
                  </button>
                  <a
                    href={toAppUrl(pt.manage_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shadow-sm font-bold"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>열기</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemovePublishedTrack(pt.track_id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="이 목록에서 삭제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 로그인 시: 1) 커뮤니티에 올린 곡 */}
      {user && (filterTab === 'all' || filterTab === 'published') && (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>커뮤니티에 올린 곡</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">카드를 누르면 관리 화면(반응 보기·공개 설정·곡 내리기)이 열려요.</p>
            </div>
            {onGoToCommunity && (
              <button
                onClick={onGoToCommunity}
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>곡 올리기</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>불러오는 중...</span>
            </div>
          ) : myData.tracks?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {myData.tracks.map((t) => (
                <a
                  key={t.track_id}
                  href={toAppUrl(t.manage_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-3.5 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 hover:border-indigo-500/50 transition-all space-y-2.5 shadow-sm"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 relative">
                    <img
                      src={toFileUrl(t.cover_url)}
                      alt={t.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/65 text-white text-xs font-semibold flex items-center gap-1">
                      <span>관리</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-zinc-900 dark:text-white truncate">{t.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{t.artist}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100 dark:border-white/5">
                    {t.status && t.status !== 'live' ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {t.status === 'reported' ? '신고로 숨겨짐 (확인 중)' : '숨겨짐'}
                      </span>
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                        ▶ {t.plays} · 반응 {t.reactions}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{formatShortDate(t.created_at)}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 py-6 text-center">
              아직 커뮤니티에 올린 곡이 없어요.
            </p>
          )}
        </div>
      )}

      {/* 로그인 시: 2) 내 계정의 발매 준비 작업 */}
      {user && (filterTab === 'all' || filterTab === 'draft') && (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span>발매 준비 작업</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                작업(음원·결과물)은 서비스 종료일({SERVICE_END_DATE})에 모두 지워져요. 커뮤니티에 올린 곡은 내릴 때까지(종료일까지) 남아요.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {myData.jobs?.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllJobs}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/10 hover:bg-rose-100 text-xs font-bold text-rose-600 dark:text-rose-400 transition-colors"
                >
                  작업 전체 삭제
                </button>
              )}
              {onStartNewJob && (
                <button
                  onClick={onStartNewJob}
                  className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 곡</span>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>불러오는 중...</span>
            </div>
          ) : (filterTab === 'draft' ? myData.jobs?.filter((j) => !j.track_id) : myData.jobs)?.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-white/5">
              {(filterTab === 'draft' ? myData.jobs.filter((j) => !j.track_id) : myData.jobs).map((job) => (
                <div
                  key={job.job_id}
                  onClick={() => handleOpenJob(job)}
                  className="py-3 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-zinc-400 w-11 flex-shrink-0">
                      {formatShortDate(job.created_at)}
                    </span>
                    <Disc3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white truncate block">
                        {job.title || '제목 없음'}
                      </span>
                      {job.artist && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate block">
                           {job.artist}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 커뮤니티 등록 여부 명확한 배지 (피드백 반영) */}
                    {job.track_id ? (
                      <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        🟢 커뮤니티 등록됨
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        📝 미등록 (작업 중)
                      </span>
                    )}
                    {stagePill(job.stage, job.stage_label)}
                    {job.stage === 'failed' ? (
                      <button
                        type="button"
                        onClick={(e) => handleRetryJob(job, e)}
                        disabled={retryingId === job.job_id}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>다시 시도</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenJob(job);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          job.stage === 'done'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200'
                            : 'bg-indigo-600 text-white hover:bg-indigo-500'
                        }`}
                      >
                        {job.stage === 'done' ? '열기' : '이어서'}
                      </button>
                    )}

                    {confirmDeleteJobId === job.job_id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteJob(job.job_id, e)}
                          disabled={deletingJobId === job.job_id}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm"
                        >
                          {deletingJobId === job.job_id ? '삭제 중...' : '정말 지울까요?'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteJobId(null);
                          }}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
                          title="취소"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteJobId(job.job_id);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        title="작업 삭제 (되돌릴 수 없음)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 py-6 text-center">
              아직 계정에 연결된 발매 준비 작업이 없어요.
            </p>
          )}
        </div>
      )}

      {/* 3) 이 브라우저에서 연 작업 (로그인 전 / 비로그인) + [내 계정으로 가져오기] */}
      {(filterTab === 'all' || filterTab === 'draft') && (unclaimedBrowserJobs.length > 0 || !user) && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 border-indigo-200/70 dark:border-indigo-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                {user ? '이 브라우저에서 연 작업 (로그인 전)' : '이 브라우저에서 작업한 곡'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {user
                  ? '로그인하기 전에 이 브라우저에서 올린 작업과 공개 곡을 내 계정으로 한 번에 가져올 수 있어요.'
                  : `이 브라우저에 기억된 작업이에요. 작업 파일은 서비스 종료일(${SERVICE_END_DATE})에 모두 지워져요.`}
              </p>
            </div>

            {user && (
              <button
                type="button"
                onClick={handleClaimBrowserJobs}
                disabled={claiming}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
              >
                {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
                <span>내 계정으로 가져오기</span>
              </button>
            )}
          </div>

          {unclaimedBrowserJobs.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-white/5">
              {unclaimedBrowserJobs.map((job) => (
                <div
                  key={job.job_id}
                  onClick={() => handleOpenJob(job)}
                  className="py-3 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-zinc-400 w-11 flex-shrink-0">
                      {formatShortDate(job.created_at)}
                    </span>
                    <Disc3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white truncate block">
                        {job.title || '제목 없음'}
                      </span>
                      {job.artist && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate block">
                          {job.artist}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {stagePill(job.stage, job.stage_label)}
                    {job.stage === 'failed' ? (
                      <button
                        type="button"
                        onClick={(e) => handleRetryJob(job, e)}
                        disabled={retryingId === job.job_id}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>다시 시도</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenJob(job);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                      >
                        {job.stage === 'done' ? '열기' : '이어서'}
                      </button>
                    )}

                    {confirmDeleteJobId === job.job_id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteJob(job.job_id, e)}
                          disabled={deletingJobId === job.job_id}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm"
                        >
                          {deletingJobId === job.job_id ? '삭제 중...' : '정말 지울까요?'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteJobId(null);
                          }}
                          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
                          title="취소"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteJobId(job.job_id);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        title="작업 삭제 (되돌릴 수 없음)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center space-y-3">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">이 브라우저에 저장된 작업이 아직 없어요.</p>
              {user && (
                <button
                  type="button"
                  onClick={handleClaimBrowserJobs}
                  disabled={claiming}
                  className="btn-secondary text-xs px-3.5 py-1.5 inline-flex items-center gap-1.5"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>익명 쿠키로 올린 작업·곡 찾아 가져오기</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (asPage) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl my-8">{content}</div>
    </div>
  );
}
