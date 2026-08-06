import { loadRuntimeConfig, RuntimeConfig } from './runtimeConfig';

const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env;

export interface ApiClientRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  tokenKey?: string;
}

interface ApiClientOptions {
  defaultTokenKey: string;
  missingBaseUrlMessage: string;
}

export class RuntimeApiClient {
  private baseUrl = '';
  private configPromise: Promise<RuntimeConfig> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

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

  public async fetchConfig(): Promise<RuntimeConfig> {
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

  public async request<T = unknown>(path: string, options: ApiClientRequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, tokenKey } = options;

    if (!this.baseUrl) {
      await this.fetchConfig();
    }

    if (!this.baseUrl) {
      throw new Error(this.options.missingBaseUrlMessage);
    }

    const token = localStorage.getItem(tokenKey || this.options.defaultTokenKey);
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
      const errorMessage =
        (data as { message?: string; error?: string })?.message ||
        (data as { message?: string; error?: string })?.error ||
        `HTTP ${res.status} ${res.statusText}`;
      throw new Error(errorMessage);
    }

    return data as T;
  }

  public get<T = unknown>(path: string, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'GET', tokenKey });
  }

  public post<T = unknown>(path: string, body?: unknown, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, tokenKey });
  }

  public put<T = unknown>(path: string, body?: unknown, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, tokenKey });
  }

  public delete<T = unknown>(path: string, tokenKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', tokenKey });
  }
}
