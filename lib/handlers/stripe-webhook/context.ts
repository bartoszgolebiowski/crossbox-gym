import {
  getMainTableName,
  getFrontendUrl,
  getUserPoolId,
  getIdentityProvider,
} from '../shared/config';
import { IdentityProvider, createIdentityProvider } from '../shared/providers';

/**
 * Shared context for all webhook event handlers.
 * Constructed once per invocation and passed to each handler,
 * avoiding repeated env reads and provider instantiation.
 */
export interface WebhookContext {
  mainTableName: string;
  userPoolId: string;
  frontendUrl: string;
  identityProvider: IdentityProvider;
}

export function createWebhookContext(): WebhookContext {
  return {
    mainTableName: getMainTableName(),
    userPoolId: getUserPoolId(),
    frontendUrl: getFrontendUrl(),
    identityProvider: createIdentityProvider(getIdentityProvider()),
  };
}
