import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AdminTab = 'management' | 'activity' | 'lockerActivity';

export interface UIState {
  activeTab: AdminTab;
}

const initialState: UIState = {
  activeTab: 'management',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveTab: (state, action: PayloadAction<AdminTab>) => {
      state.activeTab = action.payload;
    },
  },
});

export const { setActiveTab } = uiSlice.actions;
export const selectActiveTab = (state: { ui: UIState }) => state.ui.activeTab;

export default uiSlice.reducer;
