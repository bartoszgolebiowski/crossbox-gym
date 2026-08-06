import { z } from 'zod';

export interface VerifyEntryEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  lockerClientType: string;
}

const verifyEntryEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  ENTRY_LOGS_TABLE_NAME: z.string().min(1, 'ENTRY_LOGS_TABLE_NAME is required'),
  LOCKER_CLIENT_TYPE: z.string().min(1, 'LOCKER_CLIENT_TYPE is required'),
});

export function loadVerifyEntryEnvironment(env: NodeJS.ProcessEnv = process.env): VerifyEntryEnvironment {
  const validated = verifyEntryEnvironmentSchema.parse(env);
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    entryLogsTableName: validated.ENTRY_LOGS_TABLE_NAME,
    lockerClientType: validated.LOCKER_CLIENT_TYPE,
  };
}
