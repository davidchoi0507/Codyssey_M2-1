import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { PackageCheck, Download, Copy, Check, Users, Sparkles, ExternalLink, ArrowLeft } from 'lucide-react';
import { api, toFileUrl } from '../../services/api';
import SurveyPanel from '../survey/SurveyPanel';

export default function Step4Release({ jobData, onPrevStep, onGoToCommunity }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null); // 공개한 곡 (OwnerView: manage_url 포함)
  const isDemo = !jobData?.jobId || jobData.jobId.toString().startsWith('demo');
  const [pkg, setPkg] = useState(null);         // 서버 Package (zip_url 은 영상까지 끝나야 생김)
  const [check, setCheck] = useState(null);     // 서버 DistributorCheck (sheet_url)
  const [info, setInfo] = useState(null);       // 서버 ReleaseInfo
  const [rights, setRights] = useState(null);
  const [error, setError] = useState(null);
  // 커뮤니티 공개 옵션·필수 동의 (서버 /studio 와 같은 항목)
  const [listenMode, setListenMode] = useState('highlight');
  const [commentsPublic, setCommentsPublic] = useState(true);
  const [pubConsent, setPubConsent] = useState({ rights: false, public: false });
  const [knownMatch, setKnownMatch] = useState(null); // 409 KNOWN_SONG_MATCH 안내 문구

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
    api.getDistributorInspection(jobData.jobId, dist).then(setCheck).catch((err) => setError(err.message));
    api.getReleaseInfo(jobData.jobId).then((r) => setInfo(r.info)).catch(() => {});
    api.getRights(jobData.jobId).then(setRights).catch(() => {});
    api.getJobTrack(jobData.jobId).then(setPublished).catch(() => {}); // 이미 공개했으면 관리 링크
    return () => clearInterval(timer);
  }, [jobData?.jobId, dist]);

  const credit = (role) => info?.credits?.filter((c) => c.role === role).map((c) => c.legal_name || c.stage_name).join(', ');
  const AI_LABEL = { none: '사용 안 함', tool: '믹싱·마스터링 도구로만', generated: 'AI가 곡·목소리를 만듦 (유통사에 AI 표기 필요)' };
  const helperFields = isDemo ? [
    { label: '아티스트명 (Artist Name)', value: jobData?.artist || 'Lucid' },
    { label: '트랙 제목 (Song Title)', value: jobData?.title || 'Midnight Echo' },
    { label: '피처링 표기 (Featured Artist)', value: jobData?.featured || '없음' },
    { label: '작곡가 실명 (Songwriter Real Name)', value: jobData?.songwriter || '홍길동' },
    { label: '가사 (Clean / Formatted Lyrics)', value: jobData?.lyrics || '자정의 잔향...' },
    { label: 'AI 생성물 표기 (AI Credits)', value: '해당 없음 (AI 도구로만 활용)' },
  ] : [
    { label: '아티스트명 (Artist Name)', value: info?.artist },
    { label: '트랙 제목 (Song Title)', value: info?.title },
    { label: '피처링 표기 (Featured Artist)', value: info?.featuring?.join(', ') || '없음' },
    { label: '작곡가 실명 (Songwriter Real Name)', value: credit('작곡') || '아직 입력 안 함' },
    { label: '작사가 실명 (Lyricist Real Name)', value: credit('작사') || '아직 입력 안 함' },
    { label: '가사 (Clean / Formatted Lyrics)', value: info?.lyrics || '없음' },
    { label: 'AI 생성물 표기 (AI Credits)', value: AI_LABEL[rights?.answers?.ai_audio] || '자가진단에서 답해 주세요' },
  ].filter((f) => f.value !== undefined);

  const csvUrl = check?.sheet_url ? toFileUrl(check.sheet_url) : null;
  const zipUrl = pkg?.zip_url ? toFileUrl(pkg.zip_url) : null;
  const counts = check?.counts || {};

  const handlePublishToggle = async (confirmOriginal = false) => {
    if (published || isDemo) return;
    if (!pubConsent.rights || !pubConsent.public) return setError('커뮤니티 공개 필수 동의 두 가지에 체크해 주세요.');
    setPublishing(true);
    setError(null);
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
    } catch (err) {
      if (err.code === 'KNOWN_SONG_MATCH') setKnownMatch(err.message);
      else setError(err.message);
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
          <span>발매 패키징 완료!</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          {counts.fail > 0 ? '패키지가 준비됐어요. 고칠 항목만 확인하면 돼요.' : '축하합니다! 유통사 제출 준비가 모두 끝났습니다.'}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">
          아래 입력 도우미 표를 보며 유통사 웹사이트에 바로 복사하여 붙여넣으시고, 원클릭 ZIP 번들을 제출용으로 다운로드하세요.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">{error}</div>
      )}
      {!isDemo && (counts.fail > 0 || counts.warn > 0) && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm">
          3단계 검사에서 고쳐야 할 항목 {counts.fail || 0}개, 확인할 항목 {counts.warn || 0}개가 남아 있어요. 제출 전에 한 번 더 확인해 주세요.
        </div>
      )}

      {/* Action Download Buttons Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href={zipUrl || undefined}
          onClick={(e) => { if (!zipUrl && !isDemo) e.preventDefault(); }}
          className="p-6 rounded-2xl bg-white dark:bg-[#121215] border border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-500 transition-all flex items-center justify-between group shadow-sm hover:shadow-md"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">제출용 일괄 파일 팩</span>
            <h3 className="font-extrabold text-base text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
              원클릭 릴리즈 번들 (.ZIP) 다운로드
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {zipUrl || isDemo ? 'WAV 음원 + 3000px 커버 + 영상 + 홍보 글 + 가사·크레딧' : '영상을 마무리하는 중이에요 (40초 안팎) — 끝나면 받을 수 있어요'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-md">
            <Download className="w-6 h-6" />
          </div>
        </a>

        <a
          href={csvUrl || undefined}
          onClick={(e) => { if (!csvUrl && !isDemo) e.preventDefault(); }}
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
            onClick={() => api.logUsage(jobData?.jobId, 'opened_distributor', dist === 'muse' ? 'muzeplatform' : dist)}
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
                onClick={() => { handleCopy(field.value, idx); api.logUsage(jobData?.jobId, 'copied_field', field.label.split(' (')[0]); }}
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

        {published ? (
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToCommunity}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <span>커뮤니티에서 확인하기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => handlePublishToggle(false)}
            disabled={publishing || isDemo}
            className="btn-secondary text-xs px-4 py-2 border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
          >
            {publishing ? '등록 중...' : '지금 커뮤니티에 등록하기'}
          </button>
        )}
      </div>

      {/* 공개 전: 들려줄 범위·반응 공개·필수 동의 / 공개 후: 관리 링크 */}
      {!published && !isDemo && (
        <div className="glass-panel rounded-2xl p-5 space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex flex-wrap items-center gap-2">
            <b className="w-20">들려줄 범위</b>
            {[['highlight', '하이라이트 15초만'], ['full', '전곡']].map(([v, l]) => (
              <button key={v} onClick={() => setListenMode(v)} className={`px-3 py-1.5 rounded-full border ${listenMode === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/10'}`}>{l}</button>
            ))}
            <span className="text-zinc-500">발매 전 곡은 하이라이트만 권장 (공개 음원은 녹음될 수 있어요)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <b className="w-20">반응 공개</b>
            {[[true, '모두에게 공개'], [false, '나만 보기']].map(([v, l]) => (
              <button key={l} onClick={() => setCommentsPublic(v)} className={`px-3 py-1.5 rounded-full border ${commentsPublic === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/10'}`}>{l}</button>
            ))}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={pubConsent.rights} onChange={(e) => setPubConsent((c) => ({ ...c, rights: e.target.checked }))} className="mt-0.5" />
            <span>[필수] 만 14세 이상이고, 직접 만든 곡이거나 공개할 권리가 있어요</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={pubConsent.public} onChange={(e) => setPubConsent((c) => ({ ...c, public: e.target.checked }))} className="mt-0.5" />
            <span>[필수] 커뮤니티에 공개하고, 내가 내릴 때까지(서비스 종료일까지) 보관돼요. 듣는 사람의 반응이 모여요. 공개 음원은 녹음될 수 있으니 발매 전 곡은 하이라이트만 공개하길 권해요</span>
          </label>
          {knownMatch && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2">
              <p>{knownMatch}</p>
              <button onClick={() => handlePublishToggle(true)} disabled={publishing} className="btn-secondary text-xs px-3 py-1.5">
                직접 만든 곡이 맞아요 — 올리기 (다른 사람 곡이면 내려가고 이용이 제한될 수 있어요)
              </button>
            </div>
          )}
        </div>
      )}
      {published && (
        <div className="glass-panel rounded-2xl p-5 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
          <b className="text-sm">관리 링크 — 꼭 저장해 두세요</b>
          <p>이 링크가 있어야 받은 반응(비공개 포함)을 보고, 설정을 바꾸고, 곡을 내릴 수 있어요. 로그인했다면 '내 곡'에서도 열 수 있어요.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate p-2 rounded bg-zinc-100 dark:bg-zinc-900">{toFileUrl(published.manage_url)}</code>
            <button onClick={() => handleCopy(toFileUrl(published.manage_url), 'manage')} className="btn-secondary text-xs px-3 py-1.5">
              {copiedKey === 'manage' ? '복사됨' : '복사'}
            </button>
            <a href={toFileUrl(published.manage_url)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5">열기</a>
          </div>
        </div>
      )}

      {/* 마지막 1분 설문 — ZIP 이 준비됐거나 커뮤니티에 올린 뒤 */}
      {!isDemo && (zipUrl || published) && <SurveyPanel kind="job" id={jobData.jobId} />}

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
