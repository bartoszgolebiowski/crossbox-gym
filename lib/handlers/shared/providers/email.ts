import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailProvider } from './types';

export class SesEmailProvider implements EmailProvider {
  private ses = new SESClient({});

  async sendEmail(params: { to: string; subject: string; body: string; from: string }): Promise<void> {
    await this.ses.send(new SendEmailCommand({
      Source: params.from,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject },
        Body: { Text: { Data: params.body } }
      }
    }));
  }
}

export class MockEmailProvider implements EmailProvider {
  async sendEmail(params: { to: string; subject: string; body: string; from: string }): Promise<void> {
    console.log(JSON.stringify({
      level: 'info',
      message: 'MockEmailProvider.sendEmail',
      data: params
    }));
  }
}

export function createEmailProvider(type: string): EmailProvider {
  return type === 'mock' ? new MockEmailProvider() : new SesEmailProvider();
}
