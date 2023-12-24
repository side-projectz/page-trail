let activeTab = null;
let startTime = new Date().getTime();
let isWindowFocused = true;

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
      // await redisUtils.setDataInRedis(pagesVisited);

        const response = await fetch(`chrome-extension://fendjdlgfcjdgpldnljodnbeagjfbfad/api/redis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pagesVisited }),
        })

      console.log('Data sent successfully:', await response.json());
      await updateLastSyncTime();
    }
  } catch (error) {
    console.error('Error sending data:', error);
  }
}

async function updateTabTime(tabId, isTabClosing = false) {
  if (tabId !== null && (isWindowFocused || isTabClosing)) {
    let currentTime = new Date().getTime();
    let duration = currentTime - startTime;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || urlIsExcluded(tab.url)) return;

      const domainData = getMainDomain(tab.url);
      if (!domainData) return;

      const { pagesVisited } = await chrome.storage.local.get(['pagesVisited']);
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
      if (isTabClosing) activeTab = null;
    } catch (error) {
      console.error('Error updating tab time:', error);
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
    await updateTabTime(activeTab);
    activeTab = activeInfo.tabId;
    startTime = new Date().getTime();
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && tabId === activeTab) {
      await updateTabTime(activeTab);
      startTime = new Date().getTime();
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
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

(async () => {
  const { user_email } = await chrome.storage.sync.get('user_email');
  if (user_email) {
    // Start tracking actions
    initializeTracking();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start_tracking') {
      initializeTracking();
    }
  });
})();
