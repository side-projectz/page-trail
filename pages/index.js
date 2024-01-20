'use client';

import React, { useEffect, useState } from 'react';
import Listener from '../components/listener';

// Move the API call outside of the component
const fetchUserInfo = async () => {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`);
  return response.json();
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
