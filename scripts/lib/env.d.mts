/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

export const deployEnvSchema: z.ZodTypeAny;
export const destroyEnvSchema: z.ZodTypeAny;
export const uiDeployEnvSchema: z.ZodTypeAny;
export const fetchCertsEnvSchema: z.ZodTypeAny;
export const integrationTestEnvSchema: z.ZodTypeAny;
export const seedAdminEnvSchema: z.ZodTypeAny;
export const stripeLiveTestEnvSchema: z.ZodTypeAny;
export const secretNameIot: z.ZodTypeAny;

export function validateEnv(schema: z.ZodTypeAny, source: unknown): any;
