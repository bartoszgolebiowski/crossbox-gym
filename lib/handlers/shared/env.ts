/**
 * Centralized environment variable access with strict validation.
 *
 * Every environment variable MUST be present or requireEnv() throws an Exception.
 * The ONLY exception is NODE_ENV, which defaults to 'development'.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: '${name}'.`);
  }
  return value;
}

// ─── Environment Variable Getters ─────────────────────────────────────────────

export function getMainTableName(): string {
  return requireEnv('MAIN_TABLE_NAME');
}

export function getUserPoolId(): string {
  return requireEnv('USER_POOL_ID');
}

export function getUserPoolClientId(): string {
  return requireEnv('USER_POOL_CLIENT_ID');
}

export function getAuditLogsTableName(): string {
  return requireEnv('AUDIT_LOGS_TABLE_NAME');
}

export function getStaticAssetsBucketName(): string {
  return requireEnv('STATIC_ASSETS_BUCKET_NAME');
}

export function getUnlockQueueUrl(): string {
  return requireEnv('UNLOCK_QUEUE_URL');
}

export function getEntryLogsTableName(): string {
  return requireEnv('ENTRY_LOGS_TABLE_NAME');
}

export function getStripeSecretKeySsmPath(): string {
  return requireEnv('STRIPE_SECRET_KEY_SSM_PATH');
}

export function getStripeWebhookSecretSsmPath(): string {
  return requireEnv('STRIPE_WEBHOOK_SECRET_SSM_PATH');
}

export function getFrontendUrl(): string {
  return requireEnv('FRONTEND_URL');
}

export function getPaymentProvider(): string {
  return requireEnv('PAYMENT_PROVIDER');
}

export function getLockProvider(): string {
  return requireEnv('LOCK_PROVIDER');
}

export function getIdentityProvider(): string {
  return process.env.IDENTITY_PROVIDER || 'cognito';
}

/** The only environment variable allowed to have a default value ('development'). */
export function getNodeEnv(): string {
  return process.env.NODE_ENV ?? 'development';
}
