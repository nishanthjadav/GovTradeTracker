import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '');
export const API = `${API_BASE}/api`;

// credentials + X-Requested-With header — backend csrf filter requires both
export const apiFetch = (path, options = {}) =>
  fetch(path.startsWith('http') ? path : `${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }).then((r) => {
    // 401 = session expired. flag it and skip json parse (body will be html)
    if (!r.ok) {
      r.__notOk = true;
      r.__status = r.status;
    }
    return r;
  });

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

export const fetchAllTrades       = ()     => api.get('/trades');
export const fetchByPolitician    = (name) => api.get(`/trades/politician/${name}`);
export const fetchUnexecuted      = ()     => api.get('/trades/unexecuted');
export const triggerIngest        = ()     => api.post('/trades/ingest');

export const fetchAnomalies = (limit = 50, minScore = 0.8) =>
  apiFetch(`/trades/anomalies?limit=${limit}&minScore=${minScore}`)
    .then((r) => (r.__notOk ? [] : r.json()));

export const fetchPortfolioHistory = (range = "1D") =>
  apiFetch(`/portfolio/history?range=${range}`)
    .then((r) => (r.__notOk ? null : r.json()));
