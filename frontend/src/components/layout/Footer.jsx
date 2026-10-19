import React from 'react';
import { ShieldCheck, Server, CalendarClock, ExternalLink } from 'lucide-react';
import { SERVICE_END_DATE, API_BASE } from '../../services/api';

export default function Footer() {
  const backendBase = API_BASE || 'https://api.201.n-e.kr';
  const privacyUrl = `${backendBase}/privacy`;

  return (
    <footer className="w-full relative border-t border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-[#09090b]/80 backdrop-blur-md pt-8 pb-28 md:pb-10 mt-20 transition-colors">
      {/* Decorative hairline gradient */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/25 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-5">
          {/* Brand & Service Meta */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
            <span className="font-bold text-zinc-900 dark:text-white text-sm">
              발매로 <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 font-mono">(Balmaero Studio)</span>
            </span>
            <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">•</span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              인디 뮤지션 원스톱 음원 발매 패키징 & 피드백 플랫폼
            </span>
          </div>

          {/* Action Links & System Status */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {/* FastAPI Core Server Status */}
            <div 
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold"
              title="FastAPI 백엔드 서버 정상 가동 중"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Server className="w-3.5 h-3.5" />
              <span>FastAPI Core Online</span>
            </div>

            {/* Privacy Policy Button */}
            <a 
              href={privacyUrl}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100/90 dark:bg-zinc-900/90 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-200 text-xs font-semibold transition-all shadow-sm group"
              title="개인정보처리방침 열기"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-500 group-hover:scale-110 transition-transform" />
              <span>개인정보처리방침</span>
              <ExternalLink className="w-3 h-3 text-zinc-400" />
            </a>
          </div>
        </div>

        {/* Sunset Notice Banner */}
        <div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20 font-medium">
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span>서비스 운영 종료 예정일: <strong className="font-semibold text-amber-800 dark:text-amber-300">{SERVICE_END_DATE}</strong> (종료일에 모든 작업 데이터 및 공개 곡이 일괄 정리됩니다)</span>
          </div>

          <div className="text-zinc-600 dark:text-zinc-400 text-right">
            <span>© 2026 Balmaero. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
