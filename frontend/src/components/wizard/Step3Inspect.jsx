import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowRight, ArrowLeft, Layers } from 'lucide-react';
import { api } from '../../services/api';

export default function Step3Inspect({ jobData, setJobData, onNextStep, onPrevStep }) {
  const isDemo = !jobData?.jobId || jobData.jobId.toString().startsWith('demo');
  const [distributor, setDistributor] = useState(jobData?.targetDistributor || 'distrokid'); // 'distrokid' | 'muse'
  const [inspectData, setInspectData] = useState(null); // 서버 DistributorCheck
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState(null);

  // 화면의 체크 4개 ↔ 서버 권리 자가진단 답 (GET /release/rights-questions 의 id·값)
  const [rights, setRights] = useState({
    is_original: false,
    is_cover: false,
    used_sample: false,
    has_ai_audio: false,
  });
  const toAnswers = (r) => ({
    song_type: r.is_cover ? 'cover' : 'original',
    samples: r.used_sample ? 'pack' : 'none',
    ai_audio: r.has_ai_audio ? 'generated' : 'none',
  });

  const fetchInspection = async (dist) => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInspectData(await api.getDistributorInspection(jobData.jobId, dist));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInspection(distributor);
  }, [distributor, jobData?.jobId]);

  // 전에 답한 자가진단이 있으면 체크 상태로 보여 준다
  useEffect(() => {
    if (isDemo) return;
    api.getRights(jobData.jobId).then((r) => {
      const a = r.answers || {};
      if (!Object.keys(a).length) return;
      setRights({
        is_original: a.song_type === 'original',
        is_cover: a.song_type === 'cover',
        used_sample: a.samples === 'pack' || a.samples === 'other_song',
        has_ai_audio: a.ai_audio === 'generated',
      });
    }).catch(() => {});
  }, [jobData?.jobId]);

  const handleRightsChange = async (key, val) => {
    const updated = { ...rights, [key]: val };
    if (key === 'is_original' && val) updated.is_cover = false;
    if (key === 'is_cover' && val) updated.is_original = false;
    setRights(updated);
    if (isDemo) return;
    try {
      await api.saveRights(jobData.jobId, toAnswers(updated));
      fetchInspection(distributor); // AI 표기 등 판정이 바뀔 수 있다
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProceed = () => {
    setJobData((prev) => ({
      ...prev,
      targetDistributor: distributor,
    }));
    onNextStep();
  };

  const checks = inspectData
    ? inspectData.items.map((i) => ({ name: i.label, status: i.status, desc: i.detail }))
    : isDemo ? [
      { name: '오디오 포맷 및 비트심도', status: 'pass', desc: 'WAV 24-bit / 48kHz 무손실 규격 적합' },
      { name: 'True Peak 라우드니스', status: 'pass', desc: '-1.0 dBTP 이하로 스트리밍 왜곡 위험 없음' },
      { name: '커버 이미지 해상도 & 색공간', status: 'pass', desc: '3000 × 3000 px, RGB (sRGB) 충족' },
      { name: '커버 텍스트 금지 요소', status: 'pass', desc: 'URL, 바코드, SNS 아이디, 가격 미포함' },
      { name: '트랙 제목 및 피처링 표기', status: 'pass', desc: 'Spotify / Apple Music Style Guide 준수' },
      { name: '가사 형식 요건', status: 'warn', desc: '반복 구절 생략 표기 주의 필요 (Chorus 2x 등 지양)' },
    ] : [];
  const counts = inspectData?.counts || { fail: 0, warn: checks.filter((c) => c.status === 'warn').length };
  const risk = counts.fail ? { label: `반려 위험: 고쳐야 할 항목 ${counts.fail}개`, tone: 'rose' }
    : counts.warn ? { label: `확인 필요 ${counts.warn}개`, tone: 'amber' }
    : { label: '반려 위험도: 낮음', tone: 'emerald' };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 3. 유통사별 반려 방지 종합 사전 검사
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          실제 유통사 검수 기준에 맞춰 오디오, 커버, 메타데이터 표기 규격을 사전에 종합 진단합니다.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">{error}</div>
      )}

      {/* Distributor Tabs */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setDistributor('distrokid')}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            distributor === 'distrokid'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-105'
              : 'glass-panel text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>DistroKid (글로벌 150+ 플랫폼)</span>
        </button>

        <button
          onClick={() => setDistributor('muse')}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            distributor === 'muse'
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/25 scale-105'
              : 'glass-panel text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>뮤즈플랫폼 (멜론·지니 국내 중심)</span>
        </button>
      </div>

      {/* Main Inspection HUD Card */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        
        {/* Inspection Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 dark:border-white/10 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg text-zinc-900 dark:text-white">
                {distributor === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 전용 검수 프로파일
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-500/30">
                실시간 진단
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">유통사 가이드라인에 따른 사전 검증 결과입니다.</p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
              risk.tone === 'rose' ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                : risk.tone === 'amber' ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            }`}>
              {loading ? <span>검사 중...</span> : <><CheckCircle2 className="w-4 h-4" /><span>{risk.label}</span></>}
            </span>
          </div>
        </div>

        {/* Check Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {checks.map((check, idx) => {
            const isPass = check.status === 'pass' || check.status === 'ok';
            const isWarn = check.status === 'warn';
            const isTodo = check.status === 'todo'; // 사람이 직접 확인할 항목

            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 flex items-start gap-3 hover:border-zinc-300 dark:hover:border-white/10 transition-colors shadow-sm"
              >
                {isPass ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : isWarn || isTodo ? (
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isTodo ? 'text-sky-500' : 'text-amber-500'}`} />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">{check.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      isPass ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : isWarn ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    }`}>
                      {isPass ? 'PASS' : isWarn ? '주의' : isTodo ? '직접 확인' : '반려위험'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">{check.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rights Self-Diagnosis Checklist */}
        <div className="p-5 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-indigo-200 dark:border-indigo-500/20 space-y-3">
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block">
            ⚖️ 권리 및 저작권 자가진단 (필수 확인)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-700 dark:text-zinc-300">
            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/5 cursor-pointer hover:border-indigo-400 transition-colors shadow-sm">
              <input
                type="checkbox"
                checked={rights.is_original}
                onChange={(e) => handleRightsChange('is_original', e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>순수 자작곡 (작사/작곡 본인 또는 합의 완료)</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/5 cursor-pointer hover:border-indigo-400 transition-colors shadow-sm">
              <input
                type="checkbox"
                checked={rights.used_sample}
                onChange={(e) => handleRightsChange('used_sample', e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>상업용 샘플 라이선스 확보 (Splice 등)</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/5 cursor-pointer hover:border-indigo-400 transition-colors shadow-sm">
              <input
                type="checkbox"
                checked={rights.has_ai_audio}
                onChange={(e) => handleRightsChange('has_ai_audio', e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>AI 생성 오디오 활용 여부 (유통 시 AI 표기 필요)</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/5 cursor-pointer hover:border-indigo-400 transition-colors shadow-sm">
              <input
                type="checkbox"
                checked={rights.is_cover}
                onChange={(e) => handleRightsChange('is_cover', e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>커버곡 여부 (해외 14일 전 접수 / 국내 승인 필요)</span>
            </label>
          </div>
        </div>

      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-white/10">
        <button
          onClick={onPrevStep}
          className="btn-secondary text-sm px-6 py-2.5 flex items-center gap-2 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>이전 (비주얼 선택)</span>
        </button>

        <button
          onClick={handleProceed}
          className="btn-primary text-sm px-8 py-3 flex items-center gap-2 shadow-md"
        >
          <span>제출 패키지 다운로드 & 완성하기</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
