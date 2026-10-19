import React from 'react';

export default function InteractiveBackground({ theme = 'dark' }) {
  const isDark = theme === 'dark';

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* 1. 라이트 모드 배경 레이어 (부드러운 크로스페이드) */}
      <div 
        className={`absolute inset-0 bg-[#f8fafc] transition-opacity duration-300 ease-in-out ${
          !isDark ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundColor: '#f8fafc',
          backgroundImage: `
            radial-gradient(at 12% 15%, rgba(199, 210, 254, 0.65) 0px, transparent 55%),
            radial-gradient(at 88% 12%, rgba(186, 230, 253, 0.60) 0px, transparent 50%),
            radial-gradient(at 8% 62%, rgba(233, 213, 255, 0.55) 0px, transparent 50%),
            radial-gradient(at 92% 70%, rgba(199, 210, 254, 0.55) 0px, transparent 55%),
            radial-gradient(at 48% 95%, rgba(224, 231, 255, 0.50) 0px, transparent 60%)
          `,
        }}
      >
        {/* 라이트 모드 소프트 오로라 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '-100px',
            left: '15%',
            width: '650px',
            height: '480px',
            background: 'radial-gradient(circle, rgba(199, 210, 254, 0.75) 0%, rgba(224, 231, 255, 0.35) 55%, transparent 75%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '-60px',
            right: '-5%',
            width: '600px',
            height: '450px',
            background: 'radial-gradient(circle, rgba(186, 230, 253, 0.70) 0%, rgba(224, 242, 254, 0.3) 55%, transparent 75%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '40%',
            left: '-8%',
            width: '560px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(233, 213, 255, 0.65) 0%, rgba(243, 232, 255, 0.25) 55%, transparent 75%)',
            filter: 'blur(70px)',
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            bottom: '-80px',
            right: '12%',
            width: '680px',
            height: '460px',
            background: 'radial-gradient(circle, rgba(199, 210, 254, 0.70) 0%, rgba(219, 234, 254, 0.3) 55%, transparent 75%)',
            filter: 'blur(70px)',
          }}
        />
      </div>

      {/* 2. 다크 모드 배경 레이어 (부드러운 크로스페이드) */}
      <div 
        className={`absolute inset-0 bg-[#09090b] transition-opacity duration-300 ease-in-out ${
          isDark ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundColor: '#09090b',
          backgroundImage: `
            radial-gradient(at 10% 12%, rgba(99, 102, 241, 0.32) 0px, transparent 55%),
            radial-gradient(at 88% 10%, rgba(14, 165, 233, 0.28) 0px, transparent 50%),
            radial-gradient(at 6% 58%, rgba(168, 85, 247, 0.24) 0px, transparent 50%),
            radial-gradient(at 94% 65%, rgba(79, 70, 229, 0.28) 0px, transparent 55%),
            radial-gradient(at 45% 92%, rgba(139, 92, 246, 0.22) 0px, transparent 55%)
          `,
        }}
      >
        {/* 상단 좌측: 웅장한 인디고 & 바이올렛 대형 오로라 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '-120px',
            left: '12%',
            width: '650px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.38) 0%, rgba(79, 70, 229, 0.18) 50%, transparent 75%)',
            filter: 'blur(70px)',
            transform: 'translate3d(0, 0, 0)',
          }}
        />

        {/* 상단 우측: 상쾌한 일렉트릭 시안 / 스카이 블루 글로우 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '-80px',
            right: '-5%',
            width: '600px',
            height: '480px',
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.32) 0%, rgba(56, 189, 248, 0.15) 50%, transparent 75%)',
            filter: 'blur(70px)',
            transform: 'translate3d(0, 0, 0)',
          }}
        />

        {/* 중앙 좌측: 무디 퍼플 / 마젠타 앰비언트 글로우 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '35%',
            left: '-8%',
            width: '580px',
            height: '520px',
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.26) 0%, rgba(147, 51, 234, 0.12) 50%, transparent 75%)',
            filter: 'blur(80px)',
            transform: 'translate3d(0, 0, 0)',
          }}
        />

        {/* 중하단 우측: 딥 로열 블루 & 인디고 오로라 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: '55%',
            right: '-6%',
            width: '680px',
            height: '520px',
            background: 'radial-gradient(circle, rgba(79, 70, 229, 0.32) 0%, rgba(37, 99, 235, 0.15) 50%, transparent 75%)',
            filter: 'blur(80px)',
            transform: 'translate3d(0, 0, 0)',
          }}
        />

        {/* 최하단 중앙: 딥 나이트 퍼플 틴트 */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            bottom: '-120px',
            left: '32%',
            width: '720px',
            height: '460px',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, rgba(99, 102, 241, 0.10) 50%, transparent 80%)',
            filter: 'blur(80px)',
            transform: 'translate3d(0, 0, 0)',
          }}
        />

        {/* 은은한 상단 집중 하이라이트 */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
          }}
        />
      </div>
    </div>
  );
}
