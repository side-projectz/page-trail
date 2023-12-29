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



log.setLevel("warn");
let tabsList: { [key: number]: Tabs } = {};
let activeTab: Tabs | undefined = undefined;


chrome.tabs.query({}, tabs => {
    log.trace("query", tabs)
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
    log.trace("onCreated", tab)
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
    log.trace("onActivated", activeInfo)
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

    if (activeTab) {
        tabsList[activeTab.id].isActive = false
        tabsList[activeTab.id].timer.pause()
        log.trace("previously activeTab", activeTab)
        log.debug(activeTab.url, activeTab.timer.getTimeValues().seconds)
    }

    if (tab) {
        tab.isActive = true
        tab.timer.start()
        activeTab = tab
        log.trace("current activeTab", activeTab);
        log.debug( activeTab.url,  tab.timer.getTimeValues().seconds)
    }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    log.trace("onUpdated", tabId, changeInfo, tab)
    const { url, status } = changeInfo

    // Initialize or update tab object in tabsList
    if (!tabsList[tabId]) {
        tabsList[tabId] = {
            id: tabId,
            url: url || undefined,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            }),
            openedAt: new Date().getTime()
        }
    }

    const updatedTab = tabsList[tabId]
    updatedTab.url = url || updatedTab.url

    // Check if tab has finished loading
    if (status === "complete" && url && url !== "") {
        updatedTab.domain = getMainDomain(url)

        // Handle based on whether tab is active or in background
        if (tab.active) {
            // Active tab completed loading
            if (activeTab && activeTab.id !== tabId) {
                log.trace("previously activeTab", activeTab);
                tabsList[activeTab.id].isActive = false
                tabsList[activeTab.id].timer.pause()
            }
            updatedTab.isActive = true
            updatedTab.timer.start()
            activeTab = updatedTab
            log.trace("current activeTab", activeTab)
        } else {
            // Background tab completed loading
            updatedTab.isActive = false
            updatedTab.timer.pause()
        }
    }

    // Update the tabsList
    tabsList[tabId] = updatedTab
})



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log.trace("onMessage", request, sender)
    if (request.action === "checkAuth") {
        authenticateUser((userInfo: any) => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo })
        })
        return true
    }
    // Other message handling logic here...
})

chrome.windows.onFocusChanged.addListener(windowId => {
    log.trace("onFocusChanged", windowId)
    if (windowId === chrome.windows.WINDOW_ID_NONE && activeTab) {
        log.trace("window unfocused")
        tabsList[activeTab.id].isActive = false
        tabsList[activeTab.id].timer.pause()
        log.trace("previously activeTab", activeTab)
    } else {
        chrome.tabs.query({ active: true, windowId }, tabs => {
            if (tabs.length === 0 || !tabs[0].id) {
                return
            }

            if (tabs.length && tabs[0]?.id in tabsList) {
                log.trace("window focused")
                const tabId = tabs[0].id
                tabsList[tabId].isActive = true
                tabsList[tabId].timer.start()
                activeTab = tabsList[tabId]
                log.trace("current activeTab", activeTab)
            }
        })
    }
})

chrome.runtime.onInstalled.addListener(details => {
    log.trace("onInstalled", details)
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms()
    }
})

chrome.runtime.onStartup.addListener(() => {
    log.trace("onStartup")
    loadPageList()
})

chrome.alarms.onAlarm.addListener(alarm => {
    log.trace("onAlarm", alarm)
    if (alarm.name === "syncData") {
        sendDataToServer()
    }
})

chrome.tabs.onRemoved.addListener(tabId => {
    log.trace("onRemoved", tabId);

    if (!tabsList[tabId]) {
        return;
    }

    if (tabsList[tabId].isActive) {
        tabsList[tabId].timer.stop();
    }

    const domain = transformTabsListForStorage({
        [tabId]: tabsList[tabId]
    });

    // Store the updated data
    storeData(domain);
    // Remove the tab from tabsList
    delete tabsList[tabId];
});

chrome.windows.onRemoved.addListener(windowId => {
    log.trace("onRemoved", windowId);
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
                tabsList[id].timer.stop();
            }

            const domain = transformTabsListForStorage({
                [id]: tabsList[id]
            });

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