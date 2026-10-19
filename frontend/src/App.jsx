import React, { useState, useEffect } from 'react';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import WizardProgress from './components/wizard/WizardProgress';
import StudioHeroBanner from './components/wizard/StudioHeroBanner';
import HomeLanding from './components/home/HomeLanding';
import Step1Upload from './components/wizard/Step1Upload';
import Step2Visual from './components/wizard/Step2Visual';
import Step3Inspect from './components/wizard/Step3Inspect';
import Step4Release from './components/wizard/Step4Release';
import CommunityFeed from './components/community/CommunityFeed';
import TrackManageView from './components/community/TrackManageView';
import GuideModal from './components/guide/GuideModal';
import MyTracksModal from './components/me/MyTracksModal';
import InteractiveBackground from './components/effects/InteractiveBackground';
import MobileNav from './components/layout/MobileNav';
import { tokenStorage, api, localJobsStorage, stepForStage } from './services/api';

const INITIAL_JOB_DATA = {
  jobId: null,
  title: '',
  artist: '',
  featured: '',
  songwriter: '',
  producer: '',
  lyrics: '',
  genre: '',
  selectedCover: 0,
  coverUrl: null,
  targetDistributor: 'distrokid',
};

// 127.0.0.1 로 접속 시 백엔드 CORS/OAuth 허용 도메인(localhost:3000)과 일치하도록 자동 전환
if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
  window.location.hostname = 'localhost';
}

function getManageInfoFromUrl() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  const hp = new URLSearchParams(hash);

  const isManagePath =
    path.includes('/community/manage') ||
    sp.has('manage') ||
    sp.get('mode') === 'manage';

  const trackId = sp.get('t') || sp.get('track_id') || sp.get('track') || '';
  const ownerKey =
    hp.get('key') || hp.get('k') || (!hash.includes('=') && hash.length > 5 ? hash : '') || '';

  if (isManagePath && trackId) {
    return { trackId, ownerKey };
  }
  return null;
}

