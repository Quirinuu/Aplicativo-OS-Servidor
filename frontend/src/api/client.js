// frontend/src/api/client.js  ← APP SERVIDOR
// Detecta automaticamente o host pelo qual o browser acessou o app.
// Funciona tanto em localhost quanto quando acessado por IP na rede (ex: 192.168.0.100:5000)

function getBaseURL() {
  // Dev com Vite (variável de ambiente explícita)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  // Produção: usa o mesmo host/porta que o browser usou para abrir o app
  // Se acessado como http://192.168.0.100:5000 → API em http://192.168.0.100:5000
  // Se acessado como http://localhost:5000     → API em http://localhost:5000
  const { protocol, hostname, port } = window.location;
  const p = port || (protocol === 'https:' ? '443' : '80');
  return `${protocol}//${hostname}:${p}`;
}

async function fetchAPI(endpoint, options = {}) {
  const BASE = getBaseURL();
  const token = localStorage.getItem('token');

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  if (token) config.headers.Authorization = `Bearer ${token}`;

  const url = `${BASE}/api${endpoint}`;
  console.log(`📡 ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || `Erro ${response.status}`);
  }

  return response.json();
}

export const auth = {
  login: async (username, password) => {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.token) localStorage.setItem('token', data.token);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },
  me: async () => {
    const data = await fetchAPI('/auth/me');
    return data.user;
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

export const users = {
  list: async () => (await fetchAPI('/users')).users,
  getById: async (id) => (await fetchAPI(`/users/${id}`)).user,
  create: async (data) => (await fetchAPI('/users', { method: 'POST', body: JSON.stringify(data) })).user,
  update: async (id, data) => (await fetchAPI(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })).user,
  delete: async (id) => fetchAPI(`/users/${id}`, { method: 'DELETE' }),
};

export const serviceOrders = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.clientName) params.append('clientName', filters.clientName);
    if (filters.equipmentName) params.append('equipmentName', filters.equipmentName);
    const qs = params.toString();
    return (await fetchAPI(qs ? `/os?${qs}` : '/os')).orders;
  },
  getById: async (id) => (await fetchAPI(`/os/${id}`)).order,
  create: async (data) => (await fetchAPI('/os', { method: 'POST', body: JSON.stringify(data) })).order,
  update: async (id, data) => (await fetchAPI(`/os/${id}`, { method: 'PUT', body: JSON.stringify(data) })).order,
  delete: async (id) => fetchAPI(`/os/${id}`, { method: 'DELETE' }),
  addComment: async (osId, data) => (await fetchAPI(`/os/${osId}/comments`, { method: 'POST', body: JSON.stringify(data) })).comment,
  history: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.clientName) params.append('clientName', filters.clientName);
    if (filters.equipmentName) params.append('equipmentName', filters.equipmentName);
    const qs = params.toString();
    return (await fetchAPI(qs ? `/os/history?${qs}` : '/os/history')).orders;
  },
};

export default { auth, users, serviceOrders };