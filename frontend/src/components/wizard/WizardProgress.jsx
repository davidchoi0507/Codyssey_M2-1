import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Sparkles, ShieldCheck, PackageCheck, Check, Plus, FolderSync } from 'lucide-react';

const STEPS = [
  { id: 1, key: 'upload', title: 'Step 1. 곡 업로드 & 스마트 입력', short: '곡 업로드', icon: Upload },
  { id: 2, key: 'visual', title: 'Step 2. 비주얼 에셋 & 홍보 글', short: '비주얼 에셋', icon: Sparkles },
  { id: 3, key: 'inspect', title: 'Step 3. 권리 진단 & 규격 검사', short: '규격 검사', icon: ShieldCheck },
  { id: 4, key: 'release', title: 'Step 4. 준비 자료 & 커뮤니티', short: '준비 완료', icon: PackageCheck },
];

export default function WizardProgress({
  currentStep,
  setStep,
  canGoToStep,
  jobData,
  onStartNewJob,
  onToggleJobPicker,
  showJobPicker,
}) {
  const hasActiveJob = Boolean(jobData?.jobId);

  return (
    <div className="w-full max-w-5xl mx-auto mb-8 space-y-3">
      {/* Studio Header & Active Job Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <h2 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white tracking-tight">
              발매 준비 스튜디오
            </h2>
          </div>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          {hasActiveJob ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200/80 dark:border-indigo-500/20 text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate max-w-[220px] sm:max-w-xs">
              <span className="truncate">{jobData.title || '제목 없음'}</span>
              {jobData.artist && <span className="text-zinc-400 dark:text-zinc-500 font-normal truncate">({jobData.artist})</span>}
            </span>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">새 음원 등록 대기</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleJobPicker && (
            <button
              type="button"
              onClick={onToggleJobPicker}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                showJobPicker
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-[#141418] border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400'
              }`}
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>{showJobPicker ? '닫기' : '작업 바꾸기'}</span>
            </button>
          )}
          {hasActiveJob && onStartNewJob && (
            <button
              type="button"
              onClick={onStartNewJob}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새 곡 준비</span>
            </button>
          )}
        </div>
      </div>

      {/* 4-Step Stepper Bar (High Contrast Milestone Flow) */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 p-1.5 rounded-2xl bg-zinc-100/80 dark:bg-[#121216] border border-zinc-200 dark:border-white/5">
        {STEPS.map((step) => {
          const isCurrent = currentStep === step.id;
          const isDone = currentStep > step.id;
          const isClickable = canGoToStep ? canGoToStep(step.id) : false;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => isClickable && setStep(step.id)}
              disabled={!isClickable}
              title={
                isCurrent
                  ? '현재 작업 중인 단계입니다'
                  : isDone
                  ? `${step.short} (클릭하여 다시 확인/수정)`
                  : isClickable
                  ? `${step.short} (클릭하여 바로 복귀)`
                  : `${step.short} (이전 단계를 먼저 완료해야 열립니다)`
              }
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 py-2.5 px-2 sm:px-3 rounded-xl transition-all ${
                isCurrent
                  ? 'bg-white dark:bg-[#1a1a22] text-indigo-600 dark:text-white shadow-md border border-indigo-500/40 cursor-default'
                  : isClickable
                  ? 'bg-transparent text-emerald-600 dark:text-emerald-400 hover:bg-white/50 dark:hover:bg-white/5 cursor-pointer'
                  : 'bg-transparent text-zinc-500 dark:text-zinc-400 cursor-not-allowed opacity-70 select-none'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition-transform ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-sm scale-105'
                    : isDone
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                    : isClickable
                    ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border border-indigo-500/30'
                    : 'bg-zinc-200/80 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400 border border-zinc-300/40 dark:border-white/10'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Icon className="w-3.5 h-3.5" />}
              </div>

              <div className="text-left flex flex-col items-center sm:items-start">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider hidden sm:block">
                  Step 0{step.id}
                </span>
                <span
                  className={`text-xs sm:text-sm font-extrabold tracking-tight whitespace-nowrap ${
                    isCurrent 
                      ? 'text-indigo-600 dark:text-white' 
                      : isClickable 
                      ? 'text-emerald-700 dark:text-emerald-300' 
                      : 'text-zinc-700 dark:text-zinc-200'
                  }`}
                >
                  {step.short}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
