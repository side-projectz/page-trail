'use client';

import React, { useEffect, useState } from 'react';
import Listener from '../components/listener';

export default function Home() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const checkAuth = () => {
      setStatus('checking auth');
      setStatus(user ? 'user already set' : 'user not set');

      if (user) {
        setStatus('user already set');
        return;
      }

      chrome.runtime.sendMessage({ action: 'checkAuth' }, async (response) => {
        console.log('checkAuth response', response)
        setStatus('check auth response');
        setStatus(
          response.isAuthenticated ? 'authenticated' : 'not authenticated'
        );
        if (response.isAuthenticated) {
          const user = response.user
          await chrome.storage.local.set({ user_email: user.email });
          setUser(user);
          setIsTrackingEnabled(true);
          setStatus('authenticated');
        } else {
          setUser(null);
          setIsTrackingEnabled(false);
          setStatus('not authenticated');
        }
      });
    };

    if (window && document && typeof chrome !== 'undefined' && chrome.storage) {
      checkAuth();
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
      {/* Signed in as {user.email} <br /> */}
      {!isTrackingEnabled && <div>Authorization...</div>}
      {isTrackingEnabled && <Listener />}
    </>
  );
}
