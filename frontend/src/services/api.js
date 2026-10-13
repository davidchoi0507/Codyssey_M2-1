/**
 * Backend API Service Module
 * Target: https://api.201.n-e.kr
 */

export const API_BASE = 'https://api.201.n-e.kr';

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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `서버 오류 (${response.status})`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errJson.message || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  // Handle json or text/blob
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return response;
}

export const api = {
  // 1. Jobs & Upload
  createJob: async (formData) => {
    // formData: file, consent_version, artist, title, lyrics, genre_hint
    return await request('/jobs', {
      method: 'POST',
      body: formData,
    });
  },

  getJobStatus: async (jobId) => {
    return await request(`/jobs/${jobId}`);
  },

  // 2. A&R Note
  getNote: async (jobId) => {
    return await request(`/note/${jobId}`);
  },

  updateNote: async (jobId, noteData) => {
    return await request(`/note/${jobId}`, {
      method: 'PUT',
      body: JSON.stringify(noteData),
    });
  },

  acceptNote: async (jobId) => {
    return await request(`/note/${jobId}/accept`, {
      method: 'POST',
    });
  },

  // 3. Release Info & Rights
  getReleaseInfo: async (jobId) => {
    return await request(`/release/${jobId}`);
  },

  saveReleaseInfo: async (jobId, infoData) => {
    return await request(`/release/${jobId}/info`, {
      method: 'PUT',
      body: JSON.stringify(infoData),
    });
  },

  saveRights: async (jobId, rightsData) => {
    return await request(`/release/${jobId}/rights`, {
      method: 'PUT',
      body: JSON.stringify(rightsData),
    });
  },

  // 4. Preflight / Distributors
  getDistributorInspection: async (jobId, distributor = 'distrokid') => {
    // distributor: 'distrokid' | 'muse'
    return await request(`/jobs/${jobId}/distributors/${distributor}`);
  },

  getExportCsvUrl: (jobId, distributor = 'distrokid') => {
    return `${API_BASE}/release/${jobId}/export/${distributor}.csv`;
  },

  getPackageZipUrl: (jobId) => {
    return `${API_BASE}/package/${jobId}.zip`;
  },

  // 5. Community
  getCommunityTracks: async (sort = 'new', limit = 20) => {
    return await request(`/community/tracks?sort=${sort}&limit=${limit}`);
  },

  getCommunityTrackDetail: async (trackId) => {
    return await request(`/community/tracks/${trackId}`);
  },

  publishToCommunity: async (publishData) => {
    return await request('/community/tracks', {
      method: 'POST',
      body: JSON.stringify(publishData),
    });
  },

  rateTrack: async (trackId, rating, comment = '') => {
    return await request(`/community/tracks/${trackId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
  },

  reportTrack: async (trackId, reason = '무단 업로드') => {
    return await request(`/community/tracks/${trackId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // 6. Auth & User Profile
  getMe: async () => {
    return await request('/me');
  },

  getLoginUrl: (provider = 'kakao', redirectUri) => {
    const nextParam = encodeURIComponent(redirectUri || window.location.origin);
    return `${API_BASE}/auth/${provider}?next=${nextParam}`;
  },
};

