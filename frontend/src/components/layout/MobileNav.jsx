import React from 'react';
import { Sparkles, Disc3, Users, Compass, FolderHeart } from 'lucide-react';

export default function MobileNav({ activeTab, setActiveTab, onOpenGuide, onOpenMe, user }) {
  const handleGoMe = () => {
    setActiveTab('me');
    if (onOpenMe) onOpenMe();
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#09090b]/90 backdrop-blur-lg border-t border-zinc-200 dark:border-white/10 px-2 py-2 flex items-center justify-around transition-colors">
      <button
        onClick={() => setActiveTab('home')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-bold transition-all ${
          activeTab === 'home'
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
        }`}
      >
        <Sparkles className={`w-5 h-5 ${activeTab === 'home' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
        <span>홈</span>
      </button>

      <button
        onClick={() => setActiveTab('studio')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-bold transition-all ${
          activeTab === 'studio'
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
        }`}
      >
        <Disc3 className={`w-5 h-5 ${activeTab === 'studio' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
        <span>발매 준비</span>
      </button>

      <button
        onClick={() => setActiveTab('community')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-bold transition-all ${
          activeTab === 'community'
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
        }`}
      >
        <Users className={`w-5 h-5 ${activeTab === 'community' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
        <span>들어봐</span>
      </button>

      <button
        onClick={handleGoMe}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-bold transition-all ${
          activeTab === 'me'
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
        }`}
      >
        <div className="relative">
          <FolderHeart className={`w-5 h-5 ${activeTab === 'me' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
          {user && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />}
        </div>
        <span>{user ? `${user.nickname || '내'} 곡` : '내 곡'}</span>
      </button>

      <button
        onClick={onOpenGuide}
        className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all"
      >
        <Compass className="w-5 h-5 text-sky-500 dark:text-sky-400" />
        <span>발매 가이드</span>
      </button>
    </nav>
  );
}
