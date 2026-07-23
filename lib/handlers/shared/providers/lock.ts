import { LockProvider } from './types';

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

export function createLockProvider(type: string): LockProvider {
  return type === 'mock' ? new MockLockProvider() : new HttpLockProvider();
}
