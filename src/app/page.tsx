'use client';

import Listener from '@/components/listener';
import Image from 'next/image'
import { useEffect, useState } from 'react';

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
        setStatus('check auth response');

        setStatus(
          response.isAuthenticated ? 'authenticated' : 'not authenticated'
        );
        if (response.isAuthenticated) {
          const user = await chrome.storage.sync.get('user_email');
          setUser(user.user_email);
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
      Signed in as {user} <br />
      {isTrackingEnabled && <Listener />}
      {!isTrackingEnabled && <div>Waiting for tracking authorization...</div>}
    </>
  )
}
