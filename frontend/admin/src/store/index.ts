import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import adminOpsReducer from './adminSlice';
import authReducer from './authSlice';
import configReducer, { bootstrapAdminConfigThunk } from './configSlice';
import hardwareActivityReducer from './hardwareActivitySlice';
import lockerActivityReducer from './lockerActivitySlice';
import uiReducer from './uiSlice';

export const adminStore = configureStore({
  reducer: {
    config: configReducer,
    auth: authReducer,
    adminOps: adminOpsReducer,
    ui: uiReducer,
    hardwareActivity: hardwareActivityReducer,
    lockerActivity: lockerActivityReducer,
  },
});

export type AdminRootState = ReturnType<typeof adminStore.getState>;
export type AdminAppDispatch = typeof adminStore.dispatch;

export const useAdminDispatch = () => useDispatch<AdminAppDispatch>();
export const useAdminSelector: TypedUseSelectorHook<AdminRootState> = useSelector;

// Pure bootstrap function to be invoked explicitly in main.tsx
export const bootstrapAdminApp = () => {
  return adminStore.dispatch(bootstrapAdminConfigThunk());
};
