import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { CheckoutCancelPage } from './components/checkout/CheckoutCancelPage';
import { CheckoutRedirectPage } from './components/checkout/CheckoutRedirectPage';
import { CheckoutSuccessPage } from './components/checkout/CheckoutSuccessPage';
import './index.css';
import { bootstrapApp, store } from './store';

// Invoke application bootstrap right after imports for pure store module.
void bootstrapApp().catch(() => undefined);

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/checkout/success', element: <CheckoutSuccessPage /> },
  { path: '/checkout/cancel', element: <CheckoutCancelPage /> },
  { path: '/checkout/redirect', element: <CheckoutRedirectPage /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </React.StrictMode>
);
