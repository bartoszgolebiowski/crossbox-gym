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

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  if (event.triggerSource === 'CustomMessage_AdminCreateUser') {
    event.response.emailSubject = 'Witaj w CrossBox Gym 24/7! Ustaw swoje hasło';
    event.response.emailMessage = `Witaj w CrossBox Gym 24/7!\n\nTwoje konto zostało pomyślnie utworzone po zakupie karnetu.\n\nTwoje tymczasowe hasło dostępowe to: ${event.request.codeParameter}\n\nZaloguj się do portalu członkowskiego, aby ustawić swoje stałe hasło:\nhttps://d13854k5l0t1k8.cloudfront.net\n\nŻyczymy udanych treningów!\nZespół CrossBox Gym 24/7`;
  }

  if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    event.response.emailSubject = 'Resetuj swoje hasło w CrossBox Gym 24/7';
    event.response.emailMessage = `Użyj poniższego kodu, aby ustawić nowe hasło w CrossBox Gym 24/7: ${event.request.codeParameter}\n\nJeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość.`;
  }

  if (event.triggerSource === 'CustomMessage_SignUp' || event.triggerSource === 'CustomMessage_ResendCode') {
    event.response.emailSubject = 'Witaj w CrossBox Gym 24/7! Zweryfikuj swoje konto';
    event.response.emailMessage = `Witaj w CrossBox Gym 24/7!\n\nTwój kod weryfikacyjny to: ${event.request.codeParameter}\n\nWpisz ten kod, aby dokończyć weryfikację i aktywować konto.\n\nŻyczymy udanych treningów!\nZespół CrossBox Gym 24/7`;
  }

  return event;
};
