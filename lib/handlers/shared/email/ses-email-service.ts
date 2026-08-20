import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

export interface EmailService {
  sendWelcomeVerifyEmail(toEmail: string, verifyUrl: string): Promise<void>;
}

export class SESEmailService implements EmailService {
  private ses = new SESClient({ region: process.env.SES_REGION || process.env.AWS_REGION || 'eu-central-1' });
  private fromEmail = process.env.SES_FROM_EMAIL || 'noreply@crossgym.fit';

  async sendWelcomeVerifyEmail(toEmail: string, verifyUrl: string): Promise<void> {
    const subject = 'Witaj w CrossGym 24/7! Zweryfikuj swoje konto';
    const htmlBody = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4ede0; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #14111d; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4ede0; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #fdfaf4; border-radius: 12px; border: 1px solid #dcd0be; box-shadow: 0 20px 25px -5px rgba(20, 17, 29, 0.07); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #14111d; padding: 28px 32px; text-align: center; border-bottom: 3px solid #7e22ce;">
              <span style="font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">
                CrossGym <span style="color: #7e22ce;">24/7</span>
              </span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 32px 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #14111d;">Witaj w klubie!</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
                Dziękujemy za zakup karnetu w CrossGym 24/7. Aby dokończyć aktywację konta i uzyskać całodobowy dostęp do siłowni, kliknij poniższy przycisk weryfikacyjny:
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${verifyUrl}" target="_blank" style="display: inline-block; background-color: #7e22ce; color: #ffffff; font-weight: 600; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(126, 34, 206, 0.25);">
                  Zweryfikuj konto i ustaw hasło
                </a>
              </div>
              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #6f6779;">
                Link jest ważny przez 48 godzin. Jeśli przycisk nie działa, skopiuj i wklej poniższy adres w przeglądarce:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; word-break: break-all;">
                <a href="${verifyUrl}" style="color: #7e22ce; text-decoration: underline;">${verifyUrl}</a>
              </p>
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #14111d;">
                Życzymy udanych treningów!<br>
                <strong>Zespół CrossGym 24/7</strong>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4ede0; padding: 20px 32px; text-align: center; border-top: 1px solid #dcd0be;">
              <p style="margin: 0; font-size: 13px; color: #6f6779; line-height: 1.5;">
                &copy; CrossGym 24/7. Wszystkie prawa zastrzeżone.<br>
                Wiadomość wygenerowana automatycznie – prosimy na nią nie odpowiadać.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = `Witaj w CrossGym 24/7!\n\nDziękujemy za zakup karnetu. Otwórz poniższy link weryfikacyjny, aby aktywować konto i ustawić swoje hasło:\n${verifyUrl}\n\nLink jest ważny przez 48 godzin.\n\nŻyczymy udanych treningów!\nZespół CrossGym 24/7`;

    const command = new SendEmailCommand({
      Source: `CrossGym 24/7 <${this.fromEmail}>`,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: textBody,
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
