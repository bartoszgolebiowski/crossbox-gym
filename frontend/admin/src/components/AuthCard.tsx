import React, { useReducer } from 'react';
import sharedIcon from '../../../shared/icon.png';
import {
  adminAuthFormReducer,
  changeAdminAuthFormField,
  initialAdminAuthFormState,
} from '../reducers/adminAuthFormReducer';
import { useAdminDispatch, useAdminSelector } from '../store';
import { adminLoginThunk, selectAdminAuth } from '../store/authSlice';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-ink/80';
const fieldClass =
  'w-full rounded-control border border-line bg-paper px-3.5 py-3 text-sm text-ink shadow-control placeholder:text-ink/40 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10';

export const AuthCard: React.FC = () => {
  const dispatch = useAdminDispatch();
  const { loading, error } = useAdminSelector(selectAdminAuth);

  const [formState, dispatchForm] = useReducer(adminAuthFormReducer, initialAdminAuthFormState);
  const { inputEmail, inputPassword } = formState;

  const handleFieldChange = (field: 'inputEmail' | 'inputPassword', value: string) => {
    dispatchForm(changeAdminAuthFormField(field, value));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(adminLoginThunk({ email: inputEmail, password: inputPassword }));
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-card border border-line bg-paper p-6 shadow-card sm:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <img
            src={sharedIcon}
            alt="CrossGym Logo"
            className="w-12 h-12 rounded-xl object-contain shadow-sm border border-line/40 bg-paper p-1 mb-3 inline-block"
          />
          <h2 className="text-xl font-bold text-ink tracking-tight">Logowanie Administratora</h2>
          <p className="mt-1 text-sm text-muted">Zaloguj się danymi konta administratora</p>
        </div>

        {error && (
          <div className="mb-5 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm leading-relaxed text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className={fieldLabelClass} htmlFor="admin-email">
              E-mail Administratora
            </label>
            <input
              id="admin-email"
              type="email"
              className={fieldClass}
              placeholder="admin@crossgym.pl"
              value={inputEmail}
              onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className={fieldLabelClass} htmlFor="admin-password">
              Hasło
            </label>
            <input
              id="admin-password"
              type="password"
              className={fieldClass}
              placeholder="••••••••"
              value={inputPassword}
              onChange={(e) => handleFieldChange('inputPassword', e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-primary px-4 py-3 text-sm font-semibold text-white shadow-control transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Weryfikacja uprawnień...' : 'Zaloguj się do Panelu'}
          </button>
        </form>
      </div>
    </div>
  );
};
