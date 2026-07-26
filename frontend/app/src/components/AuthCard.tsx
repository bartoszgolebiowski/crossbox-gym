import React, { useReducer } from 'react';
import { authFormReducer, AuthMode, changeAuthFormField, initialAuthFormState, setAuthMode } from '../reducers/authFormReducer';
import { useAppDispatch, useAppSelector } from '../store';
import { clearAuthMessages, confirmForgotPasswordThunk, forgotPasswordThunk, loginThunk, registerThunk, selectAuth } from '../store/authSlice';
import { fetchDashboardThunk, fetchInvoicesThunk } from '../store/memberSlice';

const fieldLabelClass = 'mb-2 block text-sm font-medium text-stone-700';
const fieldClass = 'w-full rounded-md border border-stone-300 bg-[#fffdf8] px-3.5 py-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 transition focus:border-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-800/10';
const submitButtonClass = 'mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-rose-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50';

export const AuthCard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { loading, error, successMessage } = useAppSelector(selectAuth);

  const [formState, dispatchForm] = useReducer(authFormReducer, initialAuthFormState);
  const { authMode, inputEmail, inputPassword, inputCode, newPassword } = formState;

  const switchTab = (mode: AuthMode) => {
    dispatch(clearAuthMessages());
    dispatchForm(setAuthMode(mode));
  };

  const handleFieldChange = (field: 'inputEmail' | 'inputPassword' | 'inputCode' | 'newPassword', value: string) => {
    dispatchForm(changeAuthFormField(field, value));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginThunk({ email: inputEmail, password: inputPassword }));
    if (loginThunk.fulfilled.match(result)) {
      dispatch(fetchDashboardThunk());
      dispatch(fetchInvoicesThunk());
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(registerThunk({ email: inputEmail, password: inputPassword }));
    if (registerThunk.fulfilled.match(result)) {
      dispatch(fetchDashboardThunk());
      dispatch(fetchInvoicesThunk());
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(forgotPasswordThunk({ email: inputEmail }));
    if (forgotPasswordThunk.fulfilled.match(result)) {
      dispatchForm(setAuthMode('reset'));
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(confirmForgotPasswordThunk({ email: inputEmail, code: inputCode, newPassword }));
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-lg border border-stone-300 bg-[#fffdf8] p-6 shadow-xl shadow-stone-900/5 sm:p-8">
        {/* Card Header Title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-rose-50 text-rose-800 border border-rose-200 mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">
            {authMode === 'login' && 'Welcome Back'}
            {authMode === 'register' && 'Create Member Account'}
            {authMode === 'forgot' && 'Reset Password'}
            {authMode === 'reset' && 'Enter Verification Code'}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {authMode === 'login' && 'Sign in to access your turnstile QR pass'}
            {authMode === 'register' && 'Register to manage your CrossBox Gym membership'}
            {authMode === 'forgot' && 'We will send a reset code to your email'}
            {authMode === 'reset' && 'Set a new secure password for your account'}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 grid grid-cols-3 gap-1 rounded-md border border-stone-200 bg-stone-100 p-1">
          <button
            type="button"
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              authMode === 'login'
                ? 'bg-rose-800 text-white font-semibold shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
            onClick={() => switchTab('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              authMode === 'register'
                ? 'bg-rose-800 text-white font-semibold shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
            onClick={() => switchTab('register')}
          >
            Register
          </button>
          <button
            type="button"
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              authMode === 'forgot' || authMode === 'reset'
                ? 'bg-rose-800 text-white font-semibold shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
            onClick={() => switchTab('forgot')}
          >
            Forgot
          </button>
        </div>

        {/* Error / Success Notifications */}
        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">
            {successMessage}
          </div>
        )}

        {/* Forms */}
        {authMode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className={fieldClass}
                placeholder="member@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="login-password">Password</label>
              <input
                id="login-password"
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
              className={submitButtonClass}
            >
              {loading ? 'Signing In...' : 'Sign In to Portal'}
            </button>
          </form>
        )}

        {authMode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="register-email">Email Address</label>
              <input
                id="register-email"
                type="email"
                className={fieldClass}
                placeholder="member@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                className={fieldClass}
                placeholder="Minimum 8 characters"
                value={inputPassword}
                onChange={(e) => handleFieldChange('inputPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={submitButtonClass}
            >
              {loading ? 'Creating Account...' : 'Create Member Account'}
            </button>
          </form>
        )}

        {authMode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="forgot-email">Account Email Address</label>
              <input
                id="forgot-email"
                type="email"
                className={fieldClass}
                placeholder="member@example.com"
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={submitButtonClass}
            >
              {loading ? 'Sending Reset Code...' : 'Send Verification Code'}
            </button>
            <button
              type="button"
              className="w-full cursor-pointer text-center text-sm font-medium text-rose-800 hover:text-rose-700"
              onClick={() => switchTab('reset')}
            >
              I already have a code
            </button>
          </form>
        )}

        {authMode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className={fieldLabelClass} htmlFor="reset-email">Account Email</label>
              <input
                id="reset-email"
                type="email"
                className={fieldClass}
                value={inputEmail}
                onChange={(e) => handleFieldChange('inputEmail', e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="reset-code">Verification Code</label>
              <input
                id="reset-code"
                type="text"
                className={`${fieldClass} font-mono`}
                placeholder="123456"
                value={inputCode}
                onChange={(e) => handleFieldChange('inputCode', e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="reset-password">New Password</label>
              <input
                id="reset-password"
                type="password"
                className={fieldClass}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => handleFieldChange('newPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={submitButtonClass}
            >
              {loading ? 'Confirming Reset...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
