import { Timer } from "easytimer.js";
import {
    authenticateUser,
    getMainDomain,
    loadPageList,
    sendDataToServer,
    storeData,
    urlIsExcluded
} from "./bgUtilities";

const tabsList = {}
let activeTab = undefined;

chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
        const { active, id, status, url } = tab

        if (!id) {
            return
        }

        if (!urlIsExcluded(tab.url)) {
            const obj = {
                id,
                url,
                isActive: active,
                timer: new Timer({
                    startValues: { seconds: 0 },
                    precision: "seconds",
                    countdown: false
                })
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
    const { id, url } = tab

    if (!id) {
        return
    }

    if (!urlIsExcluded(tab.url)) {
        const obj = {
            id,
            url,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            })
        }

        tabsList[id] = obj
    }
})

chrome.tabs.onActivated.addListener(activeInfo => {
    const { tabId } = activeInfo

    if (!tabsList[tabId]) {
        const obj = {
            id: tabId,
            url: undefined,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            })
        }
        tabsList[tabId] = obj
    }

    const tab = tabsList[tabId]

    if (activeTab) {
        tabsList[activeTab.id].isActive = false
        tabsList[activeTab.id].timer.pause()
    }

    if (tab) {
        tab.isActive = true
        tab.timer.start()
        activeTab = tab
    }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const { url, status } = changeInfo

    // Initialize or update tab object in tabsList
    if (!tabsList[tabId]) {
        tabsList[tabId] = {
            id: tabId,
            url,
            isActive: false,
            timer: new Timer({
                startValues: { seconds: 0 },
                precision: "seconds",
                countdown: false
            })
        }
    }

    const updatedTab = tabsList[tabId]
    updatedTab.url = url || updatedTab.url

    // Check if tab has finished loading
    if (status === "complete"  && url && url !== "") {
        updatedTab.domain = getMainDomain(url)

        // Handle based on whether tab is active or in background
        if (tab.active) {
            // Active tab completed loading
            if (activeTab && activeTab.id !== tabId) {
                tabsList[activeTab.id].isActive = false
                tabsList[activeTab.id].timer.pause()
            }
            updatedTab.isActive = true
            updatedTab.timer.start()
            activeTab = updatedTab
        } else {
            // Background tab completed loading
            updatedTab.isActive = false
            updatedTab.timer.pause()
        }
    }

    // Update the tabsList
    tabsList[tabId] = updatedTab
})

initializeAlarms()
loadPageList()
setInterval(() =>storeData(tabsList), 60000)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkAuth") {
        authenticateUser(userInfo => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo })
        })
        return true
    }
    // Other message handling logic here...
})

chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId === chrome.windows.WINDOW_ID_NONE && activeTab) {
        tabsList[activeTab.id].isActive = false
        tabsList[activeTab.id].timer.pause()
    } else {
        chrome.tabs.query({ active: true, windowId }, tabs => {
            if (tabs.length === 0 || !tabs[0].id) {
                return
            }

            if (tabs.length && tabs[0]?.id in tabsList) {
                const tabId = tabs[0].id
                tabsList[tabId].isActive = true
                tabsList[tabId].timer.start()
                activeTab = tabsList[tabId]
            }
        })
    }
})

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms()
    }
})

chrome.runtime.onStartup.addListener(() => {
    loadPageList()
})

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "syncData") {
        sendDataToServer()
    }
})

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
