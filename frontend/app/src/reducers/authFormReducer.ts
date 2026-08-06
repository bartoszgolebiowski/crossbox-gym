export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export interface AuthFormState {
  authMode: AuthMode;
  inputEmail: string;
  inputPassword: string;
  inputCode: string;
  newPassword: string;
  confirmPassword: string;
  error: string | null;
}

export type AuthFormAction =
  | { type: 'SET_AUTH_MODE'; payload: AuthMode }
  | { type: 'CHANGE_FIELD'; payload: { field: keyof Omit<AuthFormState, 'authMode' | 'error'>; value: string } }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_FORM' };

export const initialAuthFormState: AuthFormState = {
  authMode: 'login',
  inputEmail: '',
  inputPassword: '',
  inputCode: '',
  newPassword: '',
  confirmPassword: '',
  error: null,
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
        error: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
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

export const changeAuthFormField = (
  field: keyof Omit<AuthFormState, 'authMode' | 'error'>,
  value: string
): AuthFormAction => ({
  type: 'CHANGE_FIELD',
  payload: { field, value },
});

export const setAuthFormError = (error: string | null): AuthFormAction => ({
  type: 'SET_ERROR',
  payload: error,
});
