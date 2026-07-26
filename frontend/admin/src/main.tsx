import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { adminStore, bootstrapAdminApp } from './store';
import App from './App';
import './index.css';

// Invoke admin application bootstrap right after imports for pure store module
bootstrapAdminApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={adminStore}>
      <App />
    </Provider>
  </React.StrictMode>
);
