export interface AdminAuthFormState {
  inputEmail: string;
  inputPassword: string;
}

export type AdminAuthFormAction =
  | { type: 'CHANGE_FIELD'; payload: { field: keyof AdminAuthFormState; value: string } }
  | { type: 'RESET_FORM' };

export const initialAdminAuthFormState: AdminAuthFormState = {
  inputEmail: '',
  inputPassword: '',
};

export function adminAuthFormReducer(state: AdminAuthFormState, action: AdminAuthFormAction): AdminAuthFormState {
  switch (action.type) {
    case 'CHANGE_FIELD':
      return {
        ...state,
        [action.payload.field]: action.payload.value,
      };
    case 'RESET_FORM':
      return initialAdminAuthFormState;
    default:
      return state;
  }
}

// Action Creators
export const changeAdminAuthFormField = (field: keyof AdminAuthFormState, value: string): AdminAuthFormAction => ({
  type: 'CHANGE_FIELD',
  payload: { field, value },
});

export const resetAdminAuthForm = (): AdminAuthFormAction => ({
  type: 'RESET_FORM',
});
