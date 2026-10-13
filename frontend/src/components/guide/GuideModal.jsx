import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Compass, CheckCircle2, Calendar, Layers, ShieldCheck, ArrowRight } from 'lucide-react';

export default function GuideModal({ isOpen, onClose, onSelectDistributor }) {
  const [q1, setQ1] = useState('both'); // 'korea' | 'global' | 'both'
  const [q2, setQ2] = useState('free'); // 'free' (수수료) | 'sub' (구독)
  const [q3, setQ3] = useState('urgent'); // 'urgent' (2주) | 'normal' (4주)

  if (!isOpen) return null;

  // Recommendation Logic
  const recommendDistroKid = q1 === 'global' || q2 === 'sub';
  const rec = recommendDistroKid
    ? {
        name: 'DistroKid (디스트로키드)',
        tag: '글로벌 초고속 발매 추천',
        desc: '해외 150개 이상 플랫폼(Spotify, Apple Music 등)에 1~3일 만에 배포되며, 연 구독료만 내면 음원 수익을 100% 정산받습니다.',
        key: 'distrokid',
      }
    : {
        name: '뮤즈플랫폼 (MuzePlatform)',
        tag: '국내 멜론·지니 중심 추천',
        desc: '누구나 가입 가능하며 국내 멜론, 지니, FLO부터 해외 플랫폼까지 한 번에 접수됩니다. 초기 등록비 무료 플랜을 제공합니다.',
        key: 'muse',
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl rounded-2xl p-6 sm:p-8 space-y-6 bg-white dark:bg-[#0c1017] border border-zinc-200 dark:border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto text-zinc-900 dark:text-zinc-100 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-indigo-600 dark:text-sky-400" />
            <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">첫 발매 유통사 추천 & 로드맵 가이드</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white font-bold text-lg p-1 rounded-lg">✕</button>
        </div>

        {/* 3-Question Quiz */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-300 uppercase tracking-wider">
            🎯 질문 3개로 알아보는 나에게 딱 맞는 유통사
          </h4>

          {/* Q1 */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2.5 text-xs">
            <span className="font-bold text-zinc-900 dark:text-white">Q1. 내 음악을 어디에 가장 먼저 들려주고 싶나요?</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setQ1('korea')}
                className={`py-2 px-3 rounded-lg border text-center transition-all ${
                  q1 === 'korea'
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                국내 (멜론·지니)
              </button>
              <button
                onClick={() => setQ1('global')}
                className={`py-2 px-3 rounded-lg border text-center transition-all ${
                  q1 === 'global'
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                해외 (Spotify·Apple)
              </button>
              <button
                onClick={() => setQ1('both')}
                className={`py-2 px-3 rounded-lg border text-center transition-all ${
                  q1 === 'both'
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                국내 + 해외 둘 다
              </button>
            </div>
          </div>

          {/* Q2 */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2.5 text-xs">
            <span className="font-bold text-zinc-900 dark:text-white">Q2. 어떤 정산 방식을 선호하시나요?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setQ2('free')}
                className={`py-2 px-3 rounded-lg border text-center transition-all ${
                  q2 === 'free'
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                등록비 0원 (수수료 15~20% 배분)
              </button>
              <button
                onClick={() => setQ2('sub')}
                className={`py-2 px-3 rounded-lg border text-center transition-all ${
                  q2 === 'sub'
                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                연간 정기 결제 (음원 수익 100% 수령)
              </button>
            </div>
          </div>

          {/* Result Recommendation Card */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-zinc-900 border border-indigo-200 dark:border-indigo-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                {rec.tag}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>최적 매칭</span>
              </span>
            </div>
            <h5 className="font-extrabold text-base text-zinc-900 dark:text-white">{rec.name}</h5>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{rec.desc}</p>
          </div>
        </div>

        {/* D-30 Timeline Roadmap */}
        <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-white">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>표준 음원 발매 D-30 권장 타임라인</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">D-30</span>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300">마스터링 & 3000px 커버 완성</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">D-21</span>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300">유통사 접수 & 사전 심사</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">D-7</span>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300">Spotify 에디터 피칭 신청</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">D-Day</span>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-200 font-medium">전 세계 정식 스트리밍 발매</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end pt-2">
          <button
            onClick={() => {
              onSelectDistributor(rec.key);
              onClose();
            }}
            className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2 shadow-md shadow-indigo-500/20"
          >
            <span>{rec.name} 기준으로 발매 준비하기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

