import { LambdaEnv, validateLambdaEnv } from '../shared/config';

export interface AuthEnvironment {
  mainTableName: string;
  userPoolId: string;
  userPoolClientId: string;
  frontendUrl: string;
  identityProvider: string;
}

export function loadAuthEnvironment(env: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  const validated = validateLambdaEnv(env) as LambdaEnv;
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    userPoolId: validated.USER_POOL_ID,
    userPoolClientId: validated.USER_POOL_CLIENT_ID,
    frontendUrl: validated.FRONTEND_URL,
    identityProvider: validated.IDENTITY_PROVIDER,
  };
}
