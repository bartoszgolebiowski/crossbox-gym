interface CustomMessageEvent {
  triggerSource: string;
  request: {
    codeParameter: string;
  };
  response: {
    emailSubject?: string;
    emailMessage?: string;
  };
}

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    event.response.emailSubject = 'Set your new Crossbox Gym password';
    event.response.emailMessage = `Use this code to set a new Crossbox Gym password: ${event.request.codeParameter}\n\nIf you did not request a password reset, you can safely ignore this email.`;
  }

  return event;
};