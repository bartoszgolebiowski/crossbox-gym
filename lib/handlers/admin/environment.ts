import { LambdaEnv, validateLambdaEnv } from '../shared/config';

export interface AdminEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  auditLogsTableName: string;
  iotEndpoint?: string;
}

export function loadAdminEnvironment(env: NodeJS.ProcessEnv = process.env): AdminEnvironment {
  const validated = validateLambdaEnv(env) as LambdaEnv;
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    entryLogsTableName: validated.ENTRY_LOGS_TABLE_NAME,
    auditLogsTableName: validated.AUDIT_LOGS_TABLE_NAME,
    iotEndpoint: validated.IOT_ENDPOINT,
  };
}
