export interface RemoteOpsFormState {
  unlockDeviceId: string;
}

export type RemoteOpsFormAction = { type: 'SET_DEVICE_ID'; payload: string } | { type: 'RESET_FORM' };

export const initialRemoteOpsFormState: RemoteOpsFormState = {
  unlockDeviceId: '',
};

export function remoteOpsFormReducer(state: RemoteOpsFormState, action: RemoteOpsFormAction): RemoteOpsFormState {
  switch (action.type) {
    case 'SET_DEVICE_ID':
      return {
        ...state,
        unlockDeviceId: action.payload,
      };
    case 'RESET_FORM':
      return initialRemoteOpsFormState;
    default:
      return state;
  }
}

// Action Creators
export const setUnlockDeviceId = (deviceId: string): RemoteOpsFormAction => ({
  type: 'SET_DEVICE_ID',
  payload: deviceId,
});

export const resetRemoteOpsForm = (): RemoteOpsFormAction => ({
  type: 'RESET_FORM',
});
