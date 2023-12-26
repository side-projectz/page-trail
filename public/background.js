let activeTab = null;
let tabDetails = {};

const exclusionRules = {
  urlPatterns: ['chrome://', 'about:'],
  domains: [],
};

function urlIsExcluded(url) {
  return (
    exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
    exclusionRules.domains.some((domain) =>
      new URL(url).hostname.includes(domain)
    )
  );
}


function injectContentScript(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "checkScript" }, (response) => {
    if (chrome.runtime.lastError || !response?.scriptActive) {
      chrome.tabs.executeScript(tabId, { file: "contentScript.js" }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to inject script:', chrome.runtime.lastError.message);
        }
      });
      tabDetails[tabId].scriptInjected = true;
    }
  });
}

function storeTabDetails(tabId, url, scriptInjected = false) {

  tabDetails[tabId] = {
    url: url,
    startTime: new Date().getTime(),
    scriptInjected: scriptInjected,
  };

  if (!urlIsExcluded(url)) {
    // chrome.tabs.sendMessage(tabId, { greeting: "hello" }, function (response) {
    //   console.log("response", response);
    // });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0].status === "complete") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getMeta" }, function (response) {
          console.log(response);
        });
      }
    });
  }

}

function getMainDomain(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const parts = hostname.split('.').reverse();
    let mainDomain =
      parts.length > 2 &&
        (parts[1].length === 2 ||
          ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))
        ? parts[2] + '.' + parts[1] + '.' + parts[0]
        : parts[1] + '.' + parts[0];

    return { mainDomain, hostname };
  } catch (error) {
    console.error('Invalid URL:', error);
    return null;
  }
}

async function updateLastSyncTime() {
  const lastSync = {
    time: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  await chrome.storage.sync.set({ lastSync });
  console.log('lastSync updated:', lastSync);
}

async function updateLastResetTime() {
  const lastReset = {
    time: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  await chrome.storage.sync.set({ lastReset });
  console.log('lastReset updated:', lastReset);
}

async function sendDataToServer() {
  try {
    const { pagesVisited } = await chrome.storage.local.get(['pagesVisited']);
    if (pagesVisited) {
      const email = await chrome.storage.sync.get('user_email')
      const response = await fetch(`https://page-trail-dashboard.vercel.app/api/extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, data: pagesVisited }),
      })
      console.log('Data sent successfully:', await response.json());
      await updateLastSyncTime();
    }
  } catch (error) {
    console.log('[Error] sending data:', error);
  }
}

async function updateTabTime(tabId, isTabClosing = false) {
  let tabInfo = tabDetails[tabId];

  if (tabId !== null && (isWindowFocused || isTabClosing) && tabInfo) {
    let currentTime = new Date().getTime();
    let duration = currentTime - tabInfo.startTime;
    try {
      // const tab = await chrome.tabs.get(tabId);
      const tab = tabInfo;
      if (!tab || !tab.url || urlIsExcluded(tab.url)) return;

      const domainData = getMainDomain(tab.url);
      if (!domainData) return;

      let pagesVisited = (await chrome.storage.local.get(['pagesVisited']))
        .pagesVisited;

      if (typeof pagesVisited === 'undefined') {
        await chrome.storage.local.set({ pagesVisited: [] });
        pagesVisited = [];
      }

      if (pagesVisited.length > 0) {
        const email = await chrome.storage.sync.get('user_email')
        const response = await (await fetch(` https://page-trail-dashboard.vercel.app/api/extension?email=${email}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })).json();

        // if (response.status === 200) {
        //   pagesVisited.push(...response.pagesVisited);
        // }
      }

      let domainIndex = pagesVisited.findIndex(
        (item) => item.domainName === domainData.mainDomain
      );

      if (domainIndex === -1) {
        pagesVisited.push({
          domainName: domainData.mainDomain,
          pages: [
            { page: tab.url, timeSpent: duration, lastVisited: currentTime },
          ],
        });
      } else {
        let page = pagesVisited[domainIndex].pages.find(
          (p) => p.page === tab.url
        );
        if (!page) {
          pagesVisited[domainIndex].pages.push({
            page: tab.url,
            timeSpent: duration,
            lastVisited: currentTime,
          });
        } else {
          page.timeSpent += duration;
          page.lastVisited = currentTime;
        }
      }

      await chrome.storage.local.set({ pagesVisited: pagesVisited });
      if (isTabClosing) {
        delete tabDetails[tabId]; // Remove tab info after updating
      }
    } catch (error) {
      console.log('[Error] updating tab time:', error);
    }
  }
}

async function resetDataIfNeeded() {
  const { lastReset, lastSync } = await chrome.storage.sync.get([
    'lastReset',
    'lastSync',
  ]);
  const now = new Date();
  const lastResetTime = lastReset ? new Date(lastReset.time) : new Date(0);
  const lastSyncTime = lastSync ? new Date(lastSync.time) : new Date(0);

  if (lastSyncTime > lastResetTime && now - lastResetTime > 86400000) {
    // 86400000 ms = 24 hours
    await chrome.storage.local.set({ pagesVisited: [] });
    console.log('Data has been reset.');
    await updateLastResetTime();
  } else if (lastSyncTime <= lastResetTime) {
    await sendDataToServer();
  }
}

async function initializeTracking() {
  await resetDataIfNeeded();
  await chrome.alarms.create('dailyReset', { periodInMinutes: 1440 });
  await chrome.alarms.create('sendData', { periodInMinutes: 60 });
  await chrome.alarms.create('checkDataReset', { periodInMinutes: 240 });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      isWindowFocused = false;
      await updateTabTime(activeTab, true);
      activeTab = null;
    } else {
      isWindowFocused = true;
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]) {
        await updateTabTime(activeTab);
        activeTab = tabs[0].id;
        startTime = new Date().getTime();
      }
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.status === "complete" && tab && tab.url && !urlIsExcluded(tab.url)) {
      storeTabDetails(activeInfo.tabId, tab.url);
    }
    await updateTabTime(activeTab);
    activeTab = activeInfo.tabId;
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !urlIsExcluded(tab.url)) {
      if (!tabDetails[tabId] || !tabDetails[tabId].scriptInjected) {
        storeTabDetails(tabId, tab.url, true);
        injectContentScript(tabId);
      }
    }
    if (tabId === activeTab) {
      await updateTabTime(activeTab);
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log(removeInfo);
    await updateTabTime(tabId, true);
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'sendData') {
      console.log('Sending data to server.......');
      await sendDataToServer();
    }
    if (alarm.name === 'dailyReset') {
      await chrome.storage.local.set({ pagesVisited: [] });
    }
    if (alarm.name === 'checkDataReset') {
      await resetDataIfNeeded();
    }
  });
}

async function checkAuthentication() {
  try {
    const { token, grantedScopes } = await chrome.identity.getAuthToken({
      interactive: true,
    });
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return null;
    }

    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`
    );
    const userInfo = await response.json();

    const { user_email } = await chrome.storage.sync.get('user_email');
    if (user_email !== userInfo.email) {
      await chrome.storage.sync.set({ user_email: userInfo.email });
      // Initialize tracking if user_email has changed
      initializeTracking();
    }

    return userInfo;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

(async () => {
  const userInfo = await checkAuthentication();
  if (userInfo) {
    initializeTracking();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkAuth') {
      checkAuthentication().then((userInfo) => {
        sendResponse({ isAuthenticated: userInfo });
      });
      return true;
    }

    if (message.action === 'start_tracking') {
      initializeTracking();
    }
  });
})();

