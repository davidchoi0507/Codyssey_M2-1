import React, { useState, useEffect } from 'react';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import WizardProgress from './components/wizard/WizardProgress';
import Step1Upload from './components/wizard/Step1Upload';
import Step2Visual from './components/wizard/Step2Visual';
import Step3Inspect from './components/wizard/Step3Inspect';
import Step4Release from './components/wizard/Step4Release';
import CommunityFeed from './components/community/CommunityFeed';
import GuideModal from './components/guide/GuideModal';
import MyTracksModal from './components/me/MyTracksModal';
import InteractiveBackground from './components/effects/InteractiveBackground';
import MobileNav from './components/layout/MobileNav';
import { tokenStorage, api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'community'
  const [currentStep, setCurrentStep] = useState(1); // 1, 2, 3, 4

  // Shared Job State across Steps
  const [jobData, setJobData] = useState({
    jobId: null,
    title: '',
    artist: '',
    featured: '',
    songwriter: '',
    producer: '',
    lyrics: '',
    selectedCover: 0,
    coverUrl: null,
    targetDistributor: 'distrokid',
  });

  // Modals & User State
  const [guideOpen, setGuideOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [user, setUser] = useState(null);

  // 1. Detect OAuth Callback Token (#session=...) on Mount
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/#session=([^&]+)/);
    if (match && match[1]) {
      const token = match[1];
      tokenStorage.set(token);
      // Clean hash
      window.history.replaceState(null, '', window.location.pathname);
      // Fetch user profile
      api.getMe()
        .then(setUser)
        .catch(() => tokenStorage.clear());
    } else {
      // 서버와 같은 주소(api.201.n-e.kr/app/)에서는 #session 없이 로그인 쿠키만 온다 → 토큰이 없어도 물어본다
      api.getMe()
        .then(setUser)
        .catch(() => tokenStorage.clear());
    }
  }, []);

  // Theme State ('dark' | 'light')
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('studio_theme');
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('studio_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const canGoToStep = () => {
    // 모든 화면을 자유롭게 이동하며 테스트할 수 있도록 허용
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-600 dark:selection:text-indigo-200 relative overflow-x-hidden transition-colors duration-200">
      
      {/* 60fps Interactive Audio Canvas & Rotating 3D Vinyl Hologram */}
      <InteractiveBackground theme={theme} />

      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenMe={() => setMeOpen(true)}
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-24 md:pb-12 z-10">
        {activeTab === 'studio' ? (
          <div className="space-y-8">
            {/* 4-Step Progress Indicator */}
            <WizardProgress
              currentStep={currentStep}
              setStep={setCurrentStep}
              canGoToStep={canGoToStep}
            />

            {/* Wizard Steps */}
            {currentStep === 1 && (
              <Step1Upload
                jobData={jobData}
                setJobData={setJobData}
                onNextStep={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 2 && (
              <Step2Visual
                jobData={jobData}
                setJobData={setJobData}
                onNextStep={() => setCurrentStep(3)}
                onPrevStep={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <Step3Inspect
                jobData={jobData}
                setJobData={setJobData}
                onNextStep={() => setCurrentStep(4)}
                onPrevStep={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 4 && (
              <Step4Release
                jobData={jobData}
                onPrevStep={() => setCurrentStep(3)}
                onGoToCommunity={() => setActiveTab('community')}
              />
            )}
          </div>
        ) : (
          <CommunityFeed
            onStartNewRelease={() => {
              setActiveTab('studio');
              setCurrentStep(1);
            }}
          />
        )}
      </main>

      {/* Footer */}
      <Footer onOpenPrivacy={() => alert('개인정보처리방침: 본 서비스는 닉네임 외의 개인정보를 수집하지 않으며, 업로드된 음원은 발매 검수 목적으로만 처리됩니다.')} />

      {/* Modals */}
      <GuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        onSelectDistributor={(dist) => {
          setJobData((prev) => ({ ...prev, targetDistributor: dist }));
          setActiveTab('studio');
          setCurrentStep(1);
        }}
      />

      <MyTracksModal
        isOpen={meOpen}
        onClose={() => setMeOpen(false)}
        user={user}
        setUser={setUser}
        onSelectJob={(job) => {
          setJobData((prev) => ({
            ...prev,
            jobId: job.job_id,
            title: job.title,
            artist: job.artist,
          }));
          setActiveTab('studio');
          setCurrentStep(3); // jump to inspect
        }}
      />

      {/* Mobile Bottom Navigation Bar (Instagram/Spotify Style) */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenMe={() => setMeOpen(true)}
        user={user}
      />

    </div>
  );
}

