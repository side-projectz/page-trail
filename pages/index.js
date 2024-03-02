'use client';

import React, { useEffect, useState } from 'react';
import Listener from '../components/listener';

// Move the API call outside of the component
const fetchUserInfo = async () => {
  const authResult = await launchWebAuthFlow_and_returnCallBackParams();
  if (!authResult) {
    return null;
  }

  const { token } = authResult;
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`
  );
  const userInfo = await response.json();
  await chrome.storage.local.set({ user_email: userInfo.email });
  return userInfo;
};

export default function Home() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // Combine the logic into one function
    const authenticateUser = async () => {
      try {
        setStatus('checking auth');
        if (user) {
          setStatus('user already set');
          return;
        }

        const userInfo = await fetchUserInfo();
        if (!userInfo) {
          setStatus('no response');
          setIsTrackingEnabled(false);
          setUser(null);
        } else {
          setUser(userInfo);
          setIsTrackingEnabled(true);
          setStatus('authenticated');
        }
      } catch (error) {
        console.error('Error during authentication:', error);
        setStatus('authentication error');
      }
    };

    if (window && document && typeof chrome !== 'undefined' && chrome.storage) {
      authenticateUser();
    }
  }, [user]);

  if (!user) {
    return (
      <>
        Signing in please wait
        <br />
        {status}
      </>
    );
  }

  return (
    <>
      {!isTrackingEnabled && <div>Authorization...</div>}
      {isTrackingEnabled && <Listener />}
    </>
  );
}

const launchWebAuthFlow_and_returnCallBackParams = async () => {
  const redirectURL = chrome.identity.getRedirectURL();
  const { oauth2 } = chrome.runtime.getManifest();
  const clientId = oauth2.client_id;
  const scopes = oauth2.scopes.join(' ');

  console.log('redirectURL', redirectURL);

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURL,
    response_type: 'token',
    scope: scopes,
  });

  console.log('authParams', authParams.toString());
  const authURL = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authURL,
    interactive: true,
  });
  const url = new URL(responseUrl);
  const urlParams = new URLSearchParams(url.hash.slice(1));
  const { access_token } = Object.fromEntries(urlParams.entries());

  return { token: access_token };
};
