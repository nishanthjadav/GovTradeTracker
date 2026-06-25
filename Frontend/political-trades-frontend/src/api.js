import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '');
export const API = `${API_BASE}/api`;

// All app fetches must include credentials so the JSESSIONID cookie rides along.
// X-Requested-With is required by the backend's CsrfHeaderFilter on state-
// changing requests — a custom header forces a CORS preflight, which only our
// allowed frontend origin can pass, so cross-site CSRF attempts are blocked.
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
    // 401 on auth-required endpoint → session expired. Let callers handle by
    // attaching a flag, but don't try to parse the body as JSON (it'll be HTML).
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
