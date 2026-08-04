import { z } from 'zod';

function formatZodIssue(issue) {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'config';
  return `${path}: ${issue.message}`;
}

function formatZodError(error) {
  const summary = error.issues.map(formatZodIssue).join('; ');
  return `Environment validation failed: ${summary}`;
}

export function validateEnv(schema, source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

const awsRegion = z.string().min(1, 'AWS_REGION is required');
const stackName = z.string().min(1, 'STACK_NAME is required');
const stacks = z.string().default('all');
const secretNameIot = z.string().min(1, 'SECRET_NAME_IOT is required');

export const deployEnvSchema = z.object({
  STACKS: stacks,
  STACK_NAME: stackName,
  AWS_REGION: awsRegion,
});

export const destroyEnvSchema = z.object({
  STACKS: stacks,
  STACK_NAME: stackName,
});

export const uiDeployEnvSchema = z.object({
  STACK_NAME: stackName,
  AWS_REGION: awsRegion,
});

export const fetchCertsEnvSchema = z.object({
  AWS_REGION: awsRegion,
  SECRET_NAME_IOT: secretNameIot.optional(),
});

export const integrationTestEnvSchema = z.object({
  STACK_NAME: stackName,
  AWS_REGION: awsRegion,
});

export const seedAdminEnvSchema = z.object({
  USER_POOL_ID: z.string().min(1, 'USER_POOL_ID is required'),
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  ADMIN_EMAIL: z.string().default('admin@crossboxgym.com'),
  ADMIN_PASSWORD: z.string().default('Admin123!'),
});

export const stripeLiveTestEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  RUN_STRIPE_LIVE_TESTS: z
    .union([z.enum(['true', 'false']), z.boolean()])
    .optional()
    .transform((value) => value === 'true' || value === true),
});
