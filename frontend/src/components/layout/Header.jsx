import React from 'react';
import { Sparkles, Disc3, Compass, Users, LogIn, Sun, Moon, FolderHeart } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, onOpenGuide, onOpenMe, user, theme, onToggleTheme, onLogoClick }) {
  const isDark = theme === 'dark';

  const handleGoMe = () => {
    setActiveTab('me');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 dark:border-white/10 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo - 클릭 시 발매로 홈으로 이동 */}
        <div 
          onClick={onLogoClick ? onLogoClick : () => setActiveTab('home')}
          className="flex items-center gap-3 cursor-pointer group"
          title="발매로 홈으로 이동"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-white dark:bg-[#09090b] rounded-[10px] flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" style={{ animationDuration: '8s' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-zinc-900 via-indigo-950 to-indigo-600 dark:from-white dark:via-zinc-200 dark:to-indigo-300 bg-clip-text text-transparent inline-block leading-normal py-0.5">
                발매로 (Balmaero)
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                STUDIO
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">원스톱 음원 발매 패키징 & 피드백</p>
          </div>
        </div>

        {/* Navigation Tabs (홈 / 발매 준비 / 들어봐 / 내 곡 + 첫 발매 가이드) */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-1 rounded-xl border border-zinc-200 dark:border-white/5">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'home'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            홈
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'studio'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Disc3 className="w-4 h-4" />
            발매 준비
          </button>

          <button
            onClick={() => setActiveTab('community')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'community'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            들어봐 (커뮤니티)
          </button>

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <Compass className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            첫 발매 가이드
          </button>
        </nav>

        {/* Right Actions: Theme Toggle & User */}
        <div className="flex items-center gap-2.5">
          {/* Light / Dark Mode Toggle Button */}
          <button
            onClick={onToggleTheme}
            aria-label="테마 전환"
            className="p-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-all shadow-sm"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-90 transition-transform duration-300" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600 hover:-rotate-45 transition-transform duration-300" />
            )}
          </button>

          {/* User Button */}
          <button
            onClick={handleGoMe}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-medium transition-all shadow-sm ${
              activeTab === 'me'
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-200'
                : 'border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-indigo-500/40'
            }`}
          >
            {user ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">{user.nickname || '내 곡'}</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <span>로그인 / 내 곡</span>
              </>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
