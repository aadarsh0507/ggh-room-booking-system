import axios from 'axios';

// Use relative path so API calls always go to the same origin that served the page.
// This works whether running locally (CRA proxy on :3000 → :5000) or in Docker
// (Express serves both frontend and /api on the same port).
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Clears all auth-related storage and forces a full page reload to /login.
// Using location.replace so the logged-in page is removed from history (no Back-button restore).
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.clear();
  window.location.replace('/login');
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logout();
    }
    return Promise.reject(error);
  }
);

export default api;