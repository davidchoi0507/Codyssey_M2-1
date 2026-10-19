import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Plus,
  Trash2,
  Save,
  FileText,
  Calendar,
} from 'lucide-react';
import { api } from '../../services/api';

const FALLBACK_QUESTIONS = [
  {
    id: 'song_type',
    question: '이 곡은 직접 만든 오리지널 자작곡인가요?',
    help: '리메이크·커버·번안곡은 원저작자 허락이나 별도 정산 절차가 필요해요.',
    options: {
      original: '네, 순수 창작곡이에요',
      cover: '다른 가수의 곡을 부른 커버·리메이크예요',
      arrange: '기존 곡을 편곡·리믹스했어요',
      public: '저작권 만료 곡(클래식·민요 등)을 편곡했어요',
    },
  },
  {
    id: 'coauthors',
    question: '작사·작곡·편곡에 함께 참여한 공동 창작자가 있나요?',
    help: '공동 창작자가 있다면 발매 전 지분율 합의가 끝나 있어야 분쟁을 막을 수 있어요.',
    options: {
      solo: '혼자 다 만들었어요 (1인 창작)',
      agreed: '공동 창작자 모두와 발매·지분 합의를 마쳤어요',
      pending: '함께 만든 사람이 있는데 아직 합의 전이에요',
    },
  },
  {
    id: 'samples',
    question: '외부 샘플이나 루프(Splice, 무료 샘플팩 등)를 사용했나요?',
    help: '유튜브 무료 비트나 출처 불명 샘플은 Content ID 충돌로 반려될 수 있어요.',
    options: {
      none: '샘플 없이 직접 연주·미디로 찍었어요',
      pack: '상업적 발매가 허용된 유료/로열티 프리 샘플(Splice 등)만 썼어요',
      other_song: '다른 음원·영화·유튜브 소리를 일부 샘플링했어요',
    },
  },
  {
    id: 'beat_license',
    question: '구매하거나 빌린 비트(타입비트 등)를 사용했나요?',
    help: '비독점(Lease) 비트는 유통 한도나 Content ID 등록 제한이 있는지 계약서를 확인해야 해요.',
    options: {
      no_beat: '외부 비트를 쓰지 않았어요',
      exclusive: '독점권(Exclusive) 또는 무제한 상업 발매 라이선스가 있어요',
      leased: '비독점(Lease) 또는 무료 다운로드 비트를 썼어요',
    },
  },
  {
    id: 'ai_audio',
    question: '곡 제작에 AI 생성 오디오(Suno, Udio, AI 보컬 등)를 사용했나요?',
    help: '유통사마다 AI 생성 음원 표기 의무나 허용 범위가 달라요.',
    options: {
      none: 'AI 오디오를 쓰지 않았어요',
      tool: '마스터링·노이즈 제거 등 보조 도구로만 썼어요',
      generated: 'AI가 멜로디·반주·보컬의 일부 또는 전부를 생성했어요',
    },
  },
  {
    id: 'performers',
    question: '보컬·세션 연주자 등 실연자의 녹음 사용 동의를 받았나요?',
    help: '가이드 보컬이나 세션 연주자도 상업 발매 동의(또는 세션비 정산)가 필요해요.',
    options: {
      self_only: '노래·연주 모두 제가 직접 했어요',
      consented: '참여한 모든 보컬·연주자에게 발매 동의를 받았어요',
      unconfirmed: '아직 동의를 받지 못한 참여자가 있어요',
    },
  },
  {
    id: 'lyrics_clearance',
    question: '가사에 타인의 저작물(시, 소설, 영화 대사, 상표 등)이 들어가 있나요?',
    help: '유명 문구나 대사를 허락 없이 인용하면 저작권 문제가 생길 수 있어요.',
    options: {
      clean: '전부 직접 쓴 가사거나 가사가 없는 연주곡이에요',
      quoted: '인용·오마주한 문구가 있어서 확인이 필요해요',
    },
  },
  {
    id: 'explicit_content',
    question: '가사에 욕설, 비속어, 성적·폭력적 표현이 포함되어 있나요?',
    help: '욕설이 있는데 19금(Explicit) 표기를 누락하면 해외 스토어에서 반려돼요.',
    options: {
      clean: '없어요 (전 연령 청취 가능)',
      explicit: '포함되어 있어요 (Explicit 표기 예정)',
    },
  },
  {
    id: 'cover_art_rights',
    question: '앨범 커버 이미지의 저작권·초상권에 문제가 없나요?',
    help: '핀터레스트·구글 이미지나 타인의 얼굴 사진, 유명 브랜드 로고는 반려 사유예요.',
    options: {
      owned: '직접 촬영·제작했거나 본 서비스 AI 커버(상업 이용 가능)를 썼어요',
      licensed: '상업적 이용이 허락된 스톡·외주 일러스트예요',
      unsure: '인터넷에서 찾은 이미지이거나 출처가 불분명해요',
    },
  },
  {
    id: 'prior_release',
    question: '이 곡을 이전에 정식 발매했거나 다른 유통사에 등록한 적이 있나요?',
    help: '재발매라면 이전 유통사 내려받기(테이크다운) 또는 동일 ISRC 코드가 필요해요.',
    options: {
      first: '이번이 첫 정식 발매예요 (사운드클라우드·유튜브 개인 공개만 함)',
      reissue: '이전에 다른 유통사를 통해 정식 발매한 적이 있어요',
    },
  },
];

