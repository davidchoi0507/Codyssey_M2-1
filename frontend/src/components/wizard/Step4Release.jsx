import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { PackageCheck, Download, Copy, Check, Users, Sparkles, ExternalLink, ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';

export default function Step4Release({ jobData, onPrevStep, onGoToCommunity }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6366f1', '#38bdf8', '#10b981', '#f59e0b'],
    });
  }, []);

  const handleCopy = (val, key) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const dist = jobData?.targetDistributor || 'distrokid';
  const helperFields = [
    { label: '아티스트명 (Artist Name)', value: jobData?.artist || 'Lucid' },
    { label: '트랙 제목 (Song Title)', value: jobData?.title || 'Midnight Echo' },
    { label: '피처링 표기 (Featured Artist)', value: jobData?.featured || '없음' },
    { label: '작곡가 실명 (Songwriter Real Name)', value: jobData?.songwriter || '홍길동' },
    { label: '가사 (Clean / Formatted Lyrics)', value: jobData?.lyrics || '자정의 잔향...' },
    { label: 'AI 생성물 표기 (AI Credits)', value: '해당 없음 (AI 도구로만 활용)' },
    { label: '오디오 스펙 확인', value: 'WAV 24-bit / 48kHz (검수 완료)' },
    { label: '커버 이미지 규격', value: '3000 × 3000 px, RGB (검수 완료)' },
  ];

  const csvUrl = jobData?.jobId ? api.getExportCsvUrl(jobData.jobId, dist) : '#';
  const zipUrl = jobData?.jobId ? api.getPackageZipUrl(jobData.jobId) : '#';

  const handlePublishToggle = async () => {
    if (published || !jobData?.jobId) return;
    setPublishing(true);
    try {
      await api.publishToCommunity({
        job_id: jobData.jobId,
        title: jobData.title,
        artist: jobData.artist,
        genre: 'Indie Pop',
        highlight_start: 30,
      });
      setPublished(true);
    } catch (err) {
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Celebration Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>반려 위험 0% 발매 패키징 완료!</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          축하합니다! 유통사 제출 준비가 모두 끝났습니다.
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">
          아래 입력 도우미 표를 보며 유통사 웹사이트에 바로 복사하여 붙여넣으시고, 원클릭 ZIP 번들을 제출용으로 다운로드하세요.
        </p>
      </div>

      {/* Action Download Buttons Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href={zipUrl}
          download
          className="p-6 rounded-2xl bg-white dark:bg-[#121215] border border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-500 transition-all flex items-center justify-between group shadow-sm hover:shadow-md"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">제출용 일괄 파일 팩</span>
            <h3 className="font-extrabold text-base text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
              원클릭 릴리즈 번들 (.ZIP) 다운로드
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">WAV 음원 + 3000px 커버 + 가사txt + 크레딧txt</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-md">
            <Download className="w-6 h-6" />
          </div>
        </a>

        <a
          href={csvUrl}
          download
          className="p-6 rounded-2xl bg-white dark:bg-[#121215] border border-sky-200 dark:border-sky-500/30 hover:border-sky-500 transition-all flex items-center justify-between group shadow-sm hover:shadow-md"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{dist === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 전용</span>
            <h3 className="font-extrabold text-base text-zinc-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
              입력 도우미 시트 (.CSV) 다운로드
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">유통사 웹 화면 항목 순서 그대로 정렬된 데이터</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-md">
            <Download className="w-6 h-6" />
          </div>
        </a>
      </div>

      {/* Copy & Paste Helper Table */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-white/10">
          <div>
            <h3 className="font-bold text-base text-zinc-900 dark:text-white">
              {dist === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 등록 화면 복사 도우미
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">유통사 등록 화면을 띄워놓고 클릭 한 번으로 복사하여 붙여넣으세요.</p>
          </div>

          <a
            href={dist === 'distrokid' ? 'https://distrokid.com' : 'https://www.muzeplatform.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1"
          >
            <span>유통사 웹사이트 열기</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-white/5">
          {helperFields.map((field, idx) => (
            <div key={idx} className="py-3 flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 w-1/3">{field.label}</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-white flex-1 truncate">{field.value}</span>
              <button
                onClick={() => handleCopy(field.value, idx)}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0 shadow-sm"
              >
                {copiedKey === idx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>복사</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Publish to Community Toggle Card */}
      <div className="glass-panel rounded-2xl p-6 border-indigo-200 dark:border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="font-bold text-sm text-zinc-900 dark:text-white">'들어봐' 커뮤니티에 공개하고 피드백 받기</h4>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            발매 전에 다른 인디 창작자들과 리스너들에게 곡을 들려주고 별점과 생생한 한줄평을 받아보세요.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {published ? (
            <button
              onClick={onGoToCommunity}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <span>커뮤니티에서 확인하기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handlePublishToggle}
              disabled={publishing}
              className="btn-secondary text-xs px-4 py-2 border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
            >
              {publishing ? '등록 중...' : '지금 커뮤니티에 등록하기'}
            </button>
          )}
        </div>
      </div>

      {/* Prev Navigation */}
      <div className="flex items-center justify-start pt-4 border-t border-zinc-200 dark:border-white/10">
        <button
          onClick={onPrevStep}
          className="btn-secondary text-xs px-5 py-2 flex items-center gap-2 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>이전 (검사 결과 다시보기)</span>
        </button>
      </div>
    </div>
  );
}
