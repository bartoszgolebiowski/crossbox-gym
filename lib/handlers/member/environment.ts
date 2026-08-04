import { LambdaEnv, validateLambdaEnv } from '../shared/config';

export interface MemberEnvironment {
  mainTableName: string;
  paymentProvider: string;
  frontendUrl: string;
}

export function loadMemberEnvironment(env: NodeJS.ProcessEnv = process.env): MemberEnvironment {
  const validated = validateLambdaEnv(env) as LambdaEnv;
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    paymentProvider: validated.PAYMENT_PROVIDER,
    frontendUrl: validated.FRONTEND_URL,
  };
}
