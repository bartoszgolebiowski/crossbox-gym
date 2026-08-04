export interface MemberOverrideFormState {
  overrideUserId: string;
  overrideAction: string;
}

export type MemberOverrideFormAction =
  { type: 'CHANGE_FIELD'; payload: { field: keyof MemberOverrideFormState; value: string } } | { type: 'RESET_FORM' };

export const initialMemberOverrideFormState: MemberOverrideFormState = {
  overrideUserId: '',
  overrideAction: 'suspend',
};

export function memberOverrideFormReducer(
  state: MemberOverrideFormState,
  action: MemberOverrideFormAction
): MemberOverrideFormState {
  switch (action.type) {
    case 'CHANGE_FIELD':
      return {
        ...state,
        [action.payload.field]: action.payload.value,
      };
    case 'RESET_FORM':
      return initialMemberOverrideFormState;
    default:
      return state;
  }
}

// Action Creators
export const changeMemberOverrideFormField = (
  field: keyof MemberOverrideFormState,
  value: string
): MemberOverrideFormAction => ({
  type: 'CHANGE_FIELD',
  payload: { field, value },
});

export const resetMemberOverrideForm = (): MemberOverrideFormAction => ({
  type: 'RESET_FORM',
});
