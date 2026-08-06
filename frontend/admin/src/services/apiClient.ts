import { RuntimeApiClient } from '../../../shared/apiClient';
import { RuntimeConfig } from '../../../shared/runtimeConfig';

export type AdminConfig = RuntimeConfig;

export const adminApiClient = new RuntimeApiClient({
  defaultTokenKey: 'cb_admin_token',
  missingBaseUrlMessage: 'Admin API Base URL is not configured. Unable to resolve API Endpoint.',
});
