import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Sparkles, ShieldCheck, PackageCheck, Check } from 'lucide-react';

const STEPS = [
  { id: 1, key: 'upload', title: 'Step 1. 곡 업로드 & 스마트 입력', short: '곡 업로드', icon: Upload },
  { id: 2, key: 'visual', title: 'Step 2. 비주얼 & 홍보 스튜디오', short: '비주얼 에셋', icon: Sparkles },
  { id: 3, key: 'inspect', title: 'Step 3. 반려 방지 종합 검사', short: '규격 검사', icon: ShieldCheck },
  { id: 4, key: 'release', title: 'Step 4. 제출 팩 & 커뮤니티', short: '제출 완료', icon: PackageCheck },
];

export default function WizardProgress({ currentStep, setStep, canGoToStep }) {
  return (
    <div className="w-full max-w-4xl mx-auto mb-10">
      <div className="grid grid-cols-4 gap-2 sm:gap-4 relative">
        {STEPS.map((step) => {
          const isCurrent = currentStep === step.id;
          const isDone = currentStep > step.id;
          const isClickable = canGoToStep ? canGoToStep(step.id) : isDone;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              onClick={() => isClickable && setStep(step.id)}
              disabled={!isClickable && !isCurrent}
              className={`relative flex flex-col items-center p-3 sm:p-4 rounded-xl text-center transition-all ${
                isCurrent
                  ? 'bg-indigo-50 dark:bg-indigo-600/15 border border-indigo-500/50 shadow-md shadow-indigo-500/10'
                  : isDone
                  ? 'bg-zinc-50 dark:bg-zinc-900/60 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/90 cursor-pointer shadow-sm'
                  : 'bg-zinc-100/60 dark:bg-zinc-900/30 border border-zinc-200 dark:border-white/5 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              {/* Step Icon Badge */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all ${
                isCurrent
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-110'
                  : isDone
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
              }`}>
                {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : <Icon className="w-4 h-4" />}
              </div>

              {/* Title */}
              <span className={`text-xs sm:text-sm font-bold tracking-tight line-clamp-1 ${
                isCurrent ? 'text-indigo-900 dark:text-white' : isDone ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500'
              }`}>
                {step.short}
              </span>

              <span className="hidden sm:inline text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">
                Step 0{step.id}
              </span>

              {/* Active Indicator Glow */}
              {isCurrent && (
                <motion.div
                  layoutId="step-indicator"
                  className="absolute -bottom-1 left-4 right-4 h-0.5 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
