import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Compass, CheckCircle2, Calendar, ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

export default function GuideModal({ isOpen, onClose, onSelectDistributor, jobId = null }) {
  const [where, setWhere] = useState('both'); // 'domestic' | 'global' | 'both'
  const [budget, setBudget] = useState('free'); // 'free' | 'paid_ok'
  const [urgency, setUrgency] = useState('normal'); // 'urgent' (2주) | 'normal' (4주)
  const [aiAudio, setAiAudio] = useState(false);
  const [serverRec, setServerRec] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (jobId) api.logUsage(jobId, 'opened_guide');
  }, [isOpen, jobId]);

  useEffect(() => {
    if (!isOpen) return;
    api
      .recommendDistributor({
        where,
        budget,
        ai_audio: aiAudio,
        first_release: true,
      })
      .then(setServerRec)
      .catch(() => setServerRec(null));
  }, [isOpen, where, budget, aiAudio]);

  if (!isOpen) return null;

  // 추천 유통사 판정 (서버 응답 우선, 없으면 로컬 규칙)
  const primaryId = serverRec?.plan?.[0] || (where === 'global' || budget === 'paid_ok' ? 'distrokid' : 'muzeplatform');
  const recommendDistroKid = primaryId === 'distrokid';

  const rec = recommendDistroKid
    ? {
        name: 'DistroKid (디스트로키드)',
        tag: serverRec?.title || '글로벌 스트리밍 & 100% 정산 추천',
        desc:
          serverRec?.reasons?.join(' · ') ||
          'Spotify·Apple Music 등 해외 스토어 배포가 빠르고, 연간 구독료만 내면 음원 수익 100%를 정산받아요. ISRC도 무료로 발급됩니다.',
        cautions: serverRec?.cautions || [],
        key: 'distrokid',
      }
    : {
        name: '뮤즈플랫폼 (MuzePlatform)',
        tag: serverRec?.title || '국내 멜론·지니 중심 & 초기 비용 0원 추천',
        desc:
          serverRec?.reasons?.join(' · ') ||
          '개인 뮤지션도 가입해 국내(멜론·지니·FLO·VIBE)와 해외 스토어에 함께 유통할 수 있고, 초기 등록비 없이 수수료 배분 방식으로 시작할 수 있어요.',
        cautions: serverRec?.cautions || [],
        key: 'muse',
      };

  const MuseTimeline = (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-zinc-900 dark:text-white flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-sky-500" />
          <span>뮤즈플랫폼 기준 발매까지</span>
        </span>
        {!recommendDistroKid && (
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300">
            추천 유통사
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs">
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
          <span className="font-bold text-sky-600 dark:text-sky-400 block mb-0.5">등록 전</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">마스터링한 WAV · 3000px 커버</p>
        </div>
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
          <span className="font-bold text-sky-600 dark:text-sky-400 block mb-0.5">D-21</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">음원·커버·정보 등록 (3주 전 권장)</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30">
          <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">D-15</span>
          <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">등록 마감 · 등록 15일 뒤 발매</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30">
          <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">D-Day</span>
          <p className="text-xs text-emerald-700 dark:text-emerald-200 font-medium">국내 음원 사이트 발매</p>
        </div>
      </div>
      {urgency === 'urgent' && (
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border-l-4 border-amber-500 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>2주 안에 발매하려면 오늘 바로 등록해야 해요 (뮤즈플랫폼은 등록 15일 뒤 발매가 기본이에요).</span>
        </div>
      )}
    </div>
  );

  const DistroKidTimeline = (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-zinc-900 dark:text-white flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          <span>DistroKid 기준 발매까지</span>
        </span>
        {recommendDistroKid && (
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
            추천 유통사
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs">
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
          <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">등록 전</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">WAV · 3000px 커버</p>
        </div>
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5">
          <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">D-28</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">업로드 (4주 전 권장 · 반영 최대 2주)</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30">
          <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">D-7</span>
          <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">Spotify 에디토리얼 피칭 <b>마감</b></p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30">
          <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">D-Day</span>
          <p className="text-xs text-emerald-700 dark:text-emerald-200 font-medium">해외 스토어 발매</p>
        </div>
      </div>
      {urgency === 'urgent' && (
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border-l-4 border-amber-500 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>2주면 Spotify 에디토리얼 피칭(최소 7일 전 마감, 4주 전 권장)은 어려울 수 있어요.</span>
        </div>
      )}
    </div>
  );

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
            <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white">첫 발매 유통사 추천 & 발매 타임라인 가이드</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white font-bold text-lg p-1 rounded-lg">✕</button>
        </div>

        {/* Quiz */}
        <div className="space-y-3.5">
          <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-300 uppercase tracking-wider">
            🎯 나에게 맞는 유통사 & 발매 일정 확인하기
          </h4>

          {/* Q1: 어디에 */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2 text-xs">
            <span className="font-bold text-zinc-900 dark:text-white">Q1. 내 음악을 어디에 들려주고 싶나요?</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['domestic', '국내 (멜론·지니)'],
                ['global', '해외 (Spotify·Apple)'],
                ['both', '국내 + 해외 둘 다'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setWhere(val)}
                  className={`py-2 px-3 rounded-lg border text-center transition-all ${
                    where === val
                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                      : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Q2: 비용 */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2 text-xs">
            <span className="font-bold text-zinc-900 dark:text-white">Q2. 어떤 비용·정산 방식을 선호하시나요?</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['free', '초기 등록비 0원 (수수료 배분)'],
                ['paid_ok', '연간 구독 결제 (수익 100% 정산)'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBudget(val)}
                  className={`py-2 px-3 rounded-lg border text-center transition-all ${
                    budget === val
                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                      : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Q3: 일정 & AI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2 text-xs">
              <span className="font-bold text-zinc-900 dark:text-white">Q3. 얼마나 급한가요?</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['urgent', '2주 안에'],
                  ['normal', '3~4주 여유'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setUrgency(val)}
                    className={`py-2 px-2.5 rounded-lg border text-center transition-all ${
                      urgency === val
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                        : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 space-y-2 text-xs">
              <span className="font-bold text-zinc-900 dark:text-white">Q4. 음원 제작에 AI를 썼나요?</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  [false, '아니요 (직접 제작)'],
                  [true, '네 (AI 생성 포함)'],
                ].map(([val, label]) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setAiAudio(val)}
                    className={`py-2 px-2.5 rounded-lg border text-center transition-all ${
                      aiAudio === val
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                        : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result Recommendation Card */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-zinc-900 border border-indigo-200 dark:border-indigo-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                {rec.tag}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>맞춤 추천</span>
              </span>
            </div>
            <h5 className="font-extrabold text-base text-zinc-900 dark:text-white">{rec.name}</h5>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{rec.desc}</p>
            {rec.cautions?.length > 0 && (
              <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-4 space-y-0.5 pt-1">
                {rec.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* D7: 추천 유통사에 따라 순서가 바뀌는 실제 유통사 기준 타임라인 */}
        <div className="space-y-4 pt-3 border-t border-zinc-200 dark:border-white/10">
          {recommendDistroKid ? (
            <>
              {DistroKidTimeline}
              <div className="pt-2 border-t border-zinc-100 dark:border-white/5 opacity-85">{MuseTimeline}</div>
            </>
          ) : (
            <>
              {MuseTimeline}
              <div className="pt-2 border-t border-zinc-100 dark:border-white/5 opacity-85">{DistroKidTimeline}</div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
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
