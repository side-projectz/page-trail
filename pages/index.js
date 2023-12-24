import React, { useEffect, useState } from 'react';
import Listener from '../components/listener';

export default function Home() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      checkLogin();
    }
  }, []);

  const checkLogin = async () => {
    const result = await chrome.storage.local.get('user_email');
    console.log(result);
    if (result.user_email) {
      chrome.runtime.sendMessage({ action: 'start_tracking' });
      setUser(result.user_email);
    }
  };

  return (
    <>
      {user && <Listener />}
      {!user && <div>Not logged in</div>}
    </>
  );
}
