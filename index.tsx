import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- ENVIRONMENT SETUP ---
// Polyfill process.env for browser environments to ensure API_KEY is available.
// This fixes the "No API Key" error on deployments where env vars aren't injected at build time.
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.process = window.process || { env: {} };
  // @ts-ignore
  if (!window.process.env) window.process.env = {};
  
  // @ts-ignore
  if (!window.process.env.API_KEY) {
    // @ts-ignore
    window.process.env.API_KEY = "AIzaSyDxFv4JbzAo-x_dBFSIFPwTsriwXlpoU_k";
  }
}

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