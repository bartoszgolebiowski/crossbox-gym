import React from 'react';
import { AutoRedirect } from './AutoRedirect';
import { CheckoutResultLayout } from './CheckoutResultLayout';

export const CheckoutCancelPage: React.FC = () => {
  return (
    <>
      <CheckoutResultLayout
        eyebrow="Checkout cancelled"
        title="No worries"
        message="You can subscribe at any time from the member dashboard."
        countdownLabel="Returning to the dashboard in"
        icon={
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        }
      />
      <AutoRedirect to="/" />
    </>
  );
};
