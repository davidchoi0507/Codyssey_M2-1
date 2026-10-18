/**
 * Backend API Service Module
 * Target: https://api.201.n-e.kr (주소·응답 형식은 https://api.201.n-e.kr/docs 기준)
 *
 * 다른 주소로 띄울 때는 .env.local 에 VITE_API_BASE=... 를 넣는다.
 * 이 화면의 주소(예: http://localhost:3000)가 서버 CORS_ORIGINS 에 있어야 요청이 통한다.
 */

export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://api.201.n-e.kr').replace(/\/$/, '');

// 업로드 화면 동의 문구 버전 — 서버 /studio 와 같은 문구를 쓴다 (동의서가 바뀌면 같이 바꾼다)
export const CONSENT_VERSION = 'v1.3';

// 화면의 유통사 이름 → 서버 유통사 id
export const DISTRIBUTOR_IDS = { distrokid: 'distrokid', muse: 'muzeplatform' };

// Helper to convert relative paths to absolute backend URLs
export function toFileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE}/${cleanPath}`;
}

// Token management
export const tokenStorage = {
  get: () => localStorage.getItem('studio_auth_token') || '',
  set: (token) => localStorage.setItem('studio_auth_token', token),
  clear: () => localStorage.removeItem('studio_auth_token'),
};

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

// Generic fetch wrapper with Bearer token
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
    response = await fetch(url, { ...options, headers });
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
    //           consent_privacy, consent_external_ai, consent_original (필수 true), consent_showcase, consent_version
    return await request('/jobs', { method: 'POST', body: formData });
  },

  // 체험 모드 (10/17): 예시 곡으로 바로 노트 단계. 이후 흐름은 실제 작업과 같고 커뮤니티 공개만 막힘(403 DEMO_NO_PUBLISH)
  createDemoJob: async () => request('/jobs/demo', { method: 'POST' }),

  getJobStatus: async (jobId) => request(`/jobs/${jobId}`),

  retryJob: async (jobId) => request(`/jobs/${jobId}/retry`, { method: 'POST' }),

  // 2. A&R Note
  getNote: async (jobId) => request(`/jobs/${jobId}/note`),

  // { correction: '한 줄 수정' } 또는 직접 편집 필드 (mood_keywords, colors ...)
  updateNote: async (jobId, patch) => request(`/jobs/${jobId}/note`, json('PATCH', patch)),

  acceptNote: async (jobId) => request(`/jobs/${jobId}/note/accept`, json('POST', {})),

  // 3. Package (커버·영상·채널 글·피칭·ZIP 링크)
  getPackage: async (jobId) => request(`/jobs/${jobId}/package`),

  // itemId: cover-1 ~ cover-3 (또는 cover-own). 고르면 숏폼·Canvas 렌더링이 시작된다
  selectCover: async (jobId, itemId, v = null) =>
    request(`/jobs/${jobId}/cover/select`, json('POST', { item_id: itemId, v })),

  regenerateItem: async (jobId, itemId, req = null) =>
    request(`/jobs/${jobId}/items/${itemId}/regenerate`, json('POST', { request: req })),

  // 4. Release Info & Rights
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

  getCommunityTracks: async (sort = 'new', limit = 20) => request(`/community/tracks?sort=${sort}&limit=${limit}`),

  getCommunityTrackDetail: async (trackId) => request(`/community/tracks/${trackId}`),

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
    return await request(`/community/tracks/${trackId}/feedback`,
      json('POST', { rating, tags, comment, nickname, form_token: token }));
  },

  // reason: abuse | ad | stolen | other (meta.report_reasons)
  reportTrack: async (trackId, reason = 'stolen', detail = null) =>
    request(`/community/tracks/${trackId}/report`, json('POST', { reason, detail })),

  // 7. 마지막 설문·사용 기록 (10/14 회의: 피드백은 서버가 자동으로 파악하고 마지막에 짧게 묻는다)
  // kind: 'job'(발매 준비 작업) | 'track'(바로 공개한 곡 — ownerKey 필요)
  getSurvey: async (kind, id, ownerKey = null) =>
    request(kind === 'job' ? `/jobs/${id}/survey` : `/community/tracks/${id}/survey`,
      { headers: ownerKey ? { 'X-Owner-Key': ownerKey } : {} }),

  saveSurvey: async (kind, id, answers, ownerKey = null) =>
    request(kind === 'job' ? `/jobs/${id}/survey` : `/community/tracks/${id}/survey`,
      { ...json('PUT', { answers }), headers: ownerKey ? { 'X-Owner-Key': ownerKey } : {} }),

  // 화면에서만 일어나는 일(복사·유통사 사이트 열기 등). 결과를 기다리지 않고, 실패해도 무시한다
  // event: copied_channel · copied_pitch · copied_field · opened_distributor · survey_shown · survey_closed ...
  logUsage: (jobId, event, target = null) => {
    if (!jobId || String(jobId).startsWith('demo')) return;
    request(`/jobs/${jobId}/usage`, json('POST', { event, target })).catch(() => {});
  },

  // 8. Auth & User Profile
  getMe: async () => request('/auth/me'),

  getMyJobs: async () => request('/me/jobs'),

  getMyTracks: async () => request('/me/tracks'),

  logout: async () => request('/auth/logout', { method: 'POST' }),

  // 로그인 뒤 next 주소로 돌아오며 #session=토큰 이 붙는다 (App.jsx 에서 저장)
  getLoginUrl: (provider = 'kakao', redirectUri) => {
    const nextParam = encodeURIComponent(redirectUri || window.location.origin + import.meta.env.BASE_URL);
    return `${API_BASE}/auth/${provider}/login?next=${nextParam}`;
  },
};
