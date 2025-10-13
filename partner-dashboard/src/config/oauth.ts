// OAuth Configuration for Google and Facebook Sign-In
// Replace these with your actual OAuth credentials from:
// Google: https://console.cloud.google.com/apis/credentials
// Facebook: https://developers.facebook.com/apps

export const OAUTH_CONFIG = {
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    redirectUri: window.location.origin,
  },
  facebook: {
    appId: import.meta.env.VITE_FACEBOOK_APP_ID || 'YOUR_FACEBOOK_APP_ID',
    version: 'v18.0',
    redirectUri: window.location.origin,
  },
};

// Initialize Facebook SDK
export const initFacebookSDK = (): Promise<void> => {
  return new Promise((resolve) => {
    // Load Facebook SDK script
    if (document.getElementById('facebook-jssdk')) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      (window as any).FB.init({
        appId: OAUTH_CONFIG.facebook.appId,
        cookie: true,
        xfbml: true,
        version: OAUTH_CONFIG.facebook.version,
      });
      resolve();
    };

    document.body.appendChild(script);
  });
};

export default OAUTH_CONFIG;
