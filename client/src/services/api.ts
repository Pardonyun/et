import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截器：自动附加 userId
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('user');
  if (stored) {
    try {
      const user = JSON.parse(stored);
      if (user.id) {
        config.headers['x-user-id'] = user.id;
      }
    } catch { /* ignore */ }
  }
  return config;
});

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      return Promise.reject(new Error('无法连接服务器，请确认后端已启动（端口 3000）'));
    }
    const msg = err.response.data?.error || err.message || '请求失败';
    return Promise.reject(new Error(msg));
  },
);

export default api;
