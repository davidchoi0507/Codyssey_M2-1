import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, LogIn, LogOut, Disc3, ExternalLink } from 'lucide-react';
import { api, tokenStorage, toFileUrl } from '../../services/api';

export default function MyTracksModal({ isOpen, onClose, user, setUser, onSelectJob }) {
  const [loading, setLoading] = useState(false);
  const [myData, setMyData] = useState(null);

  useEffect(() => {
    if (isOpen && tokenStorage.get()) {
      fetchMyInfo();
    }
  }, [isOpen]);

  const fetchMyInfo = async () => {
    setLoading(true);
    try {
      const me = await api.getMe();
      const [jobs, tracks] = await Promise.all([api.getMyJobs(), api.getMyTracks()]);
      setMyData({ jobs, tracks });
      setUser(me);
    } catch (err) {
      console.error(err);
      tokenStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (provider) => {
    window.location.href = api.getLoginUrl(provider, window.location.href);
  };

  const handleLogout = () => {
    api.logout().catch(() => {});
    tokenStorage.clear();
    setUser(null);
    setMyData(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-6 bg-white dark:bg-[#0c1017] border border-zinc-200 dark:border-white/10 shadow-2xl text-zinc-900 dark:text-zinc-100 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">내 곡 & 계정 관리</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white font-bold text-lg p-1 rounded-lg">✕</button>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">로그인 계정</span>
                <p className="font-bold text-zinc-900 dark:text-white text-base">{user.nickname || '창작자'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-500 flex items-center gap-1 font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>로그아웃</span>
              </button>
            </div>

            {/* My Tracks List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">내 발매 작업 기록 (7일 뒤 삭제)</span>
              {myData?.jobs?.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {myData.jobs.map((job) => (
                    <div
                      key={job.job_id}
                      onClick={() => {
                        onSelectJob(job);
                        onClose();
                      }}
                      className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/5 hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-zinc-900/50 cursor-pointer flex items-center justify-between transition-all"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Disc3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{job.title || '작업 중인 곡'}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold">
                        {job.stage_label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 py-6 text-center">아직 등록된 발매 작업이 없습니다.</p>
              )}
            </div>

            {/* 커뮤니티에 올린 곡 — 관리 링크로 반응 보기·설정·내리기 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">커뮤니티에 올린 곡</span>
              {myData?.tracks?.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {myData.tracks.map((t) => (
                    <a
                      key={t.track_id}
                      href={toFileUrl(t.manage_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/5 hover:border-indigo-500/50 flex items-center justify-between gap-3 transition-all"
                    >
                      <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{t.title}</span>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1 flex-shrink-0">재생 {t.plays} · 반응 {t.reactions} <ExternalLink className="w-3 h-3" /></span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 py-3 text-center">아직 올린 곡이 없습니다.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              소셜 로그인으로 내 작업 진행 상황을 안전하게 보관하고,<br />
              커뮤니티에 공개한 내 곡들을 한 번에 관리하세요.
            </p>

            <div className="space-y-2.5 pt-2 max-w-xs mx-auto">
              <button
                onClick={() => handleLogin('kakao')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <span>💬 카카오로 3초 만에 시작하기</span>
              </button>

              <button
                onClick={() => handleLogin('google')}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-50 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-zinc-200 shadow-sm"
              >
                <span>🌐 구글 계정으로 로그인</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">닉네임 정보만 저장되며, 비밀번호나 개인정보는 수집하지 않습니다.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