function getAiInspectionTip(name = '', desc = '') {
  const text = `${name} ${desc}`.toLowerCase();
  if (text.includes('포맷') || text.includes('비트') || text.includes('mp3') || text.includes('wav')) {
    return '유통사 오디오 규격: Spotify·Apple Music 등 공식 스토어는 16/24-bit 44.1/48kHz 무손실 WAV 파일만 정식 통과됩니다. mp3 업로드 시 유통사 반려되므로 Step 1에서 원본 WAV 파일로 교체해 주세요.';
  }
  if (text.includes('songwriter') || text.includes('실명') || text.includes('작곡') || text.includes('작사')) {
    return '저작권 정산 규격: 음악 저작권료 분배 및 신탁 관리를 위해 예명(활동명) 대신 주민등록상 실명(Legal Name)을 필수로 요구합니다. 아래 [참여진 크레딧] 칸에 실명을 입력해 주세요.';
  }
  if (text.includes('자작곡') || text.includes('커버') || text.includes('원곡')) {
    return '권리 확인 규격: 커버곡 또는 타 음원 샘플링이 포함된 경우 원저작자의 라이선스 계약이나 커버곡 표기가 필요합니다. [2. 권리 자가진단] 1번 및 3번 문항을 확인해 주세요.';
  }
  if (text.includes('apple music') || text.includes('연주자') || text.includes('크레딧')) {
    return 'Apple Music 필수 규격: Apple Music은 최소 1명 이상의 실연자(보컬 또는 악기 연주) 크레딧을 요구합니다. 아래 참여진 크레딧에서 보컬/연주 역할을 추가해 주세요.';
  }
  if (text.includes('가사') || text.includes('반복') || text.includes('chorus')) {
    return '가사 표기 규격: "Chorus 2x", "후렴 반복" 같은 생략 기호는 유통사 자동 검수에서 100% 반려됩니다. 노래에서 실제로 들리는 그대로 모든 소절을 풀어서 작성해 주세요.';
  }
  if (text.includes('커버') || text.includes('해상도') || text.includes('3000')) {
    return '커버 아트 규격: 최소 3000×3000px 정방형 RGB JPG 파일이어야 하며, SNS 아이디(@), 사이트 주소, 가격, 바코드가 들어가면 유통사에서 반려됩니다.';
  }
  if (text.includes('true peak') || text.includes('라우드니스')) {
    return '음압 제어 가이드: 피크 레벨이 -1.0 dBTP를 넘으면 스트리밍 인코딩 시 음원 왜곡(클리핑)이 발생합니다. 마스터링 음압을 -1.0 dBTP 이하로 조절해 주세요.';
  }
  if (text.includes('멜론') || text.includes('국내')) {
    return '국내 유통 가이드: 멜론·지니 등 국내 플랫폼은 DistroKid와 직연결되지 않습니다. 국내 정식 발매를 원하시면 상단 탭에서 뮤즈플랫폼 프로파일을 선택해 주세요.';
  }
  return '유통사 검수 기준에 미달하는 항목입니다. 아래 상세 입력란을 확인하시고 권장 규격에 맞춰 수정한 후 [발매 정보 저장 & 재검사]를 눌러주세요.';
}

