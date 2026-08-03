export interface LockerCommandParams {
  id: number;
  on: boolean;
  toggle_after: number;
}

export interface LockerCommandPayload {
  id?: number;
  method: 'Switch.Set';
  params: LockerCommandParams;
}

export interface ILockerClient {
  openLocker(lockerId?: string, options?: Partial<LockerCommandParams>): Promise<LockerCommandPayload>;
}

export type LockerClientType = 'mqtt' | 'mock';
