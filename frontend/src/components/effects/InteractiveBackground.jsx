import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function InteractiveBackground({ theme = 'dark' }) {
  const canvasRef = useRef(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Mouse coordinates
    let mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };

    const handleMouseMove = (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
      }
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchMove, { passive: true });

    // Audio Wave Nodes & Particles
    const particleCount = 40;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.4 + 0.1,
      baseAlpha: Math.random() * 0.4 + 0.1,
    }));

    let time = 0;

    const render = () => {
      time += 0.015;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Organic Audio Frequency Sine Waves
      ctx.lineWidth = 1.2;
      for (let wave = 0; wave < 3; wave++) {
        ctx.beginPath();
        const colorsDark = [
          'rgba(99, 102, 241, 0.18)', // Indigo
          'rgba(56, 189, 248, 0.14)', // Sky
          'rgba(168, 85, 247, 0.10)', // Purple
        ];
        const colorsLight = [
          'rgba(99, 102, 241, 0.09)', // Soft Indigo
          'rgba(14, 165, 233, 0.07)', // Soft Sky
          'rgba(139, 92, 246, 0.06)', // Soft Purple
        ];
        ctx.strokeStyle = isDark ? colorsDark[wave] : colorsLight[wave];

        const waveHeight = 45 + wave * 25;
        const speed = time * (0.8 + wave * 0.3);
        const yOffset = height * (0.35 + wave * 0.15);

        for (let x = 0; x < width; x += 6) {
          const dx = x - mouse.x;
          const dist = Math.abs(dx);
          const mouseFactor = Math.max(0, 1 - dist / 300) * 40;

          const y = yOffset + Math.sin(x * 0.003 + speed) * waveHeight + Math.cos(x * 0.007 + speed * 0.5) * 20 - mouseFactor;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 2. Draw Floating Particles & Connected Constellation
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          p.alpha = Math.min(0.9, p.baseAlpha + (1 - dist / 150) * 0.6);
        } else {
          p.alpha = p.baseAlpha;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(165, 180, 252, ${p.alpha})`
          : `rgba(99, 102, 241, ${p.alpha * 0.6})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist2 = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist2 < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = isDark
              ? `rgba(99, 102, 241, ${(1 - dist2 / 110) * 0.12})`
              : `rgba(99, 102, 241, ${(1 - dist2 / 110) * 0.07})`;
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDark]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* 1. Interactive Canvas Wave & Constellation */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 2. Rotating 3D Vinyl Hologram Orbit */}
      <div className={`absolute top-[8%] right-[-5%] lg:right-[3%] w-[420px] h-[420px] pointer-events-none ${
        isDark ? 'opacity-35 mix-blend-screen' : 'opacity-20 mix-blend-multiply'
      }`}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          className={`absolute inset-0 rounded-full border border-dashed ${
            isDark ? 'border-indigo-500/30' : 'border-indigo-400/40'
          }`}
        />

        <motion.div
          animate={{ rotate: -360, scale: [1, 1.05, 1] }}
          transition={{
            rotate: { duration: 30, repeat: Infinity, ease: 'linear' },
            scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' }
          }}
          className={`absolute inset-8 rounded-full border ${
            isDark 
              ? 'border-sky-400/25 border-t-indigo-400/60 shadow-[0_0_50px_rgba(99,102,241,0.2)]' 
              : 'border-sky-500/20 border-t-indigo-500/40'
          }`}
        />

        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
          className={`absolute inset-16 rounded-full border-4 border-double flex items-center justify-center backdrop-blur-[1px] ${
            isDark 
              ? 'border-indigo-600/40 bg-gradient-to-tr from-indigo-950/30 via-transparent to-sky-950/30' 
              : 'border-indigo-300/40 bg-gradient-to-tr from-indigo-100/30 via-transparent to-sky-100/30'
          }`}
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 via-sky-500 to-indigo-400 p-0.5 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
            <div className={`w-6 h-6 rounded-full border-2 ${
              isDark ? 'bg-[#09090b] border-indigo-300' : 'bg-white border-indigo-400'
            }`} />
          </div>
        </motion.div>
      </div>

      {/* 3. Ambient Light Pools */}
      {isDark ? (
        <>
          <div className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] bg-indigo-600/8 rounded-full blur-[160px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[650px] h-[650px] bg-sky-500/6 rounded-full blur-[150px]" />
        </>
      ) : (
        <>
          <div className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] bg-indigo-200/25 rounded-full blur-[160px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[650px] h-[650px] bg-sky-100/30 rounded-full blur-[150px]" />
        </>
      )}
    </div>
  );
}
