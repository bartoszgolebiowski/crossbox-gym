import { validateLambdaEnv } from '../shared/config';
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
  const env = validateLambdaEnv(process.env);
  const mainTableName = env.MAIN_TABLE_NAME;
  return {
    mainTableName,
    userPoolId: env.USER_POOL_ID,
    frontendUrl: env.FRONTEND_URL,
    identityProvider: createIdentityProvider(env.IDENTITY_PROVIDER),
    billingRepository: new DynamoDbBillingRepository(ddb, mainTableName),
  };
}
