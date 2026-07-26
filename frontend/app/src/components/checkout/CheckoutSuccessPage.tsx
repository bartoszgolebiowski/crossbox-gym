import React from 'react';
import { AutoRedirect } from './AutoRedirect';
import { CheckoutResultLayout } from './CheckoutResultLayout';

export const CheckoutSuccessPage: React.FC = () => {
  return (
    <>
      <CheckoutResultLayout
        eyebrow="Payment successful"
        title="Welcome to CrossBox"
        message="Your membership is being activated. Check your email for a code to set your password."
        countdownLabel="Redirecting to the member dashboard in"
        icon={
          <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        }
      />
      <AutoRedirect to="/" />
    </>
  );
};
