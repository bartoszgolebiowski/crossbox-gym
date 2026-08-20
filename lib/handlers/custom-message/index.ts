interface CustomMessageEvent {
  triggerSource: string;
  request: {
    codeParameter: string;
    usernameParameter?: string;
  };
  response: {
    emailSubject?: string;
    emailMessage?: string;
  };
}

const renderEmailWrapper = (title: string, bodyContent: string): string => {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
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
              ${bodyContent}
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
};

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  if (event.triggerSource === 'CustomMessage_AdminCreateUser') {
    event.response.emailSubject = 'Witaj w CrossGym 24/7! Ustaw swoje hasło';
    const content = `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #14111d;">Witaj w CrossGym 24/7!</h1>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Twoje konto zostało pomyślnie utworzone po zakupie karnetu.
      </p>
      <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Twoje tymczasowe hasło dostępowe to:
      </p>
      <div style="margin: 0 0 24px 0; background-color: #f4ede0; border: 1px dashed #7e22ce; border-radius: 8px; padding: 16px 20px; text-align: center;">
        <span style="font-family: monospace, sans-serif; font-size: 22px; font-weight: 700; color: #7e22ce; letter-spacing: 2px;">
          ${event.request.codeParameter}
        </span>
      </div>
      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Zaloguj się do portalu członkowskiego, aby ustawić swoje stałe hasło:
      </p>
      <div style="text-align: center; margin: 0 0 28px 0;">
        <a href="https://d13854k5l0t1k8.cloudfront.net" target="_blank" style="display: inline-block; background-color: #7e22ce; color: #ffffff; font-weight: 600; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 2px 4px rgba(126, 34, 206, 0.25);">
          Zaloguj się do portalu
        </a>
      </div>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Życzymy udanych treningów!<br>
        <strong>Zespół CrossGym 24/7</strong>
      </p>
    `;
    event.response.emailMessage = renderEmailWrapper(event.response.emailSubject, content);
  }

  if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    event.response.emailSubject = 'Resetuj swoje hasło w CrossGym 24/7';
    const content = `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #14111d;">Reset hasła w CrossGym 24/7</h1>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Użyj poniższego kodu, aby ustawić nowe hasło w CrossGym 24/7:
      </p>
      <div style="margin: 0 0 24px 0; background-color: #f4ede0; border: 1px dashed #7e22ce; border-radius: 8px; padding: 20px; text-align: center;">
        <span style="font-family: monospace, sans-serif; font-size: 28px; font-weight: 700; color: #7e22ce; letter-spacing: 6px;">
          ${event.request.codeParameter}
        </span>
      </div>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #6f6779;">
        Jeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość.
      </p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Pozdrawiamy,<br>
        <strong>Zespół CrossGym 24/7</strong>
      </p>
    `;
    event.response.emailMessage = renderEmailWrapper(event.response.emailSubject, content);
  }

  if (event.triggerSource === 'CustomMessage_SignUp' || event.triggerSource === 'CustomMessage_ResendCode') {
    event.response.emailSubject = 'Witaj w CrossGym 24/7! Zweryfikuj swoje konto';
    const content = `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #14111d;">Witaj w CrossGym 24/7!</h1>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Twój kod weryfikacyjny to:
      </p>
      <div style="margin: 0 0 24px 0; background-color: #f4ede0; border: 1px dashed #0d9488; border-radius: 8px; padding: 20px; text-align: center;">
        <span style="font-family: monospace, sans-serif; font-size: 28px; font-weight: 700; color: #0d9488; letter-spacing: 6px;">
          ${event.request.codeParameter}
        </span>
      </div>
      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Wpisz ten kod, aby dokończyć weryfikację i aktywować konto.
      </p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #14111d;">
        Życzymy udanych treningów!<br>
        <strong>Zespół CrossGym 24/7</strong>
      </p>
    `;
    event.response.emailMessage = renderEmailWrapper(event.response.emailSubject, content);
  }

  return event;
};
