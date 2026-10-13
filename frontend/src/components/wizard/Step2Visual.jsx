import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Image, Video, FileText, Check, Copy, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { api, toFileUrl } from '../../services/api';

export default function Step2Visual({ jobData, setJobData, onNextStep, onPrevStep }) {
  const [selectedCover, setSelectedCover] = useState(jobData?.selectedCover || 0);
  const [loadingAssets, setLoadingAssets] = useState(
    Boolean(jobData?.jobId && !jobData?.jobId.toString().startsWith('demo'))
  );
  const [assets, setAssets] = useState(null);
  const [copiedType, setCopiedType] = useState(null);

  useEffect(() => {
    if (!jobData?.jobId || jobData.jobId.toString().startsWith('demo')) {
      setLoadingAssets(false);
      return;
    }

    let interval = null;
    const fetchAssets = async () => {
      try {
        const res = await api.getJobStatus(jobData.jobId);
        if (res.covers?.length > 0 || res.stage === 'awaiting_cover' || res.stage === 'done') {
          setAssets(res);
          setLoadingAssets(false);
          if (interval) clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchAssets();
    interval = setInterval(fetchAssets, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobData?.jobId]);

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleProceed = () => {
    setJobData((prev) => ({
      ...prev,
      selectedCover,
      coverUrl: assets?.covers?.[selectedCover] || assets?.cover_url,
    }));
    onNextStep();
  };

  const covers = assets?.covers || [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80',
  ];

  const canvasVideoUrl = assets?.canvas_url ? toFileUrl(assets.canvas_url) : null;
  const promoCopy = assets?.promo_text || `${jobData?.artist || '아티스트'}의 새 싱글 [${jobData?.title || '곡 제목'}]이 발매되었습니다.\n밤의 잔향을 닮은 멜로디와 서정적인 노랫말이 담긴 이번 앨범은 전 세계 스트리밍 플랫폼에서 만나보실 수 있습니다.`;
  const pitchingMail = assets?.pitch_mail || `안녕하세요, 음악 에디터님.\n싱어송라이터 ${jobData?.artist || '아티스트'}의 신곡 [${jobData?.title || '곡 제목'}]을 소개합니다.\n장르: 감성 인디 팝 / 발매일 맞춤 플레이리스트 피칭 자료를 전달드립니다.`;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 2. 비주얼 에셋 & 홍보 카피 스튜디오
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          스트리밍 플랫폼 필수 규격인 3000px 앨범 커버를 고르고, Spotify Canvas 및 홍보 카피를 확인하세요.
        </p>
      </div>

      {loadingAssets && (
        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span>AI 앨범 커버 아트워크 3종 및 비주얼 에셋을 렌더링하고 있습니다...</span>
        </div>
      )}

      {/* Grid: Covers (Left 7) + Motion & Copy (Right 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Album Cover Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Image className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>3000×3000px 정규 커버 아트워크 선택 (1종 필수)</span>
            </h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>RGB / sRGB 포맷</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {covers.map((coverUrl, idx) => {
              const isSelected = selectedCover === idx;
              const fullUrl = toFileUrl(coverUrl);

              return (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setSelectedCover(idx)}
                  className={`group relative rounded-xl overflow-hidden aspect-square border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-600 shadow-xl shadow-indigo-500/25'
                      : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/30 opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={fullUrl}
                    alt={`Cover Option ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Top Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white">
                    Option {idx + 1}
                  </div>

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                        <Check className="w-5 h-5 stroke-[3]" />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed bg-zinc-100/70 dark:bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-200 dark:border-white/5">
            💡 <b>유통사 반려 방지 팁</b>: 선택하신 커버는 3단계에서 스트리밍 플랫폼 금지 규정(URL, QR코드, SNS 아이디, 가격 표기 등)이 없는지 자동으로 정밀 검수됩니다.
          </p>
        </div>

        {/* Right: Spotify Canvas & Promo Copy (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Canvas Loop Video */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <span>Spotify Canvas (9:16 루프 영상)</span>
            </h3>

            <div className="rounded-xl overflow-hidden aspect-[9/16] max-h-56 mx-auto bg-zinc-100 dark:bg-[#121215] flex items-center justify-center border border-zinc-200 dark:border-white/10 relative shadow-inner">
              {canvasVideoUrl ? (
                <video
                  src={canvasVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
                    <Video className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Spotify 8초 루프 비주얼라이저</p>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold">
                    ZIP 패키지에 자동 포함
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Promo Copywriting Card */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>플랫폼 홍보 카피 & 피칭 메일</span>
            </h3>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase">채널 소개글 (SNS/유튜브)</span>
                  <button
                    onClick={() => handleCopy(promoCopy, 'promo')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 font-semibold"
                  >
                    {copiedType === 'promo' ? '복사됨!' : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed whitespace-pre-line">
                  {promoCopy}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase">플레이리스트 피칭 메일 초안</span>
                  <button
                    onClick={() => handleCopy(pitchingMail, 'pitch')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 font-semibold"
                  >
                    {copiedType === 'pitch' ? '복사됨!' : <><Copy className="w-3 h-3" /> 복사</>}
                  </button>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed whitespace-pre-line">
                  {pitchingMail}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Navigation Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-white/10">
        <button
          onClick={onPrevStep}
          className="btn-secondary text-sm px-6 py-2.5 shadow-sm"
        >
          이전 (곡 정보 수정)
        </button>

        <button
          onClick={handleProceed}
          className="btn-primary text-sm px-8 py-3 flex items-center gap-2 shadow-md"
        >
          <span>선택한 커버로 유통사 규격 검사하기</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
