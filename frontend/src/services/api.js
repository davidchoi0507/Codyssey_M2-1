/**
 * Backend API Service Module
 * Target: https://api.201.n-e.kr (주소·응답 형식은 https://api.201.n-e.kr/docs 기준)
 *
 * 다른 주소로 띄울 때는 .env.local 에 VITE_API_BASE=... 를 넣는다.
 * 이 화면의 주소(예: http://localhost:3000)가 서버 CORS_ORIGINS 에 있어야 요청이 통한다.
 */

export const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE || 'https://api.201.n-e.kr').replace(/\/$/, '');

// 업로드 화면 동의 문구 버전 — 동의서 v1.6 (10/16 확정)
export const CONSENT_VERSION = 'v1.6';

// 서비스 종료 예정일 (종료일에 작업·공개 곡 일괄 삭제)
export const SERVICE_END_DATE = '2026-10-31';

// 화면의 유통사 이름 → 서버 유통사 id
export const DISTRIBUTOR_IDS = { distrokid: 'distrokid', muse: 'muzeplatform', muzeplatform: 'muzeplatform' };

// Helper to convert relative paths to absolute backend URLs
export function toFileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
}

// Token management
export const tokenStorage = {
  get: () => localStorage.getItem('studio_auth_token') || '',
  set: (token) => localStorage.setItem('studio_auth_token', token),
  clear: () => localStorage.removeItem('studio_auth_token'),
};

// 비로그인 사용자를 위한 이 브라우저의 작업 기록 (localStorage) — D1·D9·B6 연동
const LOCAL_JOBS_KEY = 'balmaero_recent_jobs';

export const localJobsStorage = {
  list: () => {
    try {
      const raw = localStorage.getItem(LOCAL_JOBS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((j) => j && j.job_id && !String(j.job_id).startsWith('demo')) : [];
    } catch {
      return [];
    }
  },
  ids: () => localJobsStorage.list().map((j) => j.job_id),
  upsert: (job) => {
    if (!job || !job.job_id || String(job.job_id).startsWith('demo')) return;
    try {
      const cur = localJobsStorage.list();
      const idx = cur.findIndex((x) => x.job_id === job.job_id);
      const now = new Date().toISOString();
      const merged = idx >= 0
        ? { ...cur[idx], ...job, updated_at: job.updated_at || now }
        : {
            job_id: job.job_id,
            title: job.title || '제목 없음',
            artist: job.artist || '',
            stage: job.stage || 'uploaded',
            stage_label: job.stage_label || '업로드됨',
            created_at: job.created_at || now,
            updated_at: job.updated_at || now,
          };
      const next = [merged, ...cur.filter((x) => x.job_id !== job.job_id)].slice(0, 50);
      localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(next));
      return next;
    } catch {
      return [];
    }
  },
  remove: (jobId) => {
    try {
      const next = localJobsStorage.list().filter((x) => x.job_id !== jobId);
      localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(next));
      return next;
    } catch {
      return [];
    }
  },
};

/** 작업 stage 에 따라 열어야 할 단계(1~4) 계산 (D1) */
export function stepForStage(stage) {
  if (!stage) return 1;
  if (['uploaded', 'analyzing', 'note_ready'].includes(stage)) return 1;
  if (['generating', 'awaiting_cover'].includes(stage)) return 2;
  if (stage === 'rendering') return 2;
  if (stage === 'done') return 4;
  return 1;
}

/** 서버 오류: message(화면에 보여 줄 한국어), code(예: KNOWN_SONG_MATCH), status, retryable */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.detail || `서버 오류 (${status})`);
    this.status = status;
    this.code = body?.code;
    this.retryable = Boolean(body?.retryable);
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Generic fetch wrapper with Bearer token & credentials
async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = { ...options.headers };

  const token = tokenStorage.get();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If not FormData, default to application/json
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, { message: '서버에 연결하지 못했어요. 인터넷 연결이나 서버 주소(CORS)를 확인해 주세요.' });
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });

/** 반응·바로 공개는 1회용 토큰이 필요하고, 받은 뒤 min_sec(3초) 안에 보내면 거절된다 (매크로 방지). */
async function freshFormToken() {
  const t = await request('/community/form-token');
  return { token: t.token, readyAt: Date.now() + t.min_sec * 1000 + 200 };
}
async function waitUntil(readyAt) {
  const left = readyAt - Date.now();
  if (left > 0) await sleep(left);
}

