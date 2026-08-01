import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface UIState {
  activeTab: 'management' | 'activity';
}

const initialState: UIState = {
  activeTab: 'management',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveTab: (state, action: PayloadAction<'management' | 'activity'>) => {
      state.activeTab = action.payload;
    },
  },
});

export const { setActiveTab } = uiSlice.actions;
export const selectActiveTab = (state: { ui: UIState }) => state.ui.activeTab;

export default uiSlice.reducer;
