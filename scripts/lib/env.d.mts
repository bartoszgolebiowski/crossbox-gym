import { z } from 'zod';

export function validateEnv<TSchema extends z.ZodTypeAny>(schema: TSchema, source: unknown): z.infer<TSchema>;

export const deployEnvSchema: z.ZodObject<
  {
    STACKS: z.ZodDefault<z.ZodString>;
    STACK_NAME: z.ZodString;
    AWS_REGION: z.ZodString;
  },
  'strip'
>;
export const destroyEnvSchema: z.ZodObject<
  {
    STACKS: z.ZodDefault<z.ZodString>;
    STACK_NAME: z.ZodString;
  },
  'strip'
>;
export const uiDeployEnvSchema: z.ZodObject<
  {
    STACK_NAME: z.ZodString;
    AWS_REGION: z.ZodString;
  },
  'strip'
>;
export const fetchCertsEnvSchema: z.ZodObject<
  {
    AWS_REGION: z.ZodString;
    SECRET_NAME_IOT: z.ZodOptional<z.ZodString>;
  },
  'strip'
>;
export const integrationTestEnvSchema: z.ZodObject<
  {
    STACK_NAME: z.ZodString;
    AWS_REGION: z.ZodString;
  },
  'strip'
>;
export const seedAdminEnvSchema: z.ZodObject<
  {
    USER_POOL_ID: z.ZodString;
    MAIN_TABLE_NAME: z.ZodString;
    ADMIN_EMAIL: z.ZodDefault<z.ZodString>;
    ADMIN_PASSWORD: z.ZodDefault<z.ZodString>;
  },
  'strip'
>;
export const stripeLiveTestEnvSchema: z.ZodObject<
  {
    STRIPE_SECRET_KEY: z.ZodString;
    RUN_STRIPE_LIVE_TESTS: z.ZodEffects<
      z.ZodOptional<z.ZodUnion<[z.ZodEnum<['true', 'false']>, z.ZodBoolean]>>,
      boolean
    >;
  },
  'strip'
>;
