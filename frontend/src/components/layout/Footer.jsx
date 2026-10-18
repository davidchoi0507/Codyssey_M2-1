import React from 'react';
import { ShieldCheck, Server } from 'lucide-react';

export default function Footer({ onOpenPrivacy }) {
  return (
    <footer className="w-full border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#050507] py-8 mt-20 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-700 dark:text-zinc-400">Indie Album Studio</span>
          <span>•</span>
          <span>인디 뮤지션 원스톱 음원 발매 패키징 & 피드백 플랫폼</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Server className="w-3.5 h-3.5 text-emerald-500" />
            <span>FastAPI Core Server Online</span>
          </div>

          <button 
            onClick={onOpenPrivacy}
            className="hover:text-zinc-800 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            개인정보처리방침
          </button>
        </div>
      </div>
    </footer>
  );
}