export default function Step3Inspect({ jobData, setJobData, onNextStep, onPrevStep }) {
  const isDemo = !jobData?.jobId || jobData.jobId.toString().startsWith('demo');
  const [distributor, setDistributor] = useState(jobData?.targetDistributor || 'distrokid'); // 'distrokid' | 'muse'
  const [inspectData, setInspectData] = useState(null); // 서버 DistributorCheck
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState(null);
  const datePickerRef = useRef(null);

  // D5-1: 10문항 단계형 권리 자가진단 상태
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [answers, setAnswers] = useState({});
  const [rightsResult, setRightsResult] = useState(null);
  const [activeQIndex, setActiveQIndex] = useState(0);
  const [rightsExpanded, setRightsExpanded] = useState(true);
  const [savingRights, setSavingRights] = useState(false);

  // D5-2: 발매 기본 정보 & 메타데이터 수정 상태
  const [releaseInfo, setReleaseInfo] = useState({
    album: jobData?.title || '',
    title: jobData?.title || '',
    version: '',
    artist: jobData?.artist || '',
    featuring: jobData?.featured ? [jobData.featured] : [],
    genre_primary: 'Indie / Pop',
    genre_secondary: '',
    language: 'ko',
    explicit: false,
    release_date: '',
    release_time: '18:00',
    credits: [
      { role: '작곡', legal_name: jobData?.songwriter || '', stage_name: jobData?.artist || '' },
      { role: '작사', legal_name: jobData?.songwriter || '', stage_name: jobData?.artist || '' },
    ],
    lyrics: jobData?.lyrics || '',
    copyright_holder: jobData?.artist || '',
    recording_holder: jobData?.artist || '',
    isrc: '',
    previous_release: false,
  });
  const [featuringInput, setFeaturingInput] = useState(jobData?.featured || '');
  const [releaseChecks, setReleaseChecks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSavedMsg, setInfoSavedMsg] = useState('');

  const fetchInspection = async (dist) => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInspectData(await api.getDistributorInspection(jobData.jobId, dist));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInspection(distributor);
  }, [distributor, jobData?.jobId]);

  // 질문 목록 + 기존 자가진단 답변 + 발매 정보 불러오기
  useEffect(() => {
    api
      .getRightsQuestions()
      .then((qs) => {
        if (Array.isArray(qs) && qs.length > 0) setQuestions(qs);
      })
      .catch(() => {});

    if (isDemo) return;

    api
      .getRights(jobData.jobId)
      .then((r) => {
        setRightsResult(r);
        const a = r?.answers || {};
        setAnswers(a);
        // 모두 답했으면 접어 두기
        if (r?.complete) {
          setRightsExpanded(false);
        }
      })
      .catch(() => {});

    api
      .getReleaseInfo(jobData.jobId)
      .then((view) => {
        if (view?.info) {
          setReleaseInfo((prev) => ({
            ...prev,
            ...view.info,
            credits:
              Array.isArray(view.info.credits) && view.info.credits.length > 0
                ? view.info.credits
                : prev.credits,
          }));
          setFeaturingInput((view.info.featuring || []).join(', '));
        }
        setReleaseChecks(view?.checks || []);
        setSuggestions(view?.suggestions || []);
      })
      .catch(() => {});
  }, [jobData?.jobId, isDemo]);

  const totalQuestions = questions.length || 10;
  const answeredCount = questions.filter((q) => Boolean(answers[q.id])).length;
  const allRightsAnswered = answeredCount >= totalQuestions;

  const handleSelectOption = async (qid, optVal) => {
    const wasAllAnswered = answeredCount >= totalQuestions;
    const nextAnswers = { ...answers, [qid]: optVal };
    setAnswers(nextAnswers);

    // 처음 답변 중일 때는 다음 미응답 문항으로 이동, 이미 완료 후 수정 중일 때는 현재 문항 유지
    if (!wasAllAnswered) {
      const nextUnansweredIdx = questions.findIndex((q, idx) => idx > activeQIndex && !nextAnswers[q.id]);
      const anyUnansweredIdx = questions.findIndex((q) => !nextAnswers[q.id]);
      if (nextUnansweredIdx !== -1) {
        setActiveQIndex(nextUnansweredIdx);
      } else if (anyUnansweredIdx !== -1) {
        setActiveQIndex(anyUnansweredIdx);
      }
    }

    if (isDemo) return;
    setSavingRights(true);
    try {
      const r = await api.saveRights(jobData.jobId, nextAnswers);
      setRightsResult(r);
      // 은희님 피드백: 기존 답변 수정 시에는 완료 상태로 바로 튕겨나가지(접히지) 않음.
      // 처음으로 모든 문항을 완료했을 때만 800ms 뒤 접힘.
      if (r?.complete && !wasAllAnswered) {
        setTimeout(() => {
          setRightsExpanded(false);
        }, 800);
      }
      fetchInspection(distributor);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRights(false);
    }
  };

  // 발매 정보 저장
  const handleSaveReleaseInfo = async (customInfo = null) => {
    const payload = customInfo || {
      ...releaseInfo,
      featuring: featuringInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    setReleaseInfo(payload);
    setJobData((prev) => ({
      ...prev,
      title: payload.title || prev.title,
      artist: payload.artist || prev.artist,
      featured: (payload.featuring || []).join(', '),
      lyrics: payload.lyrics ?? prev.lyrics,
    }));

    if (isDemo) {
      setInfoSavedMsg('저장되었습니다 ✓');
      setTimeout(() => setInfoSavedMsg(''), 3000);
      return;
    }

    setSavingInfo(true);
    setInfoSavedMsg('');
    try {
      const view = await api.saveReleaseInfo(jobData.jobId, payload);
      if (view?.info) {
        setReleaseInfo(view.info);
        setFeaturingInput((view.info.featuring || []).join(', '));
      }
      setReleaseChecks(view?.checks || []);
      setSuggestions(view?.suggestions || []);
      setInfoSavedMsg('발매 정보가 저장되었고 규격 재검사를 마쳤어요 ✓');
      fetchInspection(distributor);
      setTimeout(() => setInfoSavedMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  // 권장 표기 자동 다듬기 (제목의 Feat. 분리, 이모지 제거, 연주곡 언어 설정 등)
  const handleApplySuggestions = () => {
    let nextTitle = releaseInfo.title || '';
    let nextAlbum = releaseInfo.album || nextTitle;
    let nextFeaturing = featuringInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // (Feat. XXX) 또는 [feat. XXX] 추출
    const featMatch = nextTitle.match(/[(\[][\s]*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)[)\]]/i);
    if (featMatch && featMatch[1]) {
      const extracted = featMatch[1]
        .split(/[,&]/)
        .map((s) => s.trim())
        .filter(Boolean);
      nextFeaturing = Array.from(new Set([...nextFeaturing, ...extracted]));
      nextTitle = nextTitle.replace(featMatch[0], '').trim();
    }

    // 이모지·특수 기호 정리
    nextTitle = nextTitle.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    nextAlbum = nextAlbum.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

    const nextLang =
      !releaseInfo.lyrics || !releaseInfo.lyrics.trim() ? 'instrumental' : releaseInfo.language || 'ko';

    const cleaned = {
      ...releaseInfo,
      title: nextTitle,
      album: nextAlbum || nextTitle,
      featuring: nextFeaturing,
      language: nextLang,
    };
    setFeaturingInput(nextFeaturing.join(', '));
    handleSaveReleaseInfo(cleaned);
  };

  // 발매 희망일 리드타임 및 유통사 등록 마감일 자동 계산 (미영님 피드백 반영)
  const getReleaseDateFeedback = () => {
    if (!releaseInfo.release_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${releaseInfo.release_date}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        tone: 'rose',
        text: '과거 날짜가 선택되었어요. 오늘 이후의 발매 희망일을 골라 주세요.',
        deadlineText: null,
      };
    }

    // 마감일 계산 (서버 leadItem.due_date 가 있으면 우선 적용)
    const serverDueDate = leadItem?.due_date;
    const deadlineDays = distributor === 'muse' ? 15 : 7;
    const deadlineDate = new Date(target);
    deadlineDate.setDate(deadlineDate.getDate() - deadlineDays);
    const deadlineFormatted = serverDueDate || `${deadlineDate.getMonth() + 1}월 ${deadlineDate.getDate()}일`;

    if (distributor === 'muse') {
      if (diffDays < 15) {
        return {
          tone: 'rose',
          text: `뮤즈플랫폼(국내 유통)은 발매 최소 15일 전까지 접수해야 해요 (현재 D-${diffDays}).`,
          deadlineText: `⚠️ 접수 마감 기한이 이미 지났어요. 희망일을 최소 15일 뒤로 변경해 주세요.`,
        };
      }
      if (diffDays < 21) {
        return {
          tone: 'amber',
          text: `뮤즈플랫폼 권장 접수 기한(3주 전)보다 일정이 빠듯해요 (현재 D-${diffDays}).`,
          deadlineText: `📅 발매일에 맞추려면 늦어도 "${deadlineFormatted}"까지 유통사 등록을 완료해야 해요.`,
        };
      }
      return {
        tone: 'emerald',
        text: `뮤즈플랫폼 여유 접수 가능 일정이에요 (현재 D-${diffDays}).`,
        deadlineText: `📅 발매 희망일에 맞추려면 늦어도 "${deadlineFormatted}"까지 유통사에 등록하세요.`,
      };
    } else {
      if (diffDays < 7) {
        return {
          tone: 'amber',
          text: `발매일까지 D-${diffDays}일 남았어요. 음원 공개는 가능하지만 스포티파이 에디토리얼 피칭(최소 7일 전)은 어려워요.`,
          deadlineText: `📅 스포티파이 피칭 마감일: 최소 7일 전("${deadlineFormatted}")까지 등록 권장`,
        };
      }
      if (diffDays < 28) {
        return {
          tone: 'sky',
          text: `DistroKid 발매 및 스포티파이 피칭이 가능해요 (현재 D-${diffDays}, 여유로운 글로벌 피칭 권장 기한은 4주 전).`,
          deadlineText: `📅 발매 희망일에 맞추려면 늦어도 "${deadlineFormatted}"까지 유통사 등록을 완료하세요.`,
        };
      }
      return {
        tone: 'emerald',
        text: `글로벌 스토어 검수 및 플레이리스트 피칭에 충분한 일정이에요 (현재 D-${diffDays}).`,
        deadlineText: `📅 발매 희망일에 맞추려면 늦어도 "${deadlineFormatted}"까지 유통사 등록을 완료하세요.`,
      };
    }
  };

  const dateFeedback = getReleaseDateFeedback();

  const handleDistributorSwitch = (dist) => {
    setDistributor(dist);
    setJobData((prev) => ({ ...prev, targetDistributor: dist }));
  };

  const handleProceed = () => {
    if (!isDemo && !allRightsAnswered) return;
    setJobData((prev) => ({
      ...prev,
      targetDistributor: distributor,
    }));
    onNextStep();
  };

  const allItems = inspectData?.items || [];
  const checkItems = inspectData
    ? allItems.filter((i) => i.kind !== 'info')
    : isDemo
    ? [
        { id: 'audio', label: '오디오 포맷 및 비트심도', status: 'pass', detail: 'WAV 24-bit / 48kHz 무손실 규격 적합' },
        { id: 'peak', label: 'True Peak 라우드니스', status: 'pass', detail: '-1.0 dBTP 이하로 스트리밍 왜곡 위험 없음' },
        { id: 'cover_res', label: '커버 이미지 해상도 & 색공간', status: 'pass', detail: '3000 × 3000 px, RGB (sRGB) 충족' },
        { id: 'cover_txt', label: '커버 텍스트 금지 요소', status: 'pass', detail: 'URL, 바코드, SNS 아이디, 가격 미포함' },
        { id: 'meta_title', label: '트랙 제목 및 피처링 표기', status: 'pass', detail: 'Spotify / Apple Music Style Guide 준수' },
        { id: 'lyrics_fmt', label: '가사 형식 요건', status: 'warn', detail: '반복 구절 생략 표기 주의 필요 (Chorus 2x 등 지양)', fix: '가사 입력란에서 Chorus 2x 등의 축약 표기를 실제 가사 전체로 풀어 적어 주세요.' },
      ]
    : [];

  const infoItems = inspectData
    ? allItems.filter((i) => i.kind === 'info')
    : [];

  // lead item (서버 계산 등록 마감일)
  const leadItem = allItems.find((i) => i.id === 'lead');

  const counts = inspectData?.counts || {
    fail: checkItems.filter((c) => c.status === 'fail').length,
    warn: checkItems.filter((c) => c.status === 'warn').length,
  };

  const failCount = counts.fail || 0;
  const warnCount = counts.warn || 0;

  const risk =
    failCount > 0 || warnCount > 0
      ? {
          label: `반려 위험 ${failCount} · 주의 ${warnCount}`,
          tone: failCount > 0 ? 'rose' : 'amber',
        }
      : {
          label: '반려 위험 없음 (모두 적합) ✓',
          tone: 'emerald',
        };

  const currentQ = questions[activeQIndex] || questions[0];
  const rightsWarnings = (rightsResult?.items || []).filter(
    (it) => it.status === 'warn' || it.status === 'fail'
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Step 3. 권리 자가진단 · 발매 정보 · 유통사 규격 검사
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          저작권·권리 10문항 진단과 발매 메타데이터를 점검하고, 유통사별 반려 위험을 사전에 해결합니다.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Distributor Tabs */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => handleDistributorSwitch('distrokid')}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            distributor === 'distrokid'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-105'
              : 'glass-panel text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>DistroKid (글로벌 150+ 플랫폼)</span>
        </button>

        <button
          onClick={() => handleDistributorSwitch('muse')}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            distributor === 'muse'
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/25 scale-105'
              : 'glass-panel text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>뮤즈플랫폼 (멜론·지니 국내 중심)</span>
        </button>
      </div>

      {/* 1. Main Inspection HUD Card (최상단 실시간 반려 위험도 HUD) */}
      <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-6 border border-zinc-200/80 dark:border-white/10 shadow-xl">
        {/* Inspection Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200/80 dark:border-white/10 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                <span>1. {distributor === 'distrokid' ? 'DistroKid' : '뮤즈플랫폼'} 전용 실시간 검수 프로파일</span>
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-500/30">
                실시간 진단
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              오디오 무손실 규격, 3000px 커버 규격, 메타데이터 표기법 및 권리 검증 결과를 종합 진단합니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 border shadow-sm ${
                risk.tone === 'rose'
                  ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : risk.tone === 'amber'
                  ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {loading ? (
                <span>검사 중...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{risk.label}</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Check Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {checkItems.map((check, idx) => {
            const isPass = check.status === 'pass' || check.status === 'ok';
            const isWarn = check.status === 'warn';
            const isTodo = check.status === 'todo';
            const fixGuide = check.fix || getAiInspectionTip(check.label, check.detail);

            return (
              <div
                key={check.id || idx}
                className={`p-4 rounded-xl bg-white dark:bg-[#121215] border transition-all shadow-sm flex items-start gap-3 ${
                  !isPass
                    ? 'border-amber-400/40 dark:border-amber-500/30'
                    : 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                {isPass ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : isWarn || isTodo ? (
                  <AlertTriangle
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      isTodo ? 'text-sky-500' : 'text-amber-500'
                    }`}
                  />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                )}

                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                      {check.label}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        isPass
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : isWarn
                          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          : isTodo
                          ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300'
                          : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {isPass ? 'PASS' : isWarn ? '주의' : isTodo ? '직접 확인' : '반려위험'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                    {check.detail}
                  </p>

                  {/* 해결 방법 (서버 fix 노출, AI 딱지 없이 명확한 가이드) */}
                  {!isPass && fixGuide && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold mr-1 text-amber-800 dark:text-amber-300">💡 해결 방법:</span>
                        <span>{fixGuide}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* infoItems: 알아 둘 것 (유통사 참고 정보) 격리 영역 */}
        {infoItems.length > 0 && (
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span>ℹ️ 알아 둘 것 (유통사 참고 정보)</span>
              </span>
              <span className="text-[11px] text-zinc-400">
                반려 위험 카운트에서 제외된 유통 정책·비용 참고 안내입니다.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {infoItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#121215]/60 border border-zinc-200/70 dark:border-white/5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {item.label}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      참고
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. D5-1: 권리 및 저작권 10문항 단계형 자가진단 카드 */}
      <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-5 border border-zinc-200/80 dark:border-white/10 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
            <span className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white">
              2. 권리 및 저작권 자가진단 (10문항 필수)
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                allRightsAnswered
                  ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
              }`}
            >
              {allRightsAnswered ? `자가진단 완료 ✓ (${answeredCount}/${totalQuestions})` : `답한 문항 ${answeredCount} / ${totalQuestions}`}
            </span>
            {savingRights && (
              <span className="text-xs text-zinc-400 animate-pulse">저장 중...</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setRightsExpanded((prev) => !prev)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <span>{rightsExpanded ? '접기' : '문항 다시 보기 / 수정'}</span>
            {rightsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* 진행률 막대 */}
        <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.round((answeredCount / totalQuestions) * 100))}%` }}
          />
        </div>

        {/* 주의/필요 서류 요약 (항상 표시) */}
        {(rightsWarnings.length > 0 || (rightsResult?.documents || []).length > 0) && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 space-y-2 text-xs">
            {rightsWarnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{w.label}: </span>
                  <span>{w.detail}</span>
                </div>
              </div>
            ))}
            {(rightsResult?.documents || []).length > 0 && (
              <div className="pt-2 border-t border-amber-200/60 dark:border-amber-500/20 text-amber-900 dark:text-amber-300">
                <span className="font-bold">📄 유통사 제출 시 필요한 확인 서류: </span>
                <span>{rightsResult.documents.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {/* 자가진단 10문항 완료 시 접힌 상태에서의 긍정적 안심 요약 카드 */}
        {!rightsExpanded && allRightsAnswered && (
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
                  권리 자가진단 10문항 완료 (유통사 제출 요건 충족)
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  자작곡 여부, 샘플 라이선스, AI 표기, 커버 권리 등 10개 문항에 대한 자가진단을 마쳤습니다.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRightsExpanded(true)}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[#121215] text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors flex-shrink-0"
            >
              답변 다시보기 / 수정
            </button>
          </div>
        )}

        {rightsExpanded && currentQ && (
          <div className="space-y-5 pt-1">
            {/* 문항 번호 버튼 줄 */}
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, idx) => {
                const isAnswered = Boolean(answers[q.id]);
                const isCurrent = idx === activeQIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setActiveQIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      isCurrent
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm scale-105'
                        : isAnswered
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/5'
                    }`}
                  >
                    Q{idx + 1} {isAnswered && '✓'}
                  </button>
                );
              })}
            </div>

            {/* 현재 질문 카드 */}
            <div className="p-5 rounded-xl bg-zinc-50 dark:bg-[#121215] border border-zinc-200 dark:border-white/10 space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  질문 {activeQIndex + 1} / {totalQuestions}
                </span>
                <h4 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white">
                  {currentQ.question}
                </h4>
                {currentQ.help && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{currentQ.help}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {Object.entries(currentQ.options || {}).map(([optVal, optLabel]) => {
                  const selected = answers[currentQ.id] === optVal;
                  return (
                    <button
                      key={optVal}
                      type="button"
                      onClick={() => handleSelectOption(currentQ.id, optVal)}
                      className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center justify-between gap-3 ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : 'bg-white dark:bg-[#18181b] text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-white/10 hover:border-indigo-400'
                      }`}
                    >
                      <span>{optLabel}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 이미 답한 질문 요약 리스트 (클릭 시 바로 수정) */}
            {answeredCount > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  응답한 항목 (클릭하여 수정)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {questions.map((q, idx) => {
                    const ans = answers[q.id];
                    if (!ans) return null;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setActiveQIndex(idx)}
                        className="text-left p-2.5 rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/5 hover:border-indigo-400 transition-colors flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-medium text-zinc-500 dark:text-zinc-400 truncate">
                          Q{idx + 1}. {q.question}
                        </span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                          {q.options?.[ans]?.split(' ')[0] || ans}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. D5-2: 발매 기본 정보 & 메타데이터 표기 규격 카드 */}
      <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-6 border border-zinc-200/80 dark:border-white/10 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <FileText className="w-5 h-5 text-indigo-500" />
              <h3 className="font-extrabold text-base sm:text-lg text-zinc-900 dark:text-white">
                3. 발매 메타데이터 & 희망일 점검
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              유통사 제출 시 가장 많이 반려되는 제목·피처링 표기, 가사 언어, 발매 희망일을 바로 수정할 수 있어요.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {infoSavedMsg && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {infoSavedMsg}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleSaveReleaseInfo()}
              disabled={savingInfo}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingInfo ? '저장 중...' : '발매 정보 저장 & 재검사'}</span>
            </button>
          </div>
        </div>

        {/* 자동 다듬기 제안 배너 */}
        {suggestions.length > 0 && (
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>유통사 표기 규격 자동 다듬기 제안 ({suggestions.length}건)</span>
              </div>
              <ul className="list-disc list-inside text-indigo-700 dark:text-indigo-300 space-y-0.5">
                {suggestions.map((s) => (
                  <li key={s.id}>{s.message}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={handleApplySuggestions}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex-shrink-0 shadow-sm"
            >
              권장 표기로 한 번에 고치기
            </button>
          </div>
        )}

        {/* 핵심 입력 필드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              트랙 제목 (Song Title) *
            </label>
            <input
              type="text"
              value={releaseInfo.title || ''}
              onChange={(e) => setReleaseInfo({ ...releaseInfo, title: e.target.value })}
              placeholder="예: Midnight Echo (Feat. 표기는 아래 피처링 칸에 분리)"
              className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              메인 아티스트명 (Primary Artist) *
            </label>
            <input
              type="text"
              value={releaseInfo.artist || ''}
              onChange={(e) => setReleaseInfo({ ...releaseInfo, artist: e.target.value })}
              placeholder="예: Lucid"
              className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              앨범명 (Album Title)
            </label>
            <input
              type="text"
              value={releaseInfo.album || ''}
              onChange={(e) => setReleaseInfo({ ...releaseInfo, album: e.target.value })}
              placeholder="싱글이면 트랙 제목과 동일하게 입력"
              className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              주 장르 (Primary Genre)
            </label>
            <input
              type="text"
              value={releaseInfo.genre_primary || ''}
              onChange={(e) => setReleaseInfo({ ...releaseInfo, genre_primary: e.target.value })}
              placeholder="예: Indie Pop, R&B/Soul, Hip-Hop"
              className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>발매 희망일 (Release Date)</span>
                <span className="text-zinc-400 font-normal text-xs">(YYYY-MM-DD)</span>
              </label>
              {releaseInfo.release_date && (
                <button
                  type="button"
                  onClick={() => setReleaseInfo({ ...releaseInfo, release_date: '' })}
                  className="text-[11px] text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={releaseInfo.release_date || ''}
                placeholder="2026-11-15 (YYYY-MM-DD)"
                maxLength={10}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^\d-]/g, '');
                  const digits = val.replace(/-/g, '');
                  if (digits.length <= 4) {
                    val = digits;
                  } else if (digits.length <= 6) {
                    val = `${digits.slice(0, 4)}-${digits.slice(4)}`;
                  } else {
                    val = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
                  }
                  setReleaseInfo({ ...releaseInfo, release_date: val });
                }}
                className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 pl-3.5 pr-10 py-2.5 text-zinc-900 dark:text-white font-mono text-sm tracking-wide placeholder:font-sans placeholder:text-zinc-400 placeholder:tracking-normal focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => {
                  try {
                    datePickerRef.current?.showPicker?.();
                  } catch {
                    datePickerRef.current?.focus();
                  }
                }}
                title="달력에서 날짜 선택하기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Calendar className="w-4 h-4" />
              </button>
              <input
                ref={datePickerRef}
                type="date"
                tabIndex={-1}
                value={releaseInfo.release_date || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setReleaseInfo({ ...releaseInfo, release_date: e.target.value });
                  }
                }}
                className="sr-only pointer-events-none absolute opacity-0"
              />
            </div>

            {/* 빠른 추천 프리셋 칩 (유통사 권장 리드타임 원클릭 지정) */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-zinc-400 mr-0.5">빠른 선택:</span>
              {[
                { label: '+2주 (14일 후)', days: 14 },
                { label: '+3주 (21일 후, 추천)', days: 21, isRecommended: true },
                { label: '+4주 (28일 후)', days: 28 },
              ].map((preset) => {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + preset.days);
                const yyyy = targetDate.getFullYear();
                const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
                const dd = String(targetDate.getDate()).padStart(2, '0');
                const formatted = `${yyyy}-${mm}-${dd}`;
                const isSelected = releaseInfo.release_date === formatted;

                return (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setReleaseInfo({ ...releaseInfo, release_date: formatted })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : preset.isRecommended
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400'
                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                가사 언어
              </label>
              <select
                value={releaseInfo.language || 'ko'}
                onChange={(e) => setReleaseInfo({ ...releaseInfo, language: e.target.value })}
                className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-zinc-900 dark:text-white"
              >
                <option value="ko">한국어 (Korean)</option>
                <option value="en">영어 (English)</option>
                <option value="ja">일본어 (Japanese)</option>
                <option value="instrumental">가사 없음 (Instrumental)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                19금(Explicit) 표기
              </label>
              <select
                value={releaseInfo.explicit ? 'yes' : 'no'}
                onChange={(e) =>
                  setReleaseInfo({ ...releaseInfo, explicit: e.target.value === 'yes' })
                }
                className="w-full rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-zinc-900 dark:text-white"
              >
                <option value="no">해당 없음 (Clean)</option>
                <option value="yes">19금 욕설 포함 (Explicit)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 발매 희망일 리드타임 & 음원 등록 마감일 자동 계산 안내 (미영님 피드백 반영) */}
        {dateFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium space-y-1.5 ${
              dateFeedback.tone === 'rose'
                ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                : dateFeedback.tone === 'amber'
                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                : dateFeedback.tone === 'sky'
                ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300'
                : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{dateFeedback.text}</span>
            </div>
            {dateFeedback.deadlineText && (
              <div className="pl-6 font-bold text-xs">
                {dateFeedback.deadlineText}
              </div>
            )}
          </div>
        )}

        {/* 선택 입력: 크레딧·저작권자·ISRC·가사 펼치기 */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvancedInfo((prev) => !prev)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <span>크레딧(실명) · 피처링 · 저작권자 · ISRC · 가사 더 입력하기 (선택)</span>
            {showAdvancedInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvancedInfo && (
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-white/10 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    피처링 아티스트 (쉼표 구분)
                  </label>
                  <input
                    type="text"
                    value={featuringInput}
                    onChange={(e) => setFeaturingInput(e.target.value)}
                    placeholder="예: 보라, 김민수"
                    className="w-full rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3 py-2 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    ℗ 원반권자 (Recording Holder)
                  </label>
                  <input
                    type="text"
                    value={releaseInfo.recording_holder || ''}
                    onChange={(e) =>
                      setReleaseInfo({ ...releaseInfo, recording_holder: e.target.value })
                    }
                    placeholder="예: 홍길동 또는 레이블명"
                    className="w-full rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3 py-2 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    기존 ISRC 코드 (재발매 시)
                  </label>
                  <input
                    type="text"
                    value={releaseInfo.isrc || ''}
                    onChange={(e) => setReleaseInfo({ ...releaseInfo, isrc: e.target.value })}
                    placeholder="첫 발매면 비워 두세요"
                    className="w-full rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-3 py-2 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* 크레딧 리스트 (DistroKid/뮤즈플랫폼 작곡·작사 실명 필수 대비) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    참여진 크레딧 (작곡·작사는 실명 권장)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setReleaseInfo((prev) => ({
                        ...prev,
                        credits: [
                          ...(prev.credits || []),
                          { role: '편곡', legal_name: '', stage_name: '' },
                        ],
                      }))
                    }
                    className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>크레딧 추가</span>
                  </button>
                </div>

                {(releaseInfo.credits || []).map((c, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={c.role || '작곡'}
                      onChange={(e) => {
                        const next = [...(releaseInfo.credits || [])];
                        next[idx] = { ...next[idx], role: e.target.value };
                        setReleaseInfo({ ...releaseInfo, credits: next });
                      }}
                      className="col-span-3 rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-2.5 py-2 text-zinc-900 dark:text-white"
                    >
                      <option value="작곡">작곡</option>
                      <option value="작사">작사</option>
                      <option value="편곡">편곡</option>
                      <option value="프로듀서">프로듀서</option>
                      <option value="보컬">보컬</option>
                      <option value="믹싱">믹싱</option>
                      <option value="마스터링">마스터링</option>
                    </select>
                    <input
                      type="text"
                      value={c.legal_name || ''}
                      onChange={(e) => {
                        const next = [...(releaseInfo.credits || [])];
                        next[idx] = { ...next[idx], legal_name: e.target.value };
                        setReleaseInfo({ ...releaseInfo, credits: next });
                      }}
                      placeholder="실명 (예: 홍길동)"
                      className="col-span-4 rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-2.5 py-2 text-zinc-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={c.stage_name || ''}
                      onChange={(e) => {
                        const next = [...(releaseInfo.credits || [])];
                        next[idx] = { ...next[idx], stage_name: e.target.value };
                        setReleaseInfo({ ...releaseInfo, credits: next });
                      }}
                      placeholder="활동명 (선택)"
                      className="col-span-4 rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 px-2.5 py-2 text-zinc-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (releaseInfo.credits || []).filter((_, i) => i !== idx);
                        setReleaseInfo({ ...releaseInfo, credits: next });
                      }}
                      className="col-span-1 text-zinc-400 hover:text-rose-500 flex justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  가사 전문 (Chorus 2x 등 생략 기호 없이 들리는 그대로 입력)
                </label>
                <textarea
                  rows={4}
                  value={releaseInfo.lyrics || ''}
                  onChange={(e) => setReleaseInfo({ ...releaseInfo, lyrics: e.target.value })}
                  placeholder="연주곡이면 비워 두세요."
                  className="w-full rounded-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-white/10 p-3 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200/80 dark:border-white/10">
        <button
          type="button"
          onClick={onPrevStep}
          className="btn-secondary text-sm px-6 py-3 flex items-center gap-2 shadow-sm font-bold w-full sm:w-auto justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
          <span>이전 (비주얼 & 홍보 에셋)</span>
        </button>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {!isDemo && !allRightsAnswered && (
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              ⚠️ 권리 자가진단 {totalQuestions - answeredCount}개 문항에 더 답해야 다음으로 넘어갈 수 있어요
            </span>
          )}
          <button
            type="button"
            onClick={handleProceed}
            disabled={!isDemo && !allRightsAnswered}
            className="btn-primary text-base font-extrabold px-9 py-3.5 flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <ShieldCheck className="w-5 h-5 text-indigo-200" />
            <span>준비완료 & 최종 패키지 받으러 가기 (Step 4)</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}
