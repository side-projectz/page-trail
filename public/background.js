let tabsTrack = {};
let pageList = [];

const exclusionRules = {
    urlPatterns: ['chrome://', 'about:', 'chrome-extension://'],
    domains: [],
};

function urlIsExcluded(url) {
    return url === '' ||
           exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
           exclusionRules.domains.some((domain) => new URL(url).hostname.includes(domain));
}

function getMainDomain(url) {
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const parts = hostname.split('.').reverse();
        return parts.length > 2 && (parts[1].length === 2 || ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))
               ? parts[2] + '.' + parts[1] + '.' + parts[0]
               : parts[1] + '.' + parts[0];
    } catch (error) {
        console.error('Invalid URL:', error);
        return '';
    }
}

function saveData() {
    chrome.storage.local.set({ pageList }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving page list:', chrome.runtime.lastError.message);
        }
    });
}

function loadPageList() {
    chrome.storage.local.get(['pageList'], (result) => {
        if (result.pageList) {
            pageList = result.pageList;
        }
    });
}

async function sendDataToServer() {
    // Implement your data synchronization logic here
    console.log('Data synchronized to the server.');
    saveData();
}

function resetData() {
    chrome.storage.local.get(['lastResetDate'], (result) => {
        let lastResetDate = result.lastResetDate;
        let today = new Date().toDateString();

        if (lastResetDate !== today) {
            pageList = [];
            chrome.storage.local.set({ pageList, lastResetDate: today }, () => {
                console.log('Data has been reset.');
            });
        }
    });
}

function authenticateUser(callback) {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            callback(null);
            return;
        }
        fetch(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`)
            .then((response) => response.json())
            .then((userInfo) => {
                callback(userInfo);
                chrome.storage.local.set({ user_email: userInfo.email });
            })
            .catch((error) => {
                console.error('Authentication error:', error);
                callback(null);
            });
    });
}

function updateTabDetails(tab, eventContext) {
    const { windowId, id, url } = tab;
    const existingPageIndex = pageList.findIndex(page => page.url === url);

    let tabDetails;
    if (existingPageIndex > -1) {
        tabDetails = pageList[existingPageIndex];
        tabDetails.lastVisited = new Date().toISOString();
    } else {
        tabDetails = {
            windowId,
            tabId: id,
            page: url,
            domain: getMainDomain(url),
            timeSpent: 0,
            lastVisited: new Date().toISOString(),
            meta: null
        };
        pageList.push(tabDetails);
    }

    if (eventContext === 'created' || eventContext === 'updated') {
        chrome.tabs.sendMessage(id, { action: 'getMeta' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`Error fetching meta for tabId ${id}:`, chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                tabDetails.meta = response;
            }
            saveData();
        });
    } else {
        saveData();
    }
}

function initializeAlarms() {
    chrome.alarms.create('syncData', { periodInMinutes: 120 });
    let now = new Date();
    let nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
    let delayInMinutes = Math.round((nextMidnight.getTime() - now.getTime()) / 60000);
    chrome.alarms.create('dailyReset', { delayInMinutes, periodInMinutes: 1440 });
}

function aggregateDataToPageList(tabId) {
    let trackedTab = tabsTrack[tabId];
    if (trackedTab) {
        let pageIndex = pageList.findIndex(page => page.url === trackedTab.url);
        if (pageIndex > -1) {
            let elapsedTime = new Date().getTime() - trackedTab.lastVisited;
            pageList[pageIndex].timeSpent += isNaN(elapsedTime) ? 0 : elapsedTime;
        } else {
            pageList.push({
                url: trackedTab.url,
                domain: getMainDomain(trackedTab.url),
                timeSpent: trackedTab.timeSpent,
                lastVisited: new Date().toISOString()
            });
        }
        saveData();
    }
}

chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
        if (tab.status === 'complete' && !urlIsExcluded(tab.url)) {
            const domain = getMainDomain(tab.url);
            if (domain) {
                pageList[domain] = {
                    url: tab.url,
                    domain,
                    meta: { title: tab.title },
                    timeSpent: 0,
                    lastVisited: new Date().toISOString(),
                    enteredTimeStamp: new Date().getTime()
                };
                tabsTrack[tab.id] = { url: tab.url, isActive: false };
            }
        }
    });
});

chrome.tabs.onCreated.addListener((tab) => {
    if (!urlIsExcluded(tab.url)) {
        updateTabDetails(tab, 'created');
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !urlIsExcluded(tab.url)) {
        if (tabsTrack[tabId]) {
            let now = new Date().getTime();
            tabsTrack[tabId].timeSpent += now - tabsTrack[tabId].lastVisited;
            aggregateDataToPageList(tabId);
        }
        tabsTrack[tabId] = { url: tab.url, lastVisited: new Date().getTime(), timeSpent: 0 };
    }
});

chrome.tabs.onRemoved.addListener(tabId => {
    if (tabsTrack[tabId]) {
        aggregateDataToPageList(tabId);
        delete tabsTrack[tabId];
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, tab => {
        if (tab.url && !urlIsExcluded(tab.url)) {
            let now = new Date().getTime();
            if (tabsTrack[tab.id]) {
                let elapsedTime = now - tabsTrack[tab.id].lastVisited;
                tabsTrack[tab.id].timeSpent += isNaN(elapsedTime) ? 0 : elapsedTime;
            } else {
                tabsTrack[tab.id] = { url: tab.url, lastVisited: now, timeSpent: 0 };
            }
        }
    });
});

chrome.windows.onFocusChanged.addListener(windowId => {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
        const tab = tabs[0];
        if (tab && !urlIsExcluded(tab.url)) {
            const trackedTab = tabsTrack[tab.id];
            if (trackedTab) {
                trackedTab.lastVisited = new Date().toISOString();
                saveData();
            }
        }
    });
});

chrome.runtime.onStartup.addListener(() => {
    loadPageList();
    initializeAlarms();
});

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms();
    }
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'syncData') {
        sendDataToServer();
    } else if (alarm.name === 'resetData') {
        sendDataToServer().then(() => {
            resetData();
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkAuth') {
        authenticateUser(userInfo => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo });
        });
        return true;
    }
});

initializeAlarms();
loadPageList();
