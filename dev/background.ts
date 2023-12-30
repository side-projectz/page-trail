import { Timer } from "easytimer.js";
import {
    authenticateUser,
    getMainDomain,
    loadPageList,
    sendDataToServer,
    storeData,
    transformTabsListForStorage,
    urlIsExcluded
} from "./bgUtilities";
import log from "loglevel";
import { Tabs } from "./chrome.interface";



log.setLevel("trace");
let tabsList: { [key: number]: Tabs } = {};
let activeTab: Tabs | undefined = undefined;


chrome.tabs.query({}, tabs => {
    log.debug("[L1] query", tabs)
    tabs.forEach(tab => {
        const { active, id, status, url } = tab

        if (!id || !url) {
            return
        }

        if (!urlIsExcluded(url)) {
            const obj: Tabs = {
                id,
                url,
                isActive: active,
                timer: new Timer({
                    startValues: { seconds: 0 },
                    precision: "seconds",
                    countdown: false
                }),
                openedAt: new Date().getTime()
            }

            if (status === "complete" && url && url !== "") {
                obj.domain = getMainDomain(url)
            }

            if (active) {
                obj.isActive = true
                obj.timer.start()
            }

            tabsList[id] = obj
            activeTab = obj
        }
    })
})

chrome.tabs.onCreated.addListener(tab => {
    log.debug("[L1] onCreated", tab)
    const { id, url } = tab

    if (!id || !url) {
        return
    }

    if (!urlIsExcluded(url)) {
        const obj: Tabs = {
            id,
            url,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            }),
            openedAt: new Date().getTime()
        }

        tabsList[id] = obj
    }
})

chrome.tabs.onActivated.addListener(activeInfo => {
    log.debug("[L1] onActivated", activeInfo)
    const { tabId } = activeInfo

    if (!tabsList[tabId]) {
        const obj: Tabs = {
            id: tabId,
            url: undefined,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            }),
            openedAt: new Date().getTime()
        }
        tabsList[tabId] = obj
    }

    const tab = tabsList[tabId]

    if (tab) {
        tab.isActive = true
        tab.timer.start()
        activeTab = tab
        log.debug("current activeTab", activeTab);
        log.debug(activeTab.url, tab.timer.getTimeValues().seconds)
    }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    log.debug("[L1] onUpdated - tabId", tabId)
    log.debug("[L1] onUpdated - changeInfo", JSON.stringify(changeInfo, null, 2))
    log.debug("[L1] onUpdated - tab", JSON.stringify(tab, null, 2))

    const { status } = changeInfo
    // Initialize or update tab object in tabsList
    if (!tabsList[tabId]) {
        tabsList[tabId] = {
            id: tabId,
            url: tab.url || undefined,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            }),
            openedAt: new Date().getTime()
        }
    }

    const updatedTab = tabsList[tabId];
    log.debug("old tab details", JSON.stringify(updatedTab, null, 2))

    if (
        changeInfo.status === 'loading' &&
        tab.status === 'loading' &&
        updatedTab.url !== tab.url
    ) {
        log.debug("url Changed", updatedTab.url, tab.url)
        log.debug("url Changed - [" + tabId + "]", JSON.stringify(updatedTab)) ;
        log.debug("url Changed - [timeSpent]", updatedTab.timer.getTimeValues().seconds) ;

        storeData(transformTabsListForStorage({
            [tabId]: updatedTab
        }))
        updatedTab.timer.stop();
    }


    updatedTab.url = tab.url || updatedTab.url


    if (status === "completed" && tab.url && tab.url !== "") {
        // if(activeTab?.id ===tabId ){
        // }

        if (activeTab && activeTab.url !== tab.url) {
            log.debug("url changed", activeTab.url, tab.url)
            activeTab.url = tab.url
        }

    }

    // Check if tab has finished loading
    if (status === "complete" && tab.url && tab.url !== "") {
        updatedTab.domain = getMainDomain(tab.url)

        // Handle based on whether tab is active or in background
        if (tab.active) {
            // Active tab completed loading
            if (activeTab && activeTab.id !== tabId) {
                log.debug("previously activeTab", activeTab);
                tabsList[activeTab.id].isActive = false
                tabsList[activeTab.id].timer.pause()
            }
            updatedTab.isActive = true
            updatedTab.timer.start()
            activeTab = updatedTab
            log.debug("current activeTab", activeTab)
        } else {
            // Background tab completed loading
            updatedTab.isActive = false
            updatedTab.timer.pause()
        }
    }

    // Update the tabsList
    if (status === 'complete')
        tabsList[tabId] = updatedTab;

    log.debug("updated tab details", JSON.stringify(updatedTab, null, 2));
    log.debug(" onUpdated End ============================================");
})



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log.debug("[L1] onMessage", request, sender)
    if (request.action === "checkAuth") {
        authenticateUser((userInfo: any) => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo })
        })
        return true
    }
    // Other message handling logic here...
})

