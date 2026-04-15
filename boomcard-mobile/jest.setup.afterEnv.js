// Runs after the test framework is installed — afterEach is available here.
// Reset Expo mock state between tests.
afterEach(() => {
  try {
    const secureStore = require('expo-secure-store');
    if (secureStore.__reset) secureStore.__reset();
  } catch {
    // mock not loaded — nothing to reset
  }
});
