// Prevent expo's ReadableStream polyfill from crashing axios's fetch adapter detection.
// Axios's fetch.js tests ReadableStream.cancel() at module load, which throws with expo's
// stream polyfill. Temporarily removing fetch forces axios to auto-select the http adapter.
const _fetch = globalThis.fetch;
delete globalThis.fetch;
const axios = require('axios');
axios.defaults.adapter = 'http';
globalThis.fetch = _fetch;

// Suppress noisy React Native / Animated console warnings in test output
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Animated:') || args[0].includes('NativeModule'))
  ) {
    return;
  }
  originalWarn.call(console, ...args);
};

