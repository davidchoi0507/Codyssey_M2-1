/**
 * ====================================================================
 * [팀원 2 담당 구역] Audio Visualizer Engine (Web Audio API + Canvas 2D)
 * ====================================================================
 * 역할: 선택된 앨범 커버를 배경으로 삼고, 오디오 재생 시 주파수 데이터(BPM/Bass)에
 *       실시간으로 반응하는 1:1 정방형 오디오 비주얼라이저 모션을 렌더링합니다.
 *       (음원 미업로드 시에도 가상 앰비언트 톤 & 리듬 모션 시뮬레이션 지원)
 */

class AudioVisualizer {
  constructor(canvasId, audioElementId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.audio = document.getElementById(audioElementId);

    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.dataArray = null;

    this.backgroundImage = new Image();
    this.backgroundImage.crossOrigin = "anonymous";
    this.isInitialized = false;
    this.animationId = null;

    // Virtual Synth Mode (음원 파일 없을 때 시연용 앰비언트 사운드 & 모션)
    this.isVirtualMode = false;
    this.virtualOsc1 = null;
    this.virtualOsc2 = null;
    this.virtualGain = null;
    this.virtualTime = 0;

    // Default placeholder background
    this.setBackgroundImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
  }

  /**
   * 브라우저 오디오 컨텍스트 초기화
   */
  initAudioContext() {
    if (this.isInitialized) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    try {
      this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      console.log("[Visualizer] MediaElementSource 이미 연결됨 또는 가상 모드 사용");
    }

    this.isInitialized = true;
  }

  /**
   * 비주얼라이저 배경 커버 아트 교체
   */
  setBackgroundImage(url) {
    this.backgroundImage.src = url;
    this.backgroundImage.onload = () => {
      this.drawIdleFrame();
    };
  }

  /**
   * 정지 상태의 정적 캔버스 렌더링
   */
  drawIdleFrame() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    if (this.backgroundImage.complete && this.backgroundImage.naturalWidth !== 0) {
      this.ctx.drawImage(this.backgroundImage, 0, 0, width, height);
    } else {
      this.ctx.fillStyle = '#141724';
      this.ctx.fillRect(0, 0, width, height);
    }

    // 어두운 오버레이
    this.ctx.fillStyle = 'rgba(10, 11, 16, 0.45)';
    this.ctx.fillRect(0, 0, width, height);

    // 정지 상태 중앙 원
    const centerX = width / 2;
    const centerY = height / 2;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.5)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // 재생 대기 아이콘(작은 삼각형)
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 6, centerY - 10);
    this.ctx.lineTo(centerX + 10, centerY);
    this.ctx.lineTo(centerX - 6, centerY + 10);
    this.ctx.fillStyle = 'rgba(0, 245, 212, 0.7)';
    this.ctx.fill();
  }

  /**
   * 실제 음원이 없을 때 시연을 위해 몽환적인 앰비언트 신스 톤을 생성
   */
  startVirtualSynthSound() {
    try {
      this.virtualGain = this.audioContext.createGain();
      this.virtualGain.gain.setValueAtTime(0.08, this.audioContext.currentTime); // 은은한 볼륨

      // Lo-Fi Chord (A minor: 220Hz + 261.63Hz)
      this.virtualOsc1 = this.audioContext.createOscillator();
      this.virtualOsc1.type = "sine";
      this.virtualOsc1.frequency.setValueAtTime(220, this.audioContext.currentTime);

      this.virtualOsc2 = this.audioContext.createOscillator();
      this.virtualOsc2.type = "triangle";
      this.virtualOsc2.frequency.setValueAtTime(329.63, this.audioContext.currentTime);

      this.virtualOsc1.connect(this.virtualGain);
      this.virtualOsc2.connect(this.virtualGain);
      this.virtualGain.connect(this.analyser);
      this.virtualGain.connect(this.audioContext.destination);

      this.virtualOsc1.start();
      this.virtualOsc2.start();
    } catch (e) {
      console.warn("Virtual synth audio error:", e);
    }
  }

  stopVirtualSynthSound() {
    try {
      if (this.virtualOsc1) {
        this.virtualOsc1.stop();
        this.virtualOsc1.disconnect();
        this.virtualOsc1 = null;
      }
      if (this.virtualOsc2) {
        this.virtualOsc2.stop();
        this.virtualOsc2.disconnect();
        this.virtualOsc2 = null;
      }
    } catch (e) {}
  }

  /**
   * 실시간 애니메이션 루프
   */
  startAnimation(forceVirtual = false) {
    if (!this.isInitialized) {
      this.initAudioContext();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isVirtualMode = forceVirtual;
    if (this.isVirtualMode) {
      this.startVirtualSynthSound();
    }

    const render = () => {
      this.animationId = requestAnimationFrame(render);
      this.virtualTime += 0.05;

      const width = this.canvas.width;
      const height = this.canvas.height;
      this.ctx.clearRect(0, 0, width, height);

      // 1. Draw Background Cover
      if (this.backgroundImage.complete) {
        this.ctx.drawImage(this.backgroundImage, 0, 0, width, height);
      }

      // 2. Frequency Analysis (실제 또는 가상 시뮬레이션)
      let bassEnergy = 0;
      const numBars = 48;

      if (!this.isVirtualMode && this.analyser) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let bassSum = 0;
        for (let i = 0; i < 10; i++) {
          bassSum += this.dataArray[i];
        }
        bassEnergy = bassSum / 10 / 255;
      } else {
        // BPM 118 (약 1.96Hz) 펄스 리듬 수학적 시뮬레이션
        const beatPulse = (Math.sin(this.virtualTime * 3.5) + 1) / 2;
        bassEnergy = 0.35 + beatPulse * 0.45;
      }

      // 3. Dynamic Dark Vignette
      const gradient = this.ctx.createRadialGradient(
        width / 2, height / 2, 35,
        width / 2, height / 2, width / 2
      );
      gradient.addColorStop(0, `rgba(0, 0, 0, ${0.15 + bassEnergy * 0.25})`);
      gradient.addColorStop(1, 'rgba(10, 11, 16, 0.88)');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);

      // 4. Circular Neon Wave Bars
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = 48 + bassEnergy * 18;
      const angleStep = (Math.PI * 2) / numBars;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 0;
        if (!this.isVirtualMode && this.dataArray) {
          const val = this.dataArray[i % this.dataArray.length];
          barHeight = (val / 255) * 35;
        } else {
          // 가상 웨이브 곡선
          const wave = Math.sin(i * 0.4 + this.virtualTime * 2) * 12;
          barHeight = 10 + Math.abs(wave) + bassEnergy * 16;
        }

        const angle = i * angleStep;
        const x1 = centerX + Math.cos(angle) * baseRadius;
        const y1 = centerY + Math.sin(angle) * baseRadius;
        const x2 = centerX + Math.cos(angle) * (baseRadius + barHeight);
        const y2 = centerY + Math.sin(angle) * (baseRadius + barHeight);

        this.ctx.beginPath();
        this.ctx.strokeStyle = i % 2 === 0 ? '#00F5D4' : '#C77DFF';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }

      // 5. Center Core Glow Circle
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, baseRadius * 0.72, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(0, 245, 212, ${0.15 + bassEnergy * 0.25})`;
      this.ctx.fill();
      this.ctx.strokeStyle = '#00F5D4';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    };

    render();
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.stopVirtualSynthSound();
    this.drawIdleFrame();
  }
}

// Global visualizer instance
window.audioVisualizer = new AudioVisualizer('visualizer-canvas', 'main-audio');
