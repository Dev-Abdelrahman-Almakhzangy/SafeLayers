import axios from 'axios';

const configuredBaseUrl = import.meta.env.VITE_API_URL;
const baseURL = configuredBaseUrl;

const safeMethods = new Set(['get', 'head', 'options']);

const csrfClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10000,
});

const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10000,
});

let csrfToken = null;
let csrfRequest = null;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });

  failedQueue = [];
};

export const resetCsrfToken = () => {
  csrfToken = null;
};

export const fetchCsrfToken = async (force = false) => {
  if (csrfToken && !force) {
    return csrfToken;
  }

  if (csrfRequest && !force) {
    return csrfRequest;
  }

  csrfRequest = csrfClient
    .get('/auth/csrf-token')
    .then(({ data }) => {
      csrfToken = data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
};

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase();

  if (!safeMethods.has(method)) {
    const token = await fetchCsrfToken();
    config.headers = config.headers || {};
    config.headers['X-CSRF-Token'] = token;

    // Keep CSRF token in body too in case a proxy strips custom headers.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (!config.data.has('_csrf')) {
        config.data.append('_csrf', token);
      }
    } else if (config.data && typeof config.data === 'object' && !Array.isArray(config.data)) {
      config.data = { ...config.data, _csrf: token };
    } else if (!config.data) {
      config.data = { _csrf: token };
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const errorCode = error.response?.data?.code;
    const errorMessage = error.response?.data?.error;

    if (
      status === 403 &&
      errorMessage === 'Invalid or missing CSRF token' &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      await fetchCsrfToken(true);
      return api(originalRequest);
    }

    if (
      status === 401 &&
      errorCode === 'TOKEN_EXPIRED' &&
      !originalRequest._retry &&
      !String(originalRequest.url || '').includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        processQueue();
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        resetCsrfToken();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
