import { getFrontendUrl, getIdentityProvider, getMainTableName, getUserPoolId } from '../shared/config';
import { ddb } from '../shared/database';
import { IdentityProvider, createIdentityProvider } from '../shared/providers';
import { BillingRepository, DynamoDbBillingRepository } from './repository';

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
  billingRepository: BillingRepository;
}

export function createWebhookContext(): WebhookContext {
  const mainTableName = getMainTableName();
  return {
    mainTableName,
    userPoolId: getUserPoolId(),
    frontendUrl: getFrontendUrl(),
    identityProvider: createIdentityProvider(getIdentityProvider()),
    billingRepository: new DynamoDbBillingRepository(ddb, mainTableName),
  };
}
