import React from 'react';
import { AutoRedirect } from './AutoRedirect';
import { CheckoutResultLayout } from './CheckoutResultLayout';

export const CheckoutRedirectPage: React.FC = () => {
  return (
    <>
      <CheckoutResultLayout
        eyebrow="Redirecting"
        title="One moment"
        message="We're bringing you back to the CrossGym member dashboard."
        countdownLabel="Continuing in"
        icon={
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />
      <AutoRedirect to="/" />
    </>
  );
};
