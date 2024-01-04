import { Timer } from "easytimer.js"
import { urlIsExcluded, authenticateUser, getMainDomain, storeData, sendDataToServer, loadPageList } from "./bgUtilities";
import { Tabs } from "./chrome.interface";
import log from "loglevel";
log.setLevel("error");


const activeTab: Tabs = {
    id: 0,
    url: undefined,
    timer: new Timer(),
    isActive: false,
    openedAt: 0,
    domain: undefined,
    meta: {
        title: '',
        description: '',
    }
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    log.debug('Query: runs on startup - tabs', tabs)
    if (tabs.length === 0 || !tabs[0].id) {
        return
    }

    if (tabs[0].status === "complete") {

        if (!urlIsExcluded(tabs[0].url || '')) {

            const domain = getMainDomain(tabs[0].url!);
            if (tabs[0].id && activeTab.id !== tabs[0].id) {
                log.debug('setting active tab on startup')

                activeTab.id = tabs[0].id;
                activeTab.url = tabs[0].url;
                activeTab.timer.start();
                activeTab.isActive = true;
                activeTab.openedAt = new Date().getTime();
                activeTab.domain = domain;
                activeTab.meta = {
                    title: tabs[0].title || '',
                    description: '',
                }
            }
        }

    }
})

chrome.tabs.onActivated.addListener((tab) => {
    const { tabId, windowId } = tab;

    if (activeTab.url) {

        const page = {
            openedAt: activeTab.openedAt,
            page: activeTab.url,
            timeSpent: activeTab.timer.getTimeValues().seconds,
            domain: activeTab.domain || getMainDomain(activeTab.url),
            meta: {
                title: '',
                description: '',
            },
            lastVisited: new Date().getTime()
        }

        activeTab.timer.stop();
        activeTab.isActive = false;

        log.warn("storing Data:", {
            domain: page.domain,
            pages: [page]
        })


        storeData([{
            domain: page.domain,
            pages: [page]
        }]);


    }


    if (tabId && windowId) {
        chrome.tabs.get(tabId, (tab) => {
            try {

                if (tab.status === 'complete' && !urlIsExcluded(tab.url || '')) {
                    const domain = getMainDomain(tab.url!);

                    activeTab.id = tabId;
                    activeTab.url = tab.url;
                    activeTab.timer.start();
                    activeTab.isActive = true;
                    activeTab.openedAt = new Date().getTime();
                    activeTab.domain = domain;
                    activeTab.meta = {
                        title: tab.title || '',
                        description: '',
                    }

                }
            } catch (error) {
                log.error('Error onActivated', error)
            }
        })
    }
});


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    try {
        if (changeInfo.status === 'loading') {
            if (activeTab.url) {

                const page = {
                    openedAt: activeTab.openedAt,
                    page: activeTab.url,
                    timeSpent: activeTab.timer.getTimeValues().seconds,
                    domain: activeTab.domain || getMainDomain(activeTab.url),
                    meta: {
                        title: '',
                        description: '',
                    },
                    lastVisited: new Date().getTime()
                }

                activeTab.timer.stop();
                activeTab.isActive = false;

                log.warn("storing Data:", {
                    domain: page.domain,
                    pages: [page]
                })

                storeData([{
                    domain: page.domain,
                    pages: [page]
                }]);
            }

            // resetting active tab
            activeTab.id = 0;
            activeTab.url = undefined;
            activeTab.timer.stop();
            activeTab.isActive = false;
            activeTab.openedAt = 0;
            activeTab.domain = undefined;
            activeTab.meta = {
                title: '',
                description: '',
            }
        }

        if (changeInfo.status === "complete") {

            if (tab.url && !urlIsExcluded(tab.url)) {
                const domain = getMainDomain(tab.url);
                log.debug('onUpdated: when switched to a new tab')
                activeTab.id = tabId;
                activeTab.url = tab.url;
                activeTab.timer.start();
                activeTab.isActive = true;
                activeTab.openedAt = new Date().getTime();
                activeTab.domain = domain;
                activeTab.meta = {
                    title: tab.title || '',
                    description: '',
                }
            }

        }

    } catch (e) {
        log.error('Error onUpdated', e)
    }

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

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    log.debug("[L1] onFocusChanged", windowId)
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // log.debug("window unfocused")
        activeTab.timer.pause();
        activeTab.isActive = false;

        log.debug("previously activeTab", activeTab, { timeSpent: activeTab.timer.getTimeValues().seconds })

        if (activeTab.url && !urlIsExcluded(activeTab.url)) {

            const page = {
                openedAt: activeTab.openedAt,
                page: activeTab.url,
                timeSpent: activeTab.timer.getTimeValues().seconds,
                domain: activeTab.domain || getMainDomain(activeTab.url),
                meta: {
                    title: '',
                    description: '',
                },
                lastVisited: new Date().getTime()
            }
            activeTab.timer.stop();
            activeTab.isActive = false;

            // storing data 
            log.warn("storing Data: when window is unfocused ", {
                domain: page.domain,
                pages: [page]
            })

            storeData([{
                domain: page.domain,
                pages: [page]
            }]);
        }

        // resetting active tab
        activeTab.id = 0;
        activeTab.url = undefined;
        activeTab.timer.stop();
        activeTab.isActive = false;
        activeTab.openedAt = 0;
        activeTab.domain = undefined;
        activeTab.meta = {
            title: '',
            description: '',
        }


    } else {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        log.debug("onFocusChanged query", tabs)

        if (tabs[0].status === "complete") {
            if (tabs[0].url && tabs[0].url !== '') {
                if (!urlIsExcluded(tabs[0].url)) {

                    const domain = getMainDomain(tabs[0].url);
                    if (tabs[0].id && activeTab.id !== tabs[0].id) {
                        log.debug('onFocusChanged: when switched to a new tab')

                        activeTab.id = tabs[0].id;
                        activeTab.url = tabs[0].url;
                        activeTab.timer.start();
                        activeTab.isActive = true;
                        activeTab.openedAt = new Date().getTime();
                        activeTab.domain = domain;
                        activeTab.meta = {
                            title: tabs[0].title || '',
                            description: '',
                        }
                    }

                }
            }
        }
    }
})

chrome.alarms.onAlarm.addListener((alarm) => {
    log.debug("[L1] onAlarm", alarm)
    if (alarm.name === "syncData") {
        sendDataToServer();
        return;
    }

    if (alarm.name === "dailyReset") {
        // chrome.storage.local.clear();
        return;
    }
})

chrome.runtime.onStartup.addListener(() => {
    log.debug("[L1] onStartup")
    loadPageList()
})

chrome.runtime.onInstalled.addListener(details => {
    log.debug("[L1] onInstalled", details)
    if (details.reason === "install" || details.reason === "update") {
        initializeAlarms()
    }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log.debug("[L1] onMessage", request, sender)
    if (request.action === "checkAuth") {
        authenticateUser((userInfo: any) => {
            sendResponse({ isAuthenticated: !!userInfo, user: userInfo })
        })
        return true
    }

    if (request.action === "syncData") {
        sendDataToServer()
            .then(() => {
                log.debug("syncData: success");
                sendResponse({ success: true })
            });
        return true;
    }
    // Other message handling logic here...
})