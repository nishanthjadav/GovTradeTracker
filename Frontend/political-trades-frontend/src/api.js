import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const API = `${API_BASE}/api`;

// All app fetches must include credentials so the JSESSIONID cookie rides along.
export const apiFetch = (path, options = {}) =>
  fetch(path.startsWith('http') ? path : `${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

const api = axios.create({ baseURL: API, withCredentials: true });

export const fetchAllTrades       = ()     => api.get('/trades');
export const fetchByPolitician    = (name) => api.get(`/trades/politician/${name}`);
export const fetchUnexecuted      = ()     => api.get('/trades/unexecuted');
export const triggerIngest        = ()     => api.post('/trades/ingest');
