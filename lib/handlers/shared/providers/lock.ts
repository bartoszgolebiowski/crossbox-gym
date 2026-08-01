import { LockerAdapter } from '../access-contracts';
import { HardwareAdapterId, LockerItem, UnlockCommand } from '../access-types';
import { LockProvider } from './types';

export class MockLockerAdapter implements LockerAdapter {
  readonly id: HardwareAdapterId = 'mock';

  async unlock(locker: LockerItem, command: UnlockCommand): Promise<void> {
    console.log(JSON.stringify({ level: 'info', message: 'MockLockerAdapter.unlock', locker_id: locker.locker_id, command_id: command.command_id, duration_seconds: command.duration_seconds }));
  }
}

export class HttpLockerAdapter implements LockerAdapter {
  readonly id: HardwareAdapterId = 'http';

  async unlock(locker: LockerItem, command: UnlockCommand): Promise<void> {
    const config = locker.adapter_configuration;
    const port = Number(config.port || 80);
    const path = config.path || '/unlock';
    const response = await fetch(`http://${config.ip}:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: command.duration_seconds, command_id: command.command_id }),
    });
    if (!response.ok) throw new Error(`Locker unlock failed: ${response.status} ${response.statusText}`);
  }
}

export function createLockerAdapter(adapterId: HardwareAdapterId): LockerAdapter {
  if (adapterId === 'mock') return new MockLockerAdapter();
  if (adapterId === 'http') return new HttpLockerAdapter();
  throw new Error(`Unsupported locker adapter: '${adapterId}'`);
}

export class HttpLockProvider implements LockProvider {
  async sendUnlockCommand(params: { ip: string; port?: number; path?: string; durationSeconds: number; }): Promise<void> {
    const port = params.port || 80;
    const path = params.path || '/unlock';
    const url = `http://${params.ip}:${port}${path}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: params.durationSeconds })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send unlock command: ${response.status} ${response.statusText}`);
    }
  }
}

export class MockLockProvider implements LockProvider {
  async sendUnlockCommand(params: { ip: string; port?: number; path?: string; durationSeconds: number; }): Promise<void> {
    console.log(JSON.stringify({
      level: 'info',
      message: 'MockLockProvider.sendUnlockCommand',
      data: params
    }));
  }
}

const lockProviders: Record<string, new () => LockProvider> = {
  http: HttpLockProvider,
  mock: MockLockProvider,
};

export function createLockProvider(type: string): LockProvider {
  const ProviderClass = lockProviders[type];
  if (!ProviderClass) {
    throw new Error(`Unsupported lock provider type: '${type}'`);
  }
  return new ProviderClass();
}
