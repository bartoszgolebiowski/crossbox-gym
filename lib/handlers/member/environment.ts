export interface MemberEnvironment {
  mainTableName: string;
  paymentProvider: string;
  frontendUrl: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function loadMemberEnvironment(environment: NodeJS.ProcessEnv = process.env): MemberEnvironment {
  return {
    mainTableName: required(environment, 'MAIN_TABLE_NAME'),
    paymentProvider: environment.PAYMENT_PROVIDER?.trim() || 'stripe',
    frontendUrl: environment.FRONTEND_URL?.trim() || 'http://localhost:5173',
  };
}