chrome.runtime.onInstalled.addListener(details => {
    log.debug("[L1] onInstalled", details)
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms()
    }
})

chrome.runtime.onStartup.addListener(() => {
    log.debug("[L1] onStartup")
    loadPageList()
})

chrome.alarms.onAlarm.addListener(alarm => {
    log.debug("[L1] onAlarm", alarm)
    if (alarm.name === "syncData") {
        sendDataToServer()
    }
})

chrome.tabs.onRemoved.addListener(tabId => {
    log.debug("[L1] onRemoved", tabId);

    if (!tabsList[tabId]) {
        return;
    }

    if (tabsList[tabId].isActive) {
        tabsList[tabId].timer.pause();
    }

    const domain = transformTabsListForStorage({
        [tabId]: tabsList[tabId]
    });

    // Store the updated data
    log.debug("[L2] Removed domain", domain);
    storeData(domain);
    // Remove the tab from tabsList
    delete tabsList[tabId];
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    // log.debug("[L1] onFocusChanged", windowId)
    if (windowId === chrome.windows.WINDOW_ID_NONE && activeTab) {
        // log.debug("window unfocused")
        tabsList[activeTab.id].isActive = false
        tabsList[activeTab.id].timer.pause()
        // log.debug("previously activeTab", activeTab)
    } else {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        // log.debug("onFocusChanged query", tabs)
        if (tabs.length === 0 || !tabs[0].id) {
            return
        }

        if (tabs.length && tabs[0]?.id in tabsList) {
            // log.debug("window focused")
            const tabId = tabs[0].id
            tabsList[tabId].isActive = true
            tabsList[tabId].timer.start()
            activeTab = tabsList[tabId]
            // log.debug("current activeTab", activeTab)
        }
    }
})

chrome.windows.onRemoved.addListener(windowId => {
    log.debug("[L1] onRemoved", windowId);
    chrome.tabs.query({ windowId }, tabs => {
        tabs.forEach(tab => {
            const { id } = tab;
            if (!id) {
                return;
            }

            if (!tabsList[id]) {
                return;
            }

            if (tabsList[id].isActive) {
                tabsList[id].timer.pause();
            }

            const domain = transformTabsListForStorage({
                [id]: tabsList[id]
            });

            log.debug("domain", domain);
            // Store the updated data
            storeData(domain);
            // Remove the tab from tabsList
            delete tabsList[id];
        });
    });
});

function initializeAlarms() {
    chrome.alarms.create("syncData", { periodInMinutes: 120 })
    let now = new Date()
    let nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        1,
        0
    )
    let delayInMinutes = Math.round(
        (nextMidnight.getTime() - now.getTime()) / 60000
    )
    chrome.alarms.create("dailyReset", { delayInMinutes, periodInMinutes: 1440 })
}

initializeAlarms()
loadPageList()
// setInterval(() => storeData(tabsList), 60000)