import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL;

let accessToken = null;

let onAuthChange = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setAuthChangeHandler = (fn) => {
  onAuthChange = fn;
};

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

const refreshClient = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post("/api/auth/refresh")
      .then((response) => {
        const token = response.data.accessToken;
        setAccessToken(token);
        onAuthChange({ token, user: response.data.user });
        return token;
      })
      .catch((error) => {
        setAccessToken(null);
        onAuthChange({ token: null, user: null, reason: error.response?.data?.error?.code });
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

export const refreshSession = refreshAccessToken;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;

    if (error.response?.status === 401 && code === "TOKEN_EXPIRED" && !original._retried) {
      original._retried = true;
      try {
        await refreshAccessToken();
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
