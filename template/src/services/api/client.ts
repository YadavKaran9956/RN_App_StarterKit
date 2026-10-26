import { AxiosError, AxiosHeaders, create, isAxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '@/store/authStore';

export const API_BASE_URL = 'https://api.yourdomain.com/v1';

export const client = create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

client.interceptors.request.use(
  (config) => {
    // This authenticated client must never forward credentials to another host.
    config.headers.delete('Authorization');
    let destination: URL;
    try {
      destination = new URL(client.getUri(config), API_BASE_URL);
    } catch {
      throw new AxiosError('Invalid API request URL.', AxiosError.ERR_INVALID_URL);
    }
    if (
      destination.origin !== new URL(API_BASE_URL).origin ||
      destination.username ||
      destination.password
    ) {
      throw new AxiosError('API requests must use the configured origin.', AxiosError.ERR_BAD_REQUEST);
    }

    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  undefined,
  { synchronous: true },
);

function logoutUnauthorizedRequest(config?: InternalAxiosRequestConfig) {
  const { token, logout } = useAuthStore.getState();
  // An old request must not log out a session established after it was sent.
  const authorization = AxiosHeaders.from(config?.headers).get('Authorization');
  if (!token || !config || authorization === `Bearer ${token}`) logout();
}

client.interceptors.response.use(
  (response) => {
    // A caller's validateStatus override must not bypass session invalidation.
    if (response.status === 401) {
      logoutUnauthorizedRequest(response.config);
      return Promise.reject(new AxiosError(
        'Unauthorized.',
        AxiosError.ERR_BAD_REQUEST,
        response.config,
        response.request,
        response,
      ));
    }
    return response;
  },
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      logoutUnauthorizedRequest(error.config);
    }
    return Promise.reject(error);
  },
);

export default client;
