import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { CheckoutCancelPage } from './components/checkout/CheckoutCancelPage';
import { CheckoutRedirectPage } from './components/checkout/CheckoutRedirectPage';
import { CheckoutSuccessPage } from './components/checkout/CheckoutSuccessPage';
import './index.css';
import { bootstrapApp, store } from './store';

// Invoke application bootstrap right after imports for pure store module.
void bootstrapApp().catch(() => undefined);

function renderRoute(pathname: string) {
  switch (pathname) {
    case '/checkout/success':
      return <CheckoutSuccessPage />;
    case '/checkout/cancel':
      return <CheckoutCancelPage />;
    case '/checkout/redirect':
      return <CheckoutRedirectPage />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>{renderRoute(window.location.pathname)}</Provider>
  </React.StrictMode>
);
