export interface RuntimeConfig {
  ApiUrl: string;
  UserPoolId?: string;
  UserPoolClientId?: string;
  MemberAppUrl?: string;
}

export interface RuntimeConfigResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchConfig = (input: string, init?: { cache?: string }) => Promise<RuntimeConfigResponse>;

export function normalizeApiUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Runtime configuration is missing ApiUrl. Redeploy the frontend configuration.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Runtime configuration has an invalid ApiUrl. Redeploy the frontend configuration.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Runtime configuration ApiUrl must use HTTP or HTTPS.');
  }

  return url.toString().replace(/\/+$/, '');
}

export async function loadRuntimeConfig({
  fetchConfig,
  fallbackApiUrl,
}: {
  fetchConfig?: FetchConfig;
  fallbackApiUrl?: string;
} = {}): Promise<RuntimeConfig> {
  const requestConfig = fetchConfig ?? ((input, init) => fetch(input, init as any));

  try {
    const response = await requestConfig('/config.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Runtime configuration request failed with HTTP ${response.status}.`);
    }

    let config: Omit<RuntimeConfig, 'ApiUrl'> & { ApiUrl?: unknown };
    if (typeof (response as any).text === 'function') {
      const text = await (response as any).text();
      if (typeof text === 'string' && text.trim().startsWith('<')) {
        throw new Error('/config.json returned HTML instead of JSON.');
      }
      config = JSON.parse(text);
    } else {
      config = (await response.json()) as any;
    }

    return { ...config, ApiUrl: normalizeApiUrl(config.ApiUrl) };
  } catch (error) {
    if (fallbackApiUrl) {
      return { ApiUrl: normalizeApiUrl(fallbackApiUrl) };
    }

    const rawMessage = error instanceof Error ? error.message : 'Unable to load runtime configuration.';
    const message =
      rawMessage.includes('SyntaxError') ||
      rawMessage.includes('Unexpected token') ||
      rawMessage.includes('returned HTML')
        ? 'Runtime configuration /config.json was missing or invalid.'
        : rawMessage;

    throw new Error(`${message} The application cannot contact its API until configuration is available.`);
  }
}
