import { z } from 'zod';

export interface AuthEnvironment {
  mainTableName: string;
  userPoolId: string;
  userPoolClientId: string;
  frontendUrl: string;
}

const authEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  USER_POOL_ID: z.string().min(1, 'USER_POOL_ID is required'),
  USER_POOL_CLIENT_ID: z.string().min(1, 'USER_POOL_CLIENT_ID is required'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),
});

export function loadAuthEnvironment(env: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  const validated = authEnvironmentSchema.parse(env);
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    userPoolId: validated.USER_POOL_ID,
    userPoolClientId: validated.USER_POOL_CLIENT_ID,
    frontendUrl: validated.FRONTEND_URL,
  };
}
