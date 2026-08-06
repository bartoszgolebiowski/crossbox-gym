import { z } from 'zod';
import { ddb } from '../shared/db';
import { IdentityProvider } from '../shared/identity';
import { CognitoIdentityProvider, MockIdentityProvider } from '../shared/identity/cognito-identity-provider';
import { BillingRepository, DynamoDbBillingRepository } from './repository';

const identityProviders: Record<string, new () => IdentityProvider> = {
  cognito: CognitoIdentityProvider,
  mock: MockIdentityProvider,
};

const stripeWebhookEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  USER_POOL_ID: z.string().min(1, 'USER_POOL_ID is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
  IDENTITY_PROVIDER: z.string().min(1, 'IDENTITY_PROVIDER is required'),
});

function createIdentityProvider(type: string): IdentityProvider {
  const ProviderClass = identityProviders[type] || CognitoIdentityProvider;
  return new ProviderClass();
}

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
  const env = stripeWebhookEnvironmentSchema.parse(process.env);
  const mainTableName = env.MAIN_TABLE_NAME;
  return {
    mainTableName,
    userPoolId: env.USER_POOL_ID,
    frontendUrl: env.FRONTEND_URL,
    identityProvider: createIdentityProvider(env.IDENTITY_PROVIDER),
    billingRepository: new DynamoDbBillingRepository(ddb, mainTableName),
  };
}
