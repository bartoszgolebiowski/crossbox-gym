export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export interface AuthFormState {
  authMode: AuthMode;
  inputEmail: string;
  inputPassword: string;
  inputCode: string;
  newPassword: string;
}

export type AuthFormAction =
  | { type: 'SET_AUTH_MODE'; payload: AuthMode }
  | { type: 'CHANGE_FIELD'; payload: { field: keyof Omit<AuthFormState, 'authMode'>; value: string } }
  | { type: 'RESET_FORM' };

export const initialAuthFormState: AuthFormState = {
  authMode: 'login',
  inputEmail: '',
  inputPassword: '',
  inputCode: '',
  newPassword: '',
};

export function authFormReducer(state: AuthFormState, action: AuthFormAction): AuthFormState {
  switch (action.type) {
    case 'SET_AUTH_MODE':
      return {
        ...state,
        authMode: action.payload,
      };
    case 'CHANGE_FIELD':
      return {
        ...state,
        [action.payload.field]: action.payload.value,
      };
    case 'RESET_FORM':
      return initialAuthFormState;
    default:
      return state;
  }
}

// Action Creators
export const setAuthMode = (mode: AuthMode): AuthFormAction => ({
  type: 'SET_AUTH_MODE',
  payload: mode,
});

export const changeAuthFormField = (field: keyof Omit<AuthFormState, 'authMode'>, value: string): AuthFormAction => ({
  type: 'CHANGE_FIELD',
  payload: { field, value },
});

export const resetAuthForm = (): AuthFormAction => ({
  type: 'RESET_FORM',
});
