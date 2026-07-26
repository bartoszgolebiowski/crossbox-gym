import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import configReducer, { bootstrapConfigThunk } from './configSlice';
import authReducer from './authSlice';
import memberReducer, { fetchDashboardThunk, generateQRThunk, fetchInvoicesThunk } from './memberSlice';

export const store = configureStore({
  reducer: {
    config: configReducer,
    auth: authReducer,
    member: memberReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Pure bootstrap function to be invoked explicitly in main.tsx
export const bootstrapApp = () => {
  return store.dispatch(bootstrapConfigThunk()).unwrap().then(() => {
    const token = store.getState().auth.token;
    if (token) {
      store.dispatch(fetchDashboardThunk());
      store.dispatch(generateQRThunk());
      store.dispatch(fetchInvoicesThunk());
    }
  });
};
