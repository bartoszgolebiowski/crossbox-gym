import { z } from 'zod';

export interface AdminEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  auditLogsTableName: string;
  presenceTableName: string;
  deviceOfflineThresholdMs: number;
  lockerClientType: string;
}

const adminEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
  ENTRY_LOGS_TABLE_NAME: z.string().min(1, 'ENTRY_LOGS_TABLE_NAME is required'),
  AUDIT_LOGS_TABLE_NAME: z.string().min(1, 'AUDIT_LOGS_TABLE_NAME is required'),
  PRESENCE_TABLE_NAME: z.string().min(1, 'PRESENCE_TABLE_NAME is required'),
  LOCKER_CLIENT_TYPE: z.string().min(1, 'LOCKER_CLIENT_TYPE is required'),
  DEVICE_OFFLINE_THRESHOLD_MS: z
    .string()
    .min(1, 'DEVICE_OFFLINE_THRESHOLD_MS is required')
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error('DEVICE_OFFLINE_THRESHOLD_MS must be a valid number');
      }
      return parsed;
    }),
});

export function loadAdminEnvironment(env: NodeJS.ProcessEnv = process.env): AdminEnvironment {
  const validated = adminEnvironmentSchema.parse(env);
  return {
    mainTableName: validated.MAIN_TABLE_NAME,
    entryLogsTableName: validated.ENTRY_LOGS_TABLE_NAME,
    auditLogsTableName: validated.AUDIT_LOGS_TABLE_NAME,
    presenceTableName: validated.PRESENCE_TABLE_NAME,
    deviceOfflineThresholdMs: validated.DEVICE_OFFLINE_THRESHOLD_MS,
    lockerClientType: validated.LOCKER_CLIENT_TYPE,
  };
}
