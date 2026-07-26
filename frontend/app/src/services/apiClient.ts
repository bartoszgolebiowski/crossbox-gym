import { loadRuntimeConfig, RuntimeConfig } from '../../../shared/runtimeConfig';

export type AppConfig = RuntimeConfig;

const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env;

class ApiClient {
  private baseUrl: string = '';
  private configPromise: Promise<AppConfig> | null = null;

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public resetConfig(): void {
    this.baseUrl = '';
    this.configPromise = null;
  }

  public async fetchConfig(): Promise<AppConfig> {
    if (this.configPromise) {
      return this.configPromise;
    }

    this.configPromise = loadRuntimeConfig({
      fallbackApiUrl: viteEnv?.VITE_API_URL,
    }).then((config) => {
      this.setBaseUrl(config.ApiUrl);
      return config;
    });

    return this.configPromise;
  }

  public async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      tokenKey?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, tokenKey = 'cb_member_token' } = options;

    if (!this.baseUrl) {
      await this.fetchConfig();
    }

    if (!this.baseUrl) {
      throw new Error('API Base URL is not configured. Unable to resolve API Endpoint.');
    }

    const token = localStorage.getItem(tokenKey);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(errorMessage);
    }

    return data as T;
  }

  public get<T = any>(path: string, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'GET', tokenKey });
  }

  public post<T = any>(path: string, body?: any, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, tokenKey });
  }

  public put<T = any>(path: string, body?: any, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, tokenKey });
  }

  public delete<T = any>(path: string, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', tokenKey });
  }
}

export const apiClient = new ApiClient();
