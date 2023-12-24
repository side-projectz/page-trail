'use client'


import React, { useEffect, useState } from 'react';
import Listener from '../components/listener';

export default function Home() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');


  useEffect(() => {
    const checkLogin = async () => {
      try {

        const { token, grantedScopes } = await chrome.identity.getAuthToken({ interactive: true });

        if (chrome.runtime.lastError) {
          callback(chrome.runtime.lastError);
          return;
        }

        const url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + token;
        const res = await fetch(url)
        const userInfo = await res.json()
        setStatus(userInfo.email);

        const result = await chrome.storage.sync.get('user_email');

        if (result.user_email !== userInfo.email) {
          console.log("Session email and stored email do not match.");
          console.log("Session email: ", userInfo.email);
          console.log("Stored email: ", result.user_email);
          await chrome.storage.sync.clear();
          await chrome.storage.sync.set({ user_email: userInfo.email });
          await chrome.runtime.sendMessage({ action: 'start_tracking' });
        }

        setUser(userInfo);
        setIsTrackingEnabled(true);

      } catch (error) {
        console.log(error)
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      checkLogin();
    }
  }, [user]);

  if (!user) {
    return (
      <>
        Signing in please wait<br />
        {status}
      </>
    );
  }

  return (
    <>
      Signed in as {user.email} <br />
      {isTrackingEnabled && <Listener />}
      {!isTrackingEnabled && <div>Waiting for tracking authorization...</div>}
    </>
  );
}
