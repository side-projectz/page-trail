// background.js

const pageList = {};
const tabsTrack = {};

const exclusionRules = {
    urlPatterns: ['chrome://', 'about:', "chrome-extension://"],
    domains: [],
};


function savePageList() {
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
    // ...
    console.log('Data synchronized to the server.');
    savePageList(); // Ensure to save any changes made during synchronization
}

function resetData() {
    chrome.storage.local.get(['lastResetDate'], (result) => {
        let lastResetDate = result.lastResetDate;
        let today = new Date().toDateString();

        // Only reset if we haven't reset today already
        if (lastResetDate !== today) {
            pageList = {};
            chrome.storage.local.set({ pageList, lastResetDate: today }, () => {
                console.log('Data has been reset.');
            });
        }
    });

}

function urlIsExcluded(url) {
    return (
        exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
        exclusionRules.domains.some((domain) => new URL(url).hostname.includes(domain))
    );
}

function getMainDomain(url) {
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const parts = hostname.split('.').reverse();
        let mainDomain = parts.length > 2 && (parts[1].length === 2 || ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))
            ? parts[2] + '.' + parts[1] + '.' + parts[0]
            : parts[1] + '.' + parts[0];
        return mainDomain;
    } catch (error) {
        console.error('Invalid URL:', error);
        return '';
    }
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
    const tabDetails = {
        windowId,
        tabId: id,
        page: url,
        domain: getMainDomain(url),
        timeSpent: 0,
        lastVisited: new Date().toISOString(),
        meta: null // Placeholder for meta details
    };

    // Only fetch and send the getMeta message if the tab was created or updated
    if (eventContext === 'created' || eventContext === 'updated') {
        chrome.tabs.sendMessage(id, { action: 'getMeta' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`Error fetching meta for tabId ${id}:`, chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                tabDetails.meta = response;
            }
            allTabs[id] = tabDetails;
        });
    } else {
        allTabs[id] = tabDetails;
    }
}

function initializeAlarms() {
    // Create an alarm for data synchronization every 2 hours
    chrome.alarms.create('syncData', { periodInMinutes: 120 });


    let now = new Date();
    let nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0); // Set to 00:01 to ensure it's just past midnight
    let delayInMinutes = Math.round((nextMidnight.getTime() - now.getTime()) / (1000 * 60)); // Convert delay to minutes

    chrome.alarms.create('dailyReset', { delayInMinutes, periodInMinutes: 1440 }); // Schedule the first reset just after midnight, and repeat daily

}


chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
        if (tab.status === 'complete' && !urlIsExcluded(tab.url)) {
            const domain = getMainDomain(tab.url);
            if (domain) {
                pageList[domain] = {
                    url: tab.url,
                    domain,
                    meta: {
                        title: tab.title,
                    },
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
    if (changeInfo.status === 'complete' && !urlIsExcluded(tab.url)) {
        updateTabDetails(tab, 'updated');
    }
    savePageList();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const tabTrack = tabsTrack[tabId];
    if (tabTrack) {
        const page = pageList[tabTrack.url];
        if (page) {
            // Calculate time spent before removal
            page.timeSpent += new Date().getTime() - page.enteredTimeStamp;
            // Optionally send page timeSpent data to your server or storage
        }
        delete tabsTrack[tabId];
    }
    savePageList();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    const tab = allTabs[activeInfo.tabId];
    if (tab) {
        tab.lastVisited = new Date().toISOString();
    }
    savePageList();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
        const tab = tabs[0];
        if (tab && !urlIsExcluded(tab.url)) {
            const trackedTab = allTabs[tab.id];
            if (trackedTab) {
                trackedTab.lastVisited = new Date().toISOString();
            }
        }
        savePageList();
    });
});

// When the browser starts up, reload the pageList
chrome.runtime.onStartup.addListener(() => {
    loadPageList();
    initializeAlarms();
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms();
        // Other installation or update related logic
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'syncData') {
        // Call your data synchronization function
        sendDataToServer();
    } else if (alarm.name === 'resetData') {
        // Reset the data
        sendDataToServer().then(() => {
            resetData();
        });
    }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'authenticate') {
        authenticateUser((userInfo) => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo });
        });
        return true; // Indicate that the response is sent asynchronously
    }
});


// Call this function after loading the pageList and authenticating the user
initializeAlarms();
// Call this function when the extension is loaded/reloaded
loadPageList();
