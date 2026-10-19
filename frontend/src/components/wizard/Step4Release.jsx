import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Download,
  Copy,
  Check,
  Users,
  Sparkles,
  ExternalLink,
  ArrowLeft,
  Layers,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { api, toFileUrl } from '../../services/api';
import { copyToClipboard, toAppUrl } from '../../utils/clipboard';
import SurveyPanel from '../survey/SurveyPanel';

export default function Step4Release({ jobData, setJobData, onPrevStep, onGoToCommunity }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null); // 공개한 곡 (OwnerView: manage_url 포함)
  const isDemo = !jobData?.jobId || jobData.jobId.toString().startsWith('demo');

  // D6-1: 4단계 상단에서 유통사 바로 전환 가능
  const [dist, setDist] = useState(jobData?.targetDistributor || 'distrokid');

  const [pkg, setPkg] = useState(null); // 서버 Package (zip_url 은 영상까지 끝나야 생김)
  const [check, setCheck] = useState(null); // 서버 DistributorCheck (sheet_url)
  const [info, setInfo] = useState(null); // 서버 ReleaseInfo
  const [rights, setRights] = useState(null);
  const [error, setError] = useState(null);

  // 커뮤니티 공개 옵션·필수 동의
  const [listenMode, setListenMode] = useState('highlight');
  const [commentsPublic, setCommentsPublic] = useState(true);
  const [pubConsent, setPubConsent] = useState({ rights: false, public: false });
  const [consentError, setConsentError] = useState('');
  const [publishNotice, setPublishNotice] = useState(null);
  const [knownMatch, setKnownMatch] = useState(null); // 409 KNOWN_SONG_MATCH 안내 문구
  const consentBoxRef = useRef(null);

  useEffect(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6366f1', '#38bdf8', '#10b981', '#f59e0b'],
    });
  }, []);

  const handleCopy = async (val, key) => {
    if (!val) return;
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleSwitchDist = (nextDist) => {
    setDist(nextDist);
    if (setJobData) {
      setJobData((prev) => ({ ...prev, targetDistributor: nextDist }));
    }
  };

  // ZIP 은 커버를 고른 뒤 영상 렌더링(40초 안팎)이 끝나야 생긴다 → 끝날 때까지 다시 받는다
  useEffect(() => {
    if (isDemo) return;
    let timer = null;
    const load = async () => {
      try {
        const p = await api.getPackage(jobData.jobId);
        setPkg(p);
        if (p.zip_url || p.stage === 'failed') clearInterval(timer);
      } catch (err) {
        setError(err.message);
        clearInterval(timer);
      }
    };
    load();
    timer = setInterval(load, 4000);
    api.getReleaseInfo(jobData.jobId).then((r) => setInfo(r.info)).catch(() => {});
    api.getRights(jobData.jobId).then(setRights).catch(() => {});
    api.getJobTrack(jobData.jobId).then(setPublished).catch(() => {});
    return () => clearInterval(timer);
  }, [jobData?.jobId, isDemo]);

  // 유통사 전환 시 해당 유통사 시트(.CSV)와 검사 결과를 바로 갱신
  useEffect(() => {
    if (isDemo) return;
    api
      .getDistributorInspection(jobData.jobId, dist)
      .then(setCheck)
      .catch((err) => setError(err.message));
  }, [jobData?.jobId, dist, isDemo]);

  const composerLegalName = info?.credits?.find((c) => c.role === '작곡')?.legal_name?.trim() || '';
  const lyricistLegalName = info?.credits?.find((c) => c.role === '작사')?.legal_name?.trim() || '';
  const arrangerLegalName = info?.credits?.find((c) => c.role === '편곡')?.legal_name?.trim() || '';

  const getLyricsDisplay = (isDistroKid = false) => {
    if (info?.language === 'instrumental') {
      return isDistroKid ? 'Instrumental' : '연주곡 (가사 없음)';
    }
    if (info?.lyrics && info.lyrics.trim()) {
      return info.lyrics;
    }
    return '(가사를 넣어 주세요)';
  };

  const AI_LABEL = {
    none: '사용 안 함',
    tool: '믹싱·마스터링 도구로만',
    generated: 'AI가 곡·목소리를 만듦 (유통사에 AI 표기 필요)',
  };

  const helperFields = isDemo
    ? [
        { label: '아티스트명 (Artist Name)', value: jobData?.artist || 'Lucid' },
        { label: '트랙 제목 (Song Title)', value: jobData?.title || 'Midnight Echo' },
        { label: '피처링 표기 (Featured Artist)', value: jobData?.featured || '없음' },
        { label: '작곡가 실명 (Songwriter Real Name)', value: jobData?.songwriter || '홍길동' },
        { label: '가사 (Clean / Formatted Lyrics)', value: jobData?.lyrics || '자정의 잔향...' },
        { label: 'AI 생성물 표기 (AI Credits)', value: '해당 없음 (AI 도구로만 활용)' },
      ]
    : dist === 'muse'
    ? [
        { label: '앨범명 (Album Title)', value: info?.album || info?.title || jobData?.title || '' },
        { label: '트랙 제목 (Track Title)', value: info?.title || jobData?.title || '' },
        { label: '메인 아티스트명 (Artist)', value: info?.artist || jobData?.artist || '' },
        { label: '피처링 아티스트', value: info?.featuring?.join(', ') || '없음' },
        { label: '주 장르 / 세부 장르', value: [info?.genre_primary, info?.genre_secondary].filter(Boolean).join(' / ') || '미입력' },
        { label: '발매 희망일 (18:00 KST)', value: info?.release_date ? `${info.release_date} ${info.release_time || '18:00'}` : '미입력' },
        { label: '작곡가 실명 (필수)', value: composerLegalName || '실명 필요 (3단계에서 입력)' },
        { label: '작사가 실명 (필수)', value: lyricistLegalName || '실명 필요 (3단계에서 입력)' },
        { label: '편곡자 실명', value: arrangerLegalName || composerLegalName || '미입력 (선택)' },
        { label: '℗ 원반권자 / © 저작권자', value: info?.recording_holder || info?.copyright_holder || info?.artist || '본인' },
        { label: '가사 전문', value: getLyricsDisplay(false) },
        { label: 'AI 생성 음원 여부', value: AI_LABEL[rights?.answers?.ai_audio] || '자가진단 확인' },
      ]
    : [
        { label: '아티스트명 (Artist / Band Name)', value: info?.artist || jobData?.artist || '' },
        { label: '트랙 제목 (Song Title - Feat 제외)', value: info?.title || jobData?.title || '' },
        { label: '피처링 표기 (Featured Artist)', value: info?.featuring?.join(', ') || '없음' },
        { label: 'Primary Genre', value: info?.genre_primary || '미입력' },
        { label: 'Release Date', value: info?.release_date || 'ASAP / 미정' },
        { label: 'Songwriter Real Name (작곡가 실명)', value: composerLegalName || '실명 필요 (3단계에서 입력)' },
        { label: 'Explicit Lyrics (19금 가사)', value: info?.explicit ? 'Yes (Explicit)' : 'No (Clean)' },
        { label: 'Plain Lyrics (가사)', value: getLyricsDisplay(true) },
        { label: 'AI 생성물 표기 (AI Credits)', value: AI_LABEL[rights?.answers?.ai_audio] || '자가진단 확인' },
      ];

  const csvUrl = check?.sheet_url ? toFileUrl(check.sheet_url) : null;
  const zipUrl = pkg?.zip_url ? toFileUrl(pkg.zip_url) : null;
  const counts = check?.counts || {};

  const handlePublishToggle = async (confirmOriginal = false) => {
    if (published) {
      if (onGoToCommunity) onGoToCommunity();
      return;
    }
    setPublishNotice(null);

    if (!pubConsent.rights || !pubConsent.public) {
      setConsentError('아래 필수 동의 두 가지에 모두 체크해 주세요.');
      consentBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setConsentError('');
    setPublishing(true);
    setError(null);

    if (isDemo) {
      setTimeout(() => {
        const demoPub = {
          track_id: 'demo-track',
          manage_url: '/community/tracks/demo-track',
        };
        setPublished(demoPub);
        setPublishing(false);
      }, 500);
      return;
    }

    try {
      const t = await api.publishFromJob(jobData.jobId, {
        listen_mode: listenMode,
        comments_public: commentsPublic,
        consent_rights: true,
        consent_public: true,
        ai_usage: rights?.answers?.ai_audio || 'none',
        confirm_original: confirmOriginal,
      });
      setKnownMatch(null);
      setPublished(t);

      // 은희님 피드백 & 원일님 개선안: localStorage에 공개 곡 관리 링크 백업
      try {
        const raw = localStorage.getItem('balmaero_published_tracks');
        const prevList = raw ? JSON.parse(raw) : [];
        const nextList = [
          {
            track_id: t.track_id,
            title: jobData?.title || '공개 곡',
            artist: jobData?.artist || '',
            manage_url: t.manage_url,
            published_at: new Date().toISOString(),
          },
          ...prevList.filter((x) => x.manage_url !== t.manage_url),
        ].slice(0, 30);
        localStorage.setItem('balmaero_published_tracks', JSON.stringify(nextList));
      } catch {}

      // 커뮤니티 공개 완료: 관리 링크 저장 및 1분 피드백 설문을 확인하도록 화면 유지
    } catch (err) {
      if (err.code === 'KNOWN_SONG_MATCH') {
        setKnownMatch(err.message);
      } else if (err.code === 'DUPLICATE_TRACK' || err.code === 'ALREADY_PUBLISHED') {
        setPublishNotice(err.message || '이미 커뮤니티에 등록된 곡입니다. 커뮤니티 탭에서 확인해 보세요.');
        if (onGoToCommunity) {
          setTimeout(() => onGoToCommunity(), 1500);
        }
      } else {
        setPublishNotice(err.message);
      }
    } finally {
      setPublishing(false);
    }
  };

  // 관리 링크 텍스트 파일(메모장) 다운로드 기능
  const handleDownloadManageNote = (manageUrl) => {
    const fullUrl = toAppUrl(manageUrl);
    const textContent = `[발매로 (Balmaero) 곡 관리 링크 안내]\n\n곡 제목: ${jobData?.title || '내 곡'}\n아티스트: ${jobData?.artist || ''}\n공개 일시: ${new Date().toLocaleString()}\n\n관리 링크:\n${fullUrl}\n\n* 주의: 이 링크가 있어야 피드백 확인, 공개 설정 변경, 곡 삭제가 가능합니다. 안전한 곳에 보관해 주세요!\n(서비스 종료일: 2026-10-31 일괄 삭제)\n`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `발매로_관리링크_${(jobData?.title || 'track').replace(/[^a-zA-Z0-9가-힣]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Title Header (준비 완료 & 피드백 수집) */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 4. 준비 완료 & 피드백 수집
        </h2>
        <p className="text-base font-bold text-indigo-600 dark:text-indigo-400">
          {counts.fail > 0
            ? '패키지가 준비됐어요. 고칠 항목만 확인하면 돼요.'
            : '축하합니다! 유통사 등록 준비가 모두 끝났습니다 🎉'}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl mx-auto">
          원클릭 릴리즈 번들과 유통사별 맞춤 시트(.CSV)를 다운로드하고, 등록 화면 복사 도우미로 바로 접수하세요.
        </p>
      </div>

      {/* D6-1: 4단계 상단 유통사 즉시 전환 토글 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10">
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-bold text-zinc-900 dark:text-white">제출할 유통사 선택: </span>
          <span>바꾸면 아래 CSV 시트와 복사 도우미 항목이 즉시 전환됩니다.</span>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-zinc-200/80 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => handleSwitchDist('muse')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              dist === 'muse'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>뮤즈플랫폼 (국내)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchDist('distrokid')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              dist === 'distrokid'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>DistroKid (글로벌)</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}
      {!isDemo && (Number(counts.fail || 0) > 0 || Number(counts.warn || 0) > 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <span>
                3단계 검수: 반려 위험 {counts.fail || 0} · 주의 {counts.warn || 0} (확인 필요 {Number(counts.fail || 0) + Number(counts.warn || 0)}개)
              </span>
            </div>
            <button
              type="button"
              onClick={onPrevStep}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex-shrink-0 self-start sm:self-auto shadow-sm"
            >
              3단계로 가서 고치기 →
            </button>
          </div>
          {check?.items?.filter((it) => it.kind !== 'info' && (it.status === 'fail' || it.status === 'warn')).length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-500/20 text-xs">
              {check.items
                .filter((it) => it.kind !== 'info' && (it.status === 'fail' || it.status === 'warn'))
                .map((it, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${
                        it.status === 'fail'
                          ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {it.status === 'fail' ? '반려위험' : '주의'}
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-white">{it.label}:</span>
                    <span className="text-zinc-600 dark:text-zinc-300 truncate">{it.detail}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* Action Download Cards (ZIP Master Pack Hero & CSV Companion) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: ZIP Hero Bundle Card (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-zinc-900/90 to-zinc-900 border-2 border-indigo-500/50 p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-2xl shadow-indigo-950/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="space-y-3 relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>최종 마스터 릴리즈 팩</span>
              </span>
              <span className="text-xs font-bold text-zinc-400">
                {zipUrl || isDemo ? '압축 완료 · 즉시 다운로드' : '패키징 진행 중'}
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              원클릭 릴리즈 번들 (.ZIP)
            </h3>
            
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <span className="text-indigo-300 font-semibold">💡 릴리즈 번들이란?</span> 3000px 커버 아트 + 캔버스 영상 + 숏폼 비디오 + 6개 채널 홍보 카피 + 메타데이터 시트 등 유통사 제출 및 홍보에 필요한 모든 규격 에셋을 하나의 패키지로 묶은 완성본입니다.
            </p>

            {/* Content Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['🖼️ 3000px 커버 아트', '🎬 Spotify Canvas 루프', '📱 15초 숏폼 비디오', '✍️ 6개 채널 홍보 카피', '📋 크레딧 & 가사 시트'].map((item, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs font-semibold text-zinc-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-2 relative z-10">
            <a
              href={zipUrl || undefined}
              onClick={(e) => {
                if (!zipUrl && !isDemo) e.preventDefault();
              }}
              className="btn-primary text-sm sm:text-base font-extrabold px-6 py-3.5 w-full flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-500/30 group-hover:shadow-indigo-500/40 transition-all text-center"
            >
              <Download className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
              <span>{zipUrl || isDemo ? '원클릭 번들 (.ZIP) 다운로드' : '영상 합성 마무리 중 (약 30초)...'}</span>
            </a>
          </div>
        </div>

        {/* Right: CSV Companion Card (5 cols) */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-4 border border-sky-500/30 shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-extrabold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{dist === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 전용</span>
              </span>
              <span className="text-xs font-bold text-zinc-400">
                입력 양식 호환
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-white">
              웹 화면 맞춤 시트 (.CSV)
            </h3>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              선택한 유통사의 실제 웹사이트 등록 화면 순서와 동일하게 정렬된 메타데이터 요약 파일입니다.
            </p>

            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-black/30 border border-zinc-200 dark:border-white/5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center justify-between font-medium">
                <span>정렬 순서:</span>
                <span className="font-bold text-zinc-900 dark:text-white">{dist === 'distrokid' ? 'DistroKid 폼 규격' : '뮤즈플랫폼 폼 규격'}</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span>포함 항목:</span>
                <span className="font-bold text-zinc-900 dark:text-white">곡 제목, 작곡/작사 실명, 가사 등</span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <a
              href={csvUrl || undefined}
              onClick={(e) => {
                if (!csvUrl && !isDemo) e.preventDefault();
              }}
              className="btn-secondary text-sm font-bold px-5 py-3 w-full flex items-center justify-center gap-2 shadow-sm text-center border-sky-400/40 hover:border-sky-400 text-sky-600 dark:text-sky-300"
            >
              <Download className="w-4 h-4 text-sky-500" />
              <span>맞춤 시트 (.CSV) 다운로드</span>
            </a>
          </div>
        </div>
      </div>

      {/* Copy & Paste Helper Table */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-white/10">
          <div>
            <h3 className="font-bold text-base text-zinc-900 dark:text-white">
              {dist === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 등록 화면 복사 도우미
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              유통사 등록 화면을 띄워놓고 클릭 한 번으로 복사하여 붙여넣으세요.
            </p>
          </div>

          <a
            href={dist === 'distrokid' ? 'https://distrokid.com' : 'https://www.muzeplatform.com'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              api.logUsage(jobData?.jobId, 'opened_distributor', dist === 'muse' ? 'muzeplatform' : dist)
            }
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1"
          >
            <span>{dist === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 웹사이트 열기</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-white/5">
          {helperFields.map((field, idx) => {
            const isUnentered =
              !field.value ||
              field.value === '미입력' ||
              field.value.includes('아직 입력 안 함') ||
              field.value.includes('실명 필요') ||
              field.value.includes('가사를 넣어 주세요') ||
              field.value.includes('미정');

            return (
              <div key={idx} className="py-3 flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 w-1/3">
                  {field.label}
                </span>

                <div className="flex-1 min-w-0">
                  {isUnentered ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 border border-dashed border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400">
                      <span>⚠️ {field.value || '미입력'}</span>
                      <span className="text-xs text-rose-500/80 font-normal">(3단계 입력 권장)</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-zinc-900 dark:text-white flex-1 truncate block">
                      {field.value}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    handleCopy(isUnentered ? '' : field.value, idx);
                    api.logUsage(jobData?.jobId, 'copied_field', field.label.split(' (')[0]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0 shadow-sm"
                >
                  {copiedKey === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">복사됨 ✓</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>복사</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Publish to Community Card (D6-2: 필수 동의 체크박스와 버튼 인라인 피드백 통합) */}
      <div
        ref={consentBoxRef}
        className="glass-panel rounded-2xl p-6 sm:p-8 border-indigo-200 dark:border-indigo-500/30 space-y-5 bg-gradient-to-r from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900/60"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white">
                '들어봐' 커뮤니티에 공개하고 피드백 받기
              </h4>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              발매 전에 다른 인디 창작자들과 리스너들에게 곡을 들려주고 별점과 생생한 한줄평을 받아보세요.
            </p>
          </div>

          {published ? (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>커뮤니티 등록 완료!</span>
              </span>
              <button
                onClick={onGoToCommunity}
                className="btn-primary text-xs px-4 py-2.5 flex items-center gap-1.5 shadow-md font-bold"
              >
                <span>'들어봐' 커뮤니티로 바로 이동</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:items-end gap-1.5">
              <button
                onClick={() => handlePublishToggle(false)}
                disabled={publishing}
                className="btn-primary text-xs px-5 py-2.5 shadow-sm disabled:opacity-50 font-bold"
              >
                {publishing ? '등록 중...' : '지금 커뮤니티에 등록하기'}
              </button>
              {consentError && (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{consentError}</span>
                </span>
              )}
              {publishNotice && (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {publishNotice}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 공개 전: 들려줄 범위·반응 공개·필수 동의 */}
        {!published && !isDemo && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="flex flex-wrap items-center gap-2">
              <b className="w-20">들려줄 범위</b>
              {[
                ['highlight', '하이라이트 15초만'],
                ['full', '전곡'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setListenMode(v)}
                  className={`px-3 py-1.5 rounded-full border font-semibold ${
                    listenMode === v
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-zinc-300 dark:border-white/10'
                  }`}
                >
                  {l}
                </button>
              ))}
              <span className="text-zinc-500">
                발매 전 곡은 하이라이트만 권장 (공개 음원은 녹음될 수 있어요)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <b className="w-20">반응 공개</b>
              {[
                [true, '모두에게 공개'],
                [false, '나만 보기'],
              ].map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setCommentsPublic(v)}
                  className={`px-3 py-1.5 rounded-full border font-semibold ${
                    commentsPublic === v
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-zinc-300 dark:border-white/10'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div
              className={`p-3.5 rounded-xl space-y-2.5 transition-all ${
                consentError && (!pubConsent.rights || !pubConsent.public)
                  ? 'ring-2 ring-rose-500 bg-rose-50/60 dark:bg-rose-500/10'
                  : 'bg-white/70 dark:bg-[#121215]/80 border border-zinc-200 dark:border-white/10'
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pubConsent.rights}
                  onChange={(e) => {
                    const next = { ...pubConsent, rights: e.target.checked };
                    setPubConsent(next);
                    if (next.rights && next.public) setConsentError('');
                  }}
                  className="mt-0.5 rounded text-indigo-600"
                />
                <span className="font-medium">
                  [필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pubConsent.public}
                  onChange={(e) => {
                    const next = { ...pubConsent, public: e.target.checked };
                    setPubConsent(next);
                    if (next.rights && next.public) setConsentError('');
                  }}
                  className="mt-0.5 rounded text-indigo-600"
                />
                <span className="font-medium">
                  [필수] 커뮤니티에 공개하고, 내가 내리거나 서비스가 종료되는 2026-10-31까지 보관돼요. 듣는 사람들의 생생한 별점과 반응이 모여요. (발매 전 곡은 하이라이트 공개 권장)
                </span>
              </label>
            </div>

            {knownMatch && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2.5">
                <p className="font-semibold text-amber-800 dark:text-amber-200">{knownMatch}</p>
                <button
                  type="button"
                  onClick={() => handlePublishToggle(true)}
                  disabled={publishing}
                  className="btn-secondary text-xs px-3.5 py-2 font-bold"
                >
                  직접 만든 곡이 맞아요 — 올리기 (다른 사람 곡이면 내려가고 이용이 제한될 수 있어요)
                </button>
              </div>
            )}
          </div>
        )}

        {/* 공개 후: 관리 링크 (은희님 피드백: 지나치기 쉬움 ➔ 눈에 띄는 카드 및 메모장 저장 추가) */}
        {published && (
          <div className="pt-4 border-t border-zinc-200 dark:border-white/10 space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 space-y-2">
              <b className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 font-extrabold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>커뮤니티 공개 완료! 관리 링크를 반드시 저장하세요</span>
              </b>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                비로그인 상태에서는 <b>이 링크가 유일한 열쇠</b>예요! 받은 반응 확인, 공개 범위 설정 변경, 곡 삭제는 이 주소로만 가능합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-[200px] truncate p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-xs font-mono text-zinc-800 dark:text-zinc-200">
                {toAppUrl(published.manage_url)}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(toAppUrl(published.manage_url), 'manage')}
                className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1 shadow-sm font-bold"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedKey === 'manage' ? '복사됨 ✓' : '링크 복사'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadManageNote(published.manage_url)}
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1 shadow-sm font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>메모장(.txt)으로 저장</span>
              </button>
              <a
                href={toAppUrl(published.manage_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1 shadow-sm font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>열기</span>
              </a>
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between text-xs text-zinc-500">
              <span>이 브라우저에서 올린 모든 곡의 반응과 관리 링크는 내 곡 관리 페이지에서도 볼 수 있어요:</span>
              <a
                href={toFileUrl(published.manage_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>곡 관리 대시보드 바로가기</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 마지막 1분 설문 — ZIP 이 준비됐거나 커뮤니티에 올린 뒤 */}
      {!isDemo && (zipUrl || published) && <SurveyPanel kind="job" id={jobData.jobId} />}

      {/* Prev Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-zinc-200/80 dark:border-white/10">
        <button
          type="button"
          onClick={onPrevStep}
          className="btn-secondary text-sm px-6 py-3 flex items-center gap-2 shadow-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
          <span>이전 (유통사 규격 검사 다시보기)</span>
        </button>
      </div>
    </div>
  );
}