export const api = {
  // 1. Jobs & Upload
  createJob: async (formData) => {
    // formData: file, title, artist, genre, description, lyrics,
    //           consent_privacy, consent_external_ai, consent_original (필수 true), consent_showcase, consent_version, confirm_original
    return await request('/jobs', { method: 'POST', body: formData });
  },

  getJobStatus: async (jobId) => request(`/jobs/${jobId}`),

  patchJobInfo: async (jobId, infoPatch) => request(`/jobs/${jobId}/info`, json('PATCH', infoPatch)),

  retryJob: async (jobId) => request(`/jobs/${jobId}/retry`, { method: 'POST' }),

  deleteJob: async (jobId, bandCode = null) =>
    request(`/jobs/${jobId}`, {
      method: 'DELETE',
      headers: bandCode ? { 'x-band-code': bandCode } : {},
    }),

  // 2. A&R Note
  getNote: async (jobId) => request(`/jobs/${jobId}/note`),

  // { correction: '한 줄 수정' } 또는 직접 편집 필드 (mood_keywords, colors, cover_directions, highlight_start)
  updateNote: async (jobId, patch) => request(`/jobs/${jobId}/note`, json('PATCH', patch)),

  relistenNote: async (jobId) => request(`/jobs/${jobId}/note/relisten`, { method: 'POST' }),

  acceptNote: async (jobId, version = null) =>
    request(`/jobs/${jobId}/note/accept`, json('POST', version ? { version } : {})),

  // 3. Package (커버·영상·채널 글·피칭·에디토리얼·ZIP 링크)
  getPackage: async (jobId) => request(`/jobs/${jobId}/package`),

  // itemId: cover-1 ~ cover-3 (또는 cover-own). 고르면 숏폼·Canvas 렌더링이 시작된다
  selectCover: async (jobId, itemId, v = null) =>
    request(`/jobs/${jobId}/cover/select`, json('POST', { item_id: itemId, v })),

  regenerateItem: async (jobId, itemId, req = null) =>
    request(`/jobs/${jobId}/items/${itemId}/regenerate`, json('POST', { request: req || null })),

  uploadOwnCover: async (jobId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return await request(`/jobs/${jobId}/own-image`, { method: 'POST', body: fd });
  },

  // 4. Release Info, Rights & Guide
  getReleaseGuide: async () => request('/release/guide'),

  recommendDistributor: async (body) => request('/release/guide/recommend', json('POST', body)),

  getDistributors: async () => request('/release/distributors'),

  getReleaseInfo: async (jobId) => request(`/jobs/${jobId}/release-info`),

  // 전체 ReleaseInfo 를 한 번에 보낸다 (GET 으로 받은 info 에 고친 값을 덮어써서)
  saveReleaseInfo: async (jobId, info) => request(`/jobs/${jobId}/release-info`, json('PUT', info)),

  getRightsQuestions: async () => request('/release/rights-questions'),

  getRights: async (jobId) => request(`/jobs/${jobId}/rights`),

  // { 질문 id: 값 } — 일부만 보내도 된다
  saveRights: async (jobId, answers) => request(`/jobs/${jobId}/rights`, json('PUT', answers)),

  // 5. Preflight / Distributors — 응답의 sheet_url 이 CSV 링크
  getDistributorInspection: async (jobId, distributor = 'distrokid') =>
    request(`/jobs/${jobId}/distributors/${DISTRIBUTOR_IDS[distributor] || distributor}`),

  // 6. Community
  getCommunityMeta: async () => request('/community/meta'),

  getCommunityTracks: async (sortOrParams = 'new', limitArg = 20) => {
    let sort = 'new';
    let limit = 20;
    let offset = 0;
    let genre = '';
    let q = '';
    if (typeof sortOrParams === 'object' && sortOrParams !== null) {
      sort = sortOrParams.sort || 'new';
      limit = sortOrParams.limit ?? 20;
      offset = sortOrParams.offset ?? 0;
      genre = sortOrParams.genre || '';
      q = sortOrParams.q || '';
    } else {
      sort = sortOrParams || 'new';
      limit = limitArg ?? 20;
    }
    const qs = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
    if (genre.trim()) qs.set('genre', genre.trim());
    if (q.trim()) qs.set('q', q.trim());
    return request(`/community/tracks?${qs.toString()}`);
  },

  getCommunityTrackDetail: async (trackId) => request(`/community/tracks/${trackId}`),
  getTrackDetail: async (trackId) => request(`/community/tracks/${trackId}`),

  countPlay: async (trackId) => request(`/community/tracks/${trackId}/play`, { method: 'POST' }),

  // 작업에서 공개: { listen_mode: 'highlight'|'full', comments_public, intro, consent_rights, consent_public, ai_usage, confirm_original }
  publishFromJob: async (jobId, body) => request(`/jobs/${jobId}/community`, json('POST', body)),

  getJobTrack: async (jobId) => request(`/jobs/${jobId}/community`),

  // AI 없이 바로 공개 (multipart): file, title, artist, genre, intro, listen_mode, comments_public,
  //                                consent_rights, consent_public, ai_usage, confirm_original
  publishQuick: async (formData) => {
    const { token, readyAt } = await freshFormToken();
    formData.set('form_token', token);
    await waitUntil(readyAt);
    return await request('/community/tracks', { method: 'POST', body: formData });
  },

  // 반응: { rating(1~5), tags(meta.tags 중), comment, nickname } 중 하나 이상
  sendFeedback: async (trackId, { rating = null, tags = [], comment = null, nickname = null }) => {
    const { token, readyAt } = await freshFormToken();
    await waitUntil(readyAt);
    return await request(
      `/community/tracks/${trackId}/feedback`,
      json('POST', { rating, tags, comment, nickname, form_token: token })
    );
  },

  // reason: abuse | ad | stolen | other (meta.report_reasons)
  reportTrack: async (trackId, reason = 'stolen', detail = null) =>
    request(`/community/tracks/${trackId}/report`, json('POST', { reason, detail })),

  reportFeedback: async (trackId, feedbackId, reason = 'abuse', detail = null) =>
    request(`/community/tracks/${trackId}/feedback/${feedbackId}/report`, json('POST', { reason, detail })),

  // 7. 마지막 설문·사용 기록 (10/14 회의: 피드백은 서버가 자동으로 파악하고 마지막에 짧게 묻는다)
  // kind: 'job'(발매 준비 작업) | 'track'(바로 공개한 곡 — ownerKey 필요)
  getSurvey: async (kind, id, ownerKey = null) =>
    request(
      kind === 'job' ? `/jobs/${id}/survey` : `/community/tracks/${id}/survey`,
      { headers: ownerKey ? { 'X-Owner-Key': ownerKey } : {} }
    ),

  saveSurvey: async (kind, id, answers, ownerKey = null) =>
    request(
      kind === 'job' ? `/jobs/${id}/survey` : `/community/tracks/${id}/survey`,
      { ...json('PUT', { answers }), headers: ownerKey ? { 'X-Owner-Key': ownerKey } : {} }
    ),

  // 화면에서만 일어나는 일(복사·유통사 사이트 열기 등). 결과를 기다리지 않고, 실패해도 무시한다
  // event: copied_channel · copied_pitch · copied_editorial · copied_field · opened_distributor · opened_guide · survey_shown · survey_closed ...
  logUsage: (jobId, event, target = null) => {
    if (!jobId || String(jobId).startsWith('demo')) return;
    request(`/jobs/${jobId}/usage`, json('POST', { event, target })).catch(() => {});
  },

  // 8. Auth & User Profile
  getMe: async () => request('/auth/me'),

  getMyJobs: async () => request('/me/jobs'),

  deleteMyJobs: async () => request('/me/jobs', { method: 'DELETE' }),

  getMyTracks: async () => request('/me/tracks'),

  claimJobs: async (jobIds) => request('/me/claim', json('POST', { job_ids: jobIds })),

  logout: async () => request('/auth/logout', { method: 'POST' }),

  withdraw: async () => request('/auth/me', { method: 'DELETE' }),

  // 로그인 뒤 next 주소로 돌아오며 #session=토큰 이 붙는다 (App.jsx 에서 저장)
  getLoginUrl: (provider = 'kakao', redirectUri) => {
    let nextUrl = redirectUri || (window.location.origin + import.meta.env.BASE_URL);
    // 1. 기존 hash(#me 등) 제거 (백엔드가 #session=토큰 을 붙일 때 충돌 방지)
    nextUrl = nextUrl.split('#')[0];
    // 2. 백엔드 auth_origin_list에 등록된 오리진은 'http://localhost:3000' 과 'https://api.201.n-e.kr'
    // 127.0.0.1 등으로 접속했을 때 safe_next 가 /studio 임시 페이지로 튕기는 현상 원천 차단
    if (nextUrl.includes('127.0.0.1:3000')) {
      nextUrl = nextUrl.replace('127.0.0.1:3000', 'localhost:3000');
    }
    const nextParam = encodeURIComponent(nextUrl);
    const host = API_BASE || 'https://api.201.n-e.kr';
    return `${host}/auth/${provider}/login?next=${nextParam}`;
  },
};
