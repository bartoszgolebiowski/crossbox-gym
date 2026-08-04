export interface LocationFormState {
  locName: string;
  locAddress: string;
}

export type LocationFormAction =
  { type: 'CHANGE_FIELD'; payload: { field: keyof LocationFormState; value: string } } | { type: 'RESET_FORM' };

export const initialLocationFormState: LocationFormState = {
  locName: '',
  locAddress: '',
};

export function locationFormReducer(state: LocationFormState, action: LocationFormAction): LocationFormState {
  switch (action.type) {
    case 'CHANGE_FIELD':
      return {
        ...state,
        [action.payload.field]: action.payload.value,
      };
    case 'RESET_FORM':
      return initialLocationFormState;
    default:
      return state;
  }
}

// Action Creators
export const changeLocationFormField = (field: keyof LocationFormState, value: string): LocationFormAction => ({
  type: 'CHANGE_FIELD',
  payload: { field, value },
});

export const resetLocationForm = (): LocationFormAction => ({
  type: 'RESET_FORM',
});