export default function App() {
  const [manageInfo, setManageInfo] = useState(() => getManageInfoFromUrl());

  const [initialTrackId, setInitialTrackId] = useState(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('track') || null;
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState(() => {
    // 1. URL에 ?track= 파라미터가 있으면 저장된 탭보다 먼저 커뮤니티 탭으로 이동!
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('track')) {
        return 'community';
      }
    }
    try {
      const saved = sessionStorage.getItem('balmaero_active_tab');
      if (saved && ['home', 'studio', 'community', 'me'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'home';
  });
  
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const saved = sessionStorage.getItem('balmaero_active_step');
      return saved ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });

  // 지금까지 도달했던 최대 단계 (이전 단계로 돌아갔을 때도 기도달 단계까지의 점프 복귀를 보장)
  const [maxStepReached, setMaxStepReached] = useState(() => {
    try {
      const saved = sessionStorage.getItem('balmaero_max_step');
      const stepSaved = sessionStorage.getItem('balmaero_active_step');
      return Math.max(saved ? Number(saved) : 1, stepSaved ? Number(stepSaved) : 1);
    } catch {
      return 1;
    }
  });

  const [showJobPicker, setShowJobPicker] = useState(false);

  // Shared Job State across Steps (Persisted in sessionStorage so page reload preserves state)
  const [jobData, setJobData] = useState(() => {
    try {
      const saved = sessionStorage.getItem('balmaero_active_job_data');
      return saved ? { ...INITIAL_JOB_DATA, ...JSON.parse(saved) } : INITIAL_JOB_DATA;
    } catch {
      return INITIAL_JOB_DATA;
    }
  });

  useEffect(() => {
    if (currentStep > maxStepReached) {
      setMaxStepReached(currentStep);
    }
    try {
      sessionStorage.setItem('balmaero_active_step', String(currentStep));
      sessionStorage.setItem('balmaero_max_step', String(Math.max(maxStepReached, currentStep)));
    } catch {}
  }, [currentStep, maxStepReached]);

  useEffect(() => {
    try {
      sessionStorage.setItem('balmaero_active_job_data', JSON.stringify(jobData));
    } catch {}
  }, [jobData]);

  // 스텝 전환 및 주요 탭 전환 시 화면 최상단으로 자동 스크롤
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, activeTab]);

  // 1. Detect OAuth Callback Token (#session=...) on Mount (Must run immediately before any history replace)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const match = hash.match(/#session=([^&]+)/);
    if (match && match[1]) {
      const token = match[1];
      tokenStorage.set(token);

      // 만약 팝업창에서 열려 리다이렉트된 경우 부모 창에 토큰 전달 후 스스로 닫힘 (은희님 피드백 해결)
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'BALMAERO_AUTH_SUCCESS', token }, window.location.origin);
          window.close();
          return;
        } catch (e) {
          console.error(e);
        }
      }

      window.history.replaceState({ tab: 'me' }, '', window.location.pathname + window.location.search);
      // 전체 페이지 리다이렉트로 로그인된 경우 '내 곡' 탭으로 바로 이동
      setActiveTab('me');
      api
        .getMe()
        .then(setUser)
        .catch(() => tokenStorage.clear());
    } else {
      api
        .getMe()
        .then(setUser)
        .catch(() => tokenStorage.clear());
    }
  }, []);

  const handleTabChange = (nextTab, pushHistory = true) => {
    if (manageInfo) {
      setManageInfo(null);
    }
    if (nextTab === activeTab && !manageInfo) return;
    try {
      sessionStorage.setItem('balmaero_active_tab', nextTab);
    } catch {}
    if (pushHistory && typeof window !== 'undefined') {
      const isManagePath = window.location.pathname.includes('/community/manage');
      window.history.pushState(
        { tab: nextTab },
        '',
        isManagePath ? '/' : (window.location.pathname + window.location.search)
      );
    }
    setActiveTab(nextTab);
  };

  // 2. 브라우저 뒤로 가기 / 앞으로 가기 (popstate) 및 초기 상태 보존 (해시 보존)
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.history.state?.tab) {
      window.history.replaceState(
        { tab: activeTab },
        '',
        window.location.pathname + window.location.search + window.location.hash
      );
    }
    const onPopState = (e) => {
      const currentManage = getManageInfoFromUrl();
      if (currentManage) {
        setManageInfo(currentManage);
        return;
      }
      setManageInfo(null);
      if (e.state?.tab) {
        setActiveTab(e.state.tab);
      } else {
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Modals & User State
  const [guideOpen, setGuideOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [user, setUser] = useState(null);

  // 팝업창에서 전달된 로그인 성공 메시지 수신 처리
  useEffect(() => {
    const handleAuthMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'BALMAERO_AUTH_SUCCESS' && event.data.token) {
        tokenStorage.set(event.data.token);
        setActiveTab('me');
        api
          .getMe()
          .then((u) => {
            setUser(u);
          })
          .catch(() => tokenStorage.clear());
      }
    };
    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  // Theme State ('dark' | 'light') — 옵션 A: 미드나잇 다크 모드 기본
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const explicit = localStorage.getItem('balmaero_theme_applied_v2');
      if (explicit) {
        return localStorage.getItem('studio_theme') || 'dark';
      }
      // 옵션 A 첫 적용: 즉시 다크 모드로 설정
      localStorage.setItem('balmaero_theme_applied_v2', 'true');
      localStorage.setItem('studio_theme', 'dark');
      return 'dark';
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
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('studio_theme', nextTheme);
    setTheme(nextTheme);
  };

  const canGoToStep = (targetStep) => {
    // 1단계(업로드)는 언제든 돌아갈 수 있음
    if (targetStep === 1) return true;
    // 곡 작업(jobId)이 없을 때는 1단계 외 이동 불가
    if (!jobData?.jobId) return false;
    // 지금까지 합법적으로 도달했던 '최대 단계' 이하의 모든 단계는 자유롭게 점프 및 왕복 허용!
    // (예: 3단계 진행 중 1단계로 수정하러 가도 1~3단계 사이를 상단 바로 자유롭게 왕복 가능)
    // 하지만 아직 한 번도 도달하지 않은 미래 단계(targetStep > maxStepReached)는 엄격 차단!
    return targetStep <= maxStepReached;
  };

  const handleStartNewJob = () => {
    try {
      sessionStorage.removeItem('balmaero_active_job_data');
      sessionStorage.removeItem('balmaero_active_step');
      sessionStorage.removeItem('balmaero_max_step');
    } catch {}
    setJobData({
      ...INITIAL_JOB_DATA,
      targetDistributor: jobData.targetDistributor || 'distrokid',
    });
    setShowJobPicker(false);
    setActiveTab('studio');
    setCurrentStep(1);
    setMaxStepReached(1);
  };

  const handleSelectExistingJob = (job, targetStep = null) => {
    if (!job?.job_id) return;
    localJobsStorage.upsert(job);
    setJobData((prev) => ({
      ...prev,
      jobId: job.job_id,
      title: job.title || '',
      artist: job.artist || '',
    }));
    setShowJobPicker(false);
    setActiveTab('studio');
    const target = targetStep || stepForStage(job.stage) || 1;
    setCurrentStep(target);
    setMaxStepReached((prev) => Math.max(prev, target));
    try {
      sessionStorage.setItem('balmaero_max_step', String(target));
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-600 dark:selection:text-indigo-200 relative overflow-x-hidden transition-colors duration-200">
      {/* 깔끔한 단색 / 은은한 미세 앰비언트 배경 (디스크 및 복잡한 선 제거) */}
      <InteractiveBackground theme={theme} />

      {/* Header */}
      <Header
        activeTab={manageInfo ? 'community' : activeTab}
        setActiveTab={handleTabChange}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenMe={() => handleTabChange('me')}
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogoClick={() => handleTabChange('home')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-24 md:pb-12 z-10">
        {manageInfo ? (
          <TrackManageView
            trackId={manageInfo.trackId}
            ownerKey={manageInfo.ownerKey}
            onClose={() => handleTabChange('community')}
            onGoToCommunity={() => handleTabChange('community')}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeLanding
                onGoToStudio={() => handleTabChange('studio')}
                onGoToCommunity={() => handleTabChange('community')}
                onOpenGuide={() => setGuideOpen(true)}
              />
            )}

        {activeTab === 'studio' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* 상단 메인 히어로 박스 (스튜디오 모드: 들어봐 탭과 동일한 규격의 메인 박스) */}
            <StudioHeroBanner
              jobData={jobData}
              currentStep={currentStep}
              onOpenGuide={() => setGuideOpen(true)}
              onGoToCommunity={() => handleTabChange('community')}
              onStartNewJob={handleStartNewJob}
            />

            {/* 4-Step Progress Indicator + Active Job Bar */}
            <WizardProgress
              currentStep={currentStep}
              setStep={setCurrentStep}
              canGoToStep={canGoToStep}
              jobData={jobData}
              onStartNewJob={handleStartNewJob}
              showJobPicker={showJobPicker}
              onToggleJobPicker={() => {
                setCurrentStep(1);
                setShowJobPicker((prev) => !prev);
              }}
            />

            {/* Wizard Steps */}
            {currentStep === 1 && (
              <Step1Upload
                jobData={jobData}
                setJobData={setJobData}
                onNextStep={() => setCurrentStep(2)}
                user={user}
                showJobPicker={showJobPicker}
                setShowJobPicker={setShowJobPicker}
                onSelectExistingJob={handleSelectExistingJob}
                onStartNewJob={handleStartNewJob}
                onGoToMe={() => handleTabChange('me')}
                onGoToCommunity={() => handleTabChange('community')}
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
                setJobData={setJobData}
                onPrevStep={() => setCurrentStep(3)}
                onGoToCommunity={() => handleTabChange('community')}
              />
            )}
          </div>
        )}

        {activeTab === 'community' && (
          <CommunityFeed
            initialTrackId={initialTrackId}
            onStartNewRelease={() => {
              handleTabChange('studio');
              setCurrentStep(1);
            }}
            onGoToStudio={() => handleTabChange('studio')}
          />
        )}

        {activeTab === 'me' && (
          <MyTracksModal
            asPage={true}
            isOpen={true}
            onClose={() => handleTabChange('studio')}
            user={user}
            setUser={setUser}
            onSelectJob={(job, step) => handleSelectExistingJob(job, step)}
            onStartNewJob={handleStartNewJob}
            onGoToCommunity={() => handleTabChange('community')}
          />
        )}
          </>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Modals */}
      <GuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        onSelectDistributor={(dist) => {
          setJobData((prev) => ({ ...prev, targetDistributor: dist }));
          setActiveTab('studio');
        }}
      />

      <MyTracksModal
        isOpen={meOpen}
        onClose={() => setMeOpen(false)}
        user={user}
        setUser={setUser}
        onSelectJob={(job, step) => {
          setMeOpen(false);
          handleSelectExistingJob(job, step);
        }}
        onStartNewJob={() => {
          setMeOpen(false);
          handleStartNewJob();
        }}
        onGoToCommunity={() => {
          setMeOpen(false);
          setActiveTab('community');
        }}
      />

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        activeTab={manageInfo ? 'community' : activeTab}
        setActiveTab={handleTabChange}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenMe={() => setActiveTab('me')}
        user={user}
      />
    </div>
  );
}
