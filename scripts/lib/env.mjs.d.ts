export const deployEnvSchema: unknown;
export const destroyEnvSchema: unknown;
export const uiDeployEnvSchema: unknown;
export const fetchCertsEnvSchema: unknown;
export const integrationTestEnvSchema: unknown;
export const seedAdminEnvSchema: unknown;
export const stripeLiveTestEnvSchema: unknown;

export function validateEnv<TSchema = unknown, TSource = unknown>(schema: TSchema, source: TSource): any;
