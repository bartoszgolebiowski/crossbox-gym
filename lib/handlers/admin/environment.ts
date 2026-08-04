import { getAuditLogsTableName, getEntryLogsTableName, getMainTableName } from '../shared/config';

export interface AdminEnvironment {
  mainTableName: string;
  entryLogsTableName: string;
  auditLogsTableName: string;
  iotEndpoint?: string;
}

export function loadAdminEnvironment(_env = process.env): AdminEnvironment {
  return {
    mainTableName: getMainTableName(),
    entryLogsTableName: getEntryLogsTableName(),
    auditLogsTableName: getAuditLogsTableName(),
    iotEndpoint: process.env.IOT_ENDPOINT,
  };
}
