import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8080/api' });

export const fetchAllTrades       = ()     => api.get('/trades');
export const fetchByPolitician    = (name) => api.get(`/trades/politician/${name}`);
export const fetchUnexecuted      = ()     => api.get('/trades/unexecuted');
export const triggerIngest        = ()     => api.post('/trades/ingest');