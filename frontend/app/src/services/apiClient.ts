import { RuntimeApiClient } from '../../../shared/apiClient';
import { RuntimeConfig } from '../../../shared/runtimeConfig';

export type AppConfig = RuntimeConfig;

export const apiClient = new RuntimeApiClient({
  defaultTokenKey: 'cb_member_token',
  missingBaseUrlMessage: 'API Base URL is not configured. Unable to resolve API Endpoint.',
});
