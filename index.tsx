import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// We removed the manual window.process polyfill.
// Build tools like Vite or Webpack handle variable injection automatically.

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);