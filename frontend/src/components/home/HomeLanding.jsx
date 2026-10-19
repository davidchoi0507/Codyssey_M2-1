import React from 'react';
import {
  Sparkles,
  Disc3,
  ArrowRight,
  ShieldCheck,
  Palette,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  Users,
  Compass,
  Play,
  Share2,
  Layers,
  Zap,
  Music2,
  Check,
  Headphones,
  Sliders,
  Award,
} from 'lucide-react';

export default function HomeLanding({
  onGoToStudio,
  onGoToCommunity,
  onOpenGuide,
}) {
  const steps = [
    {
      num: '01',
      title: 'AI A&R 음악 정밀 분석',
      subtitle: '장르 · BPM · 무드 · 15초 하이라이트',
      desc: 'WAV 또는 MP3 음원을 올리면 AI가 사운드와 분위기를 정밀 분석하여 타이틀, 무드 키워드, 그리고 가장 귀를 사로잡는 15초 킬링 파트를 추출합니다.',
      tags: ['파형 EQ 시각화', '콘셉트 노트 자동 작성'],
      icon: Headphones,
      gradient: 'from-blue-500 to-indigo-600',
      badgeBg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    },
    {
      num: '02',
      title: '3000px 앨범아트 & 모션 비디오',
      subtitle: '고해상도 커버 3종 · 9:16 스포티파이 캔버스',
      desc: '글로벌 유통사 규격(3000×3000px, RGB)을 준수하는 고화질 커버 아트와 인스타그램 릴스·유튜브 쇼츠에 즉시 활용할 수 있는 15초 루프 영상을 생성합니다.',
      tags: ['3000×3000px 무손실', '9:16 세로형 캔버스'],
      icon: Palette,
      gradient: 'from-indigo-500 to-purple-600',
      badgeBg: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
    },
    {
      num: '03',
      title: '유통사 반려 방지 규격 검수',
      subtitle: '24-bit WAV 체크 · 저작권 10문항 자가진단',
      desc: '스포티파이·애플뮤직·국내 유통사 제출 시 흔히 반려되는 오디오 스펙과 메타데이터 오류를 사전에 점검하고, 발매 희망일 캘린더 프리셋을 제공합니다.',
      tags: ['DistroKid / 국내 규격 대응', '저작권 자가진단표'],
      icon: ShieldCheck,
      gradient: 'from-amber-500 to-orange-600',
      badgeBg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    },
    {
      num: '04',
      title: '발매 패키지 ZIP & 6대 SNS 홍보',
      subtitle: '유통사 시트(.CSV) · 플랫폼별 피치 레터',
      desc: '유통사 웹사이트 제출용 메타데이터 시트와 고화질 에셋을 ZIP 파일로 한 번에 다운로드하고, 인스타·유튜브·릴스에 올릴 홍보 글을 원클릭 복사합니다.',
      tags: ['원클릭 ZIP 다운로드', '6대 SNS 맞춤 홍보글'],
      icon: FileSpreadsheet,
      gradient: 'from-emerald-500 to-teal-600',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    },
  ];

  return (
    <div className="w-full space-y-24 sm:space-y-32 py-4 sm:py-8 animate-in fade-in duration-500">
      
      {/* ─────────────────────────────────────────────────────────────
          1. HERO SECTION (시원하고 개방감 넘치는 와이드 헤드라인)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative text-center max-w-5xl mx-auto px-4 pt-6 sm:pt-12 space-y-8">
        {/* Subtle Ambient Mesh Lights */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-500/20 via-sky-500/15 to-purple-500/20 dark:from-indigo-600/25 dark:via-sky-400/15 dark:to-purple-600/25 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Top Floating Pill Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-white/10 shadow-sm backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            인디 뮤지션을 위한 AI 원스톱 음원 발매 스튜디오
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            Balmaero Studio
          </span>
        </div>

        {/* Main Massive Title */}
        <div className="space-y-5">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-zinc-900 dark:text-white tracking-tight leading-[1.3] sm:leading-[1.25] break-keep">
            <span className="block">음원 하나로 완성하는</span>
            <span className="block mt-2 sm:mt-3 bg-gradient-to-r from-indigo-600 via-sky-500 to-indigo-500 dark:from-indigo-400 dark:via-sky-300 dark:to-emerald-400 bg-clip-text text-transparent">
              나만의 공식 앨범 발매 패키지
            </span>
          </h1>

          <p className="text-base sm:text-xl text-zinc-600 dark:text-zinc-300 max-w-3xl mx-auto font-medium leading-relaxed">
            혼자서 막막했던 커버 디자인, 숏폼 홍보 영상, 유통사 반려 방지 규격 검수까지—
            <br className="hidden sm:inline" />
            WAV 또는 MP3 파일만 올리면 AI가 <strong className="text-zinc-900 dark:text-white font-bold">원스톱으로 정식 발매 패키지</strong>를 완성해드립니다.
          </p>
        </div>

        {/* Action CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            type="button"
            onClick={onGoToStudio}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-black text-base sm:text-lg shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 transition-all cursor-pointer group"
          >
            <Sparkles className="w-5 h-5 text-indigo-200 group-hover:rotate-12 transition-transform" />
            <span>지금 무료로 발매 패키지 만들기</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            type="button"
            onClick={onGoToCommunity}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-bold text-base shadow-sm flex items-center justify-center gap-2.5 transition-all"
          >
            <Users className="w-5 h-5 text-indigo-500" />
            <span>다른 아티스트 발매곡 들어보기</span>
          </button>
        </div>

        {/* 3 Key Stats Counter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 pt-8 max-w-3xl mx-auto border-t border-zinc-200/80 dark:border-white/10">
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-indigo-600 dark:text-indigo-400">원스톱</div>
            <div className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-400">실시간 패키지 완성</div>
            <p className="text-[11px] text-zinc-400">외주 2주 대기 없이 즉시 생성</p>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400">100%</div>
            <div className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-400">글로벌 유통사 규격 호환</div>
            <p className="text-[11px] text-zinc-400">3000px 무손실 & 24-bit WAV 검수</p>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-purple-600 dark:text-purple-400">0원</div>
            <div className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-400">디자인 외주 비용 부담</div>
            <p className="text-[11px] text-zinc-400">인디 아티스트를 위한 완전 무료 지원</p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. VISUAL PRODUCT SHOWCASE (실제 결과물 미리보기 시각화)
         ───────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-zinc-950/60 p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle Top Inner Glow */}
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-black tracking-widest uppercase text-indigo-600 dark:text-indigo-400">
              ALL-IN-ONE OUTPUT
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
              음원 하나를 올리면 이 모든 것이 즉시 완성됩니다
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              유통사 웹 제출에 필요한 모든 에셋과 메타데이터 시트가 한 번에 정리됩니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Output 1: 3000px Album Art & Motion Video */}
            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-[#121216] border border-zinc-200/80 dark:border-white/5 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">
                3000px 커버아트 & 9:16 모션 비디오
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                스포티파이·애플뮤직의 3000×3000px 무손실 RGB 커버 3종과 Spotify Canvas 및 인스타그램 릴스에 맞춘 9:16 세로형 15초 루프 영상을 자동 렌더링합니다.
              </p>
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>앨범아트 규격</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">3000×3000px (1:1)</span>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Spotify Canvas</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">9:16 MP4 (15초 루프)</span>
                </div>
              </div>
            </div>

            {/* Output 2: AI A&R Audio Analysis & Concept Note */}
            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-[#121216] border border-zinc-200/80 dark:border-white/5 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Music2 className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">
                AI A&R 음악 분석 & 15초 하이라이트
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                음악의 템포(BPM), 대표 장르, 감성 무드 키워드를 정밀 태깅하고, 가장 몰입도가 높은 15초 구간을 찾아내 막대그래프 파형으로 시각화합니다.
              </p>
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>자동 분석 요소</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">BPM · 장르 · 감성 무드</span>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>미리듣기</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">15초 킬링 파트 파형 EQ</span>
                </div>
              </div>
            </div>

            {/* Output 3: Pre-flight Inspector & Pitch Letters */}
            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-[#121216] border border-zinc-200/80 dark:border-white/5 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">
                유통사 반려 방지 & 6대 SNS 홍보글
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                24-bit WAV 규격 검수와 저작권 10문항 자가진단표를 제공하고, 인스타그램·유튜브·릴스에 즉시 업로드 가능한 맞춤형 피치 레터를 원클릭 생성합니다.
              </p>
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>유통사 시트</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">표준 메타데이터 .CSV</span>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>홍보 복사</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">6개 플랫폼 원클릭 복사</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. COMPARISON (기존 발매 vs 발매로)
         ───────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-black tracking-widest uppercase text-indigo-600 dark:text-indigo-400">
            WHY BALMAERO
          </span>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white">
            인디 뮤지션의 첫 발매, 왜 이렇게 달랐을까요?
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            음악을 만드는 것만으로도 벅찬 아티스트에게 발매 준비는 또 다른 큰 장벽이었습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Before Card */}
          <div className="p-7 rounded-3xl bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/5 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold">
              <span>기존의 복잡한 발매 방식</span>
            </div>
            <ul className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex items-start gap-3">
                <span className="text-rose-500 font-bold">✕</span>
                <span>커버 디자인 외주비 30~50만 원 지출과 2주 넘는 피드백 대기</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-500 font-bold">✕</span>
                <span>유통사마다 제각각인 규격 때문에 발생하는 반복적인 심사 반려와 지연</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-500 font-bold">✕</span>
                <span>쇼츠/릴스용 영상 제작 툴을 다룰 줄 몰라 포기하는 SNS 홍보</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-500 font-bold">✕</span>
                <span>AI 음악 및 샘플링 저작권 침해에 대한 불안감과 정보 부족</span>
              </li>
            </ul>
          </div>

          {/* After Card (Balmaero) */}
          <div className="p-7 rounded-3xl bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/20 dark:to-zinc-900/60 border-2 border-indigo-500/40 shadow-lg shadow-indigo-500/5 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>발매로 (Balmaero)와 함께라면</span>
            </div>
            <ul className="space-y-4 text-sm text-zinc-800 dark:text-zinc-200 font-medium">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span><strong>0원</strong>으로 3000px 고화질 커버 3종과 모션 비디오 <strong>즉시 원클릭 생성</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>유통사 표준 규격 자동 검수 및 권장 발매일 캘린더로 <strong>반려 원천 차단</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>인스타그램, 유튜브, 플레이리스트 큐레이터용 <strong>맞춤 홍보문 원클릭 복사</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>체크리스트 기반 <strong>저작권 10문항 자가진단표</strong>로 안심 발매 지원</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. 4-STEP WORKFLOW (시원시원한 4단계 프로세스 카드)
         ───────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-black tracking-widest uppercase text-indigo-600 dark:text-indigo-400">
            HOW IT WORKS
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white">
            어떻게 진행되나요?
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            복잡한 유통 절차를 직관적인 4단계 워크플로우로 압축했습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="group relative p-6 rounded-3xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-white/10 hover:border-indigo-500/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                      {step.num}
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5 text-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white mb-1">
                      {step.title}
                    </h3>
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                      {step.subtitle}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-white/5 flex flex-wrap gap-1.5">
                  {step.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    >
                      ✓ {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. COMMUNITY BANNER (들어봐 커뮤니티 연결)
         ───────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-sky-50 via-indigo-50 to-purple-50 dark:from-[#0e1626] dark:via-[#131326] dark:to-[#171026] border border-indigo-200/80 dark:border-indigo-500/20 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
              <span>'들어봐' 피드백 커뮤니티</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              발매 전, 동료 인디 뮤지션들의 생생한 피드백을 들어보세요
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
              발매로 스튜디오에서 완성한 음원을 커뮤니티에 공유하고, 장르별 아티스트들과 자유롭게 감상평과 응원을 주고받을 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToCommunity}
            className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm shadow-md flex items-center gap-2 flex-shrink-0 cursor-pointer"
          >
            <span>커뮤니티 둘러보기</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. BIG FINAL CALL-TO-ACTION (와이드 대형 하단 배너)
         ───────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pb-12">
        <div className="relative text-center p-10 sm:p-16 rounded-3xl bg-gradient-to-b from-indigo-900 via-indigo-950 to-black text-white shadow-2xl overflow-hidden border border-indigo-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>첫 발매의 모든 순간을 함께합니다</span>
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.35] sm:leading-[1.3] break-keep">
              <span className="block">소중하게 만든 당신의 음악,</span>
              <span className="block mt-2 sm:mt-2.5">완벽한 발매 패키지로 옷을 입혀주세요</span>
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-normal">
              복잡한 툴이나 외주 고민 없이, 음원 파일 하나로 앨범아트부터 유통사 제출 시트까지 한 번에 준비해 드립니다.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={onGoToStudio}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-zinc-100 text-indigo-950 font-black text-base shadow-lg shadow-white/10 flex items-center justify-center gap-2 transition-all cursor-pointer group"
              >
                <span>스튜디오에서 발매 준비 시작하기</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={onOpenGuide}
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/20 transition-all flex items-center justify-center gap-2"
              >
                <Compass className="w-4 h-4 text-sky-400" />
                <span>첫 발매 가이드북 보기</span>
              </button>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

