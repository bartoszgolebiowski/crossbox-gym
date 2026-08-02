export interface AccessFormState {
  locationId: string;
  scannerName: string;
  scannerId: string;
  isCustomLocation: boolean;
}

export type AccessFormAction =
  | { type: 'UPDATE_FIELD'; payload: { field: keyof AccessFormState; value: string | boolean } }
  | { type: 'SET_LOCATION_ID'; payload: string }
  | { type: 'RESET_FORM' };

export const initialAccessFormState: AccessFormState = {
  locationId: '',
  scannerName: '',
  scannerId: '',
  isCustomLocation: false,
};

export function accessFormReducer(state: AccessFormState, action: AccessFormAction): AccessFormState {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return {
        ...state,
        [action.payload.field]: action.payload.value,
      };
    case 'SET_LOCATION_ID':
      return {
        ...state,
        locationId: action.payload,
      };
    case 'RESET_FORM':
      return initialAccessFormState;
    default:
      return state;
  }
}

export const updateAccessFormField = (
  field: keyof AccessFormState,
  value: string | boolean
): AccessFormAction => ({
  type: 'UPDATE_FIELD',
  payload: { field, value },
});
