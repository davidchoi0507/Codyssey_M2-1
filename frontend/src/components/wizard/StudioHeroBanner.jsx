import React from 'react';
import { Sparkles, HelpCircle, Users, RotateCcw, ArrowRight, Disc3 } from 'lucide-react';

export default function StudioHeroBanner({
  jobData,
  currentStep = 1,
  onOpenGuide,
  onGoToCommunity,
  onStartNewJob,
}) {
  const isJobActive = Boolean(jobData?.jobId || jobData?.title);

  return (
    <div className="w-full max-w-5xl mx-auto glass-panel rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-gradient-to-r from-indigo-50/70 via-white to-white dark:from-indigo-950/30 dark:via-[#121215] dark:to-[#121215] border-indigo-200 dark:border-indigo-500/20 shadow-sm relative overflow-hidden">
      {/* Background Subtle Ambient Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Left Column: Title & Description & Feature Pills */}
      <div className="space-y-3 max-w-2xl relative z-10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>인디 뮤지션 원스톱 발매 패키징 스튜디오</span>
          </div>

          {isJobActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <span className={`w-2 h-2 rounded-full bg-emerald-500 ${currentStep === 4 ? '' : 'animate-pulse'}`}></span>
              <span>{currentStep === 4 ? '작업 완료' : '작업 중'}: {jobData.title || '새 곡'} (Step {currentStep}/4)</span>
            </span>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          음원 하나로 완성하는 나만의 정식 발매 패키지
        </h2>

        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          AI A&R 음악 분석부터 3000px 규격 앨범아트, 15초 숏폼 비디오, 글로벌 유통사(DistroKid / 국내 뮤즈플랫폼) 반려 방지 규격 검수까지 한 번에 완료하세요.
        </p>

        {/* Feature Highlights Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            '🎵 24-bit WAV 규격 검수',
            '🖼️ 3000×3000px 커버 아트',
            '🎬 Spotify Canvas 루프 영상',
            '🛡️ 저작권 10문항 자가진단',
            '📋 유통사 웹 제출 맞춤 시트 (.CSV)',
          ].map((tag, i) => (
            <span
              key={i}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Right Column: Action Buttons */}
      <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto flex-shrink-0 relative z-10">
        <button
          type="button"
          onClick={onOpenGuide}
          className="btn-secondary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-4 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white shadow-sm font-bold"
        >
          <HelpCircle className="w-4 h-4 text-indigo-500" />
          <span>첫 발매 가이드 보기</span>
        </button>

        <button
          type="button"
          onClick={onGoToCommunity}
          className="btn-primary text-xs sm:text-sm flex items-center justify-center gap-2 py-3 px-5 shadow-md font-bold"
        >
          <Users className="w-4 h-4 text-indigo-200" />
          <span>'들어봐' 피드백 커뮤니티</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {isJobActive && onStartNewJob && (
          <button
            type="button"
            onClick={onStartNewJob}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center justify-center gap-1.5 py-1 font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>새 곡으로 처음부터 시작</span>
          </button>
        )}
      </div>
    </div>
  );
}

