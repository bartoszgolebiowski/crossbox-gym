import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store, bootstrapApp } from './store';
import App from './App';
import './index.css';

// Invoke application bootstrap right after imports for pure store module.
void bootstrapApp().catch(() => undefined);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
