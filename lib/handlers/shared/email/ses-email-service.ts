import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

export interface EmailService {
  sendWelcomeVerifyEmail(toEmail: string, verifyUrl: string): Promise<void>;
}

export class SESEmailService implements EmailService {
  private ses = new SESClient({ region: process.env.SES_REGION || process.env.AWS_REGION || 'eu-central-1' });
  private fromEmail = process.env.SES_FROM_EMAIL || 'noreply@crossgym.fit';

  async sendWelcomeVerifyEmail(toEmail: string, verifyUrl: string): Promise<void> {
    const command = new SendEmailCommand({
      Source: `CrossBox Gym 24/7 <${this.fromEmail}>`,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: 'Witaj w CrossBox Gym 24/7! Zweryfikuj swoje konto', Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="color: #d97706; font-size: 24px; margin: 0;">CrossBox Gym 24/7</h1>
                </div>
                <h2 style="color: #111827; font-size: 18px;">Witaj w klubie!</h2>
                <p style="color: #374151; font-size: 14px; line-height: 1.6;">
                  Dziękujemy za zakup karnetu. Aby dokończyć aktywację konta i uzyskać dostęp do siłowni 24/7, kliknij poniższy przycisk weryfikacyjny:
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${verifyUrl}" style="background-color: #d97706; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
                    Zweryfikuj konto i ustaw hasło
                  </a>
                </div>
                <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
                  Link jest ważny przez 48 godzin. Jeśli przycisk nie działa, skopiuj i wklej ten adres w przeglądarce:<br>
                  <a href="${verifyUrl}" style="color: #d97706;">${verifyUrl}</a>
                </p>
              </div>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: `Witaj w CrossBox Gym 24/7!\n\nDziękujemy za zakup karnetu. Otwórz poniższy link weryfikacyjny, aby aktywować konto i ustawić swoje hasło:\n${verifyUrl}\n\nLink jest ważny przez 48 godzin.`,
            Charset: 'UTF-8',
          },
        },
      },
    });

    try {
      await this.ses.send(command);
      console.log(`[SES] Welcome verify email sent successfully to ${toEmail}. Activation link: ${verifyUrl}`);
    } catch (err: any) {
      console.error(`[SES Error] Failed to send welcome verify email to ${toEmail}: ${err?.message || err}`);
      console.log(`[ACTIVATION LINK LOG] Activation URL for ${toEmail}: ${verifyUrl}`);
    }
  }
}

export class MockEmailService implements EmailService {
  async sendWelcomeVerifyEmail(toEmail: string, verifyUrl: string): Promise<void> {
    console.log(`[MockEmailService] Welcome verify email for ${toEmail}: ${verifyUrl}`);
  }
}
