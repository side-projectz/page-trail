import { Timer } from "easytimer.js"
import { urlIsExcluded, getMainDomain } from "./bgUtilities";
import { Page, Tabs } from "./chrome.interface";
import log from "loglevel";

log.setLevel("trace");

let activeTab: Tabs = {} as Tabs;

(async () => {
    log.debug("[L1] background script loaded");

    activeTab = {
        id: 0,
        url: undefined,
        isActive: false,
        openedAt: 0,
        domain: undefined,
        meta: {
            title: '',
            description: '',
        },
        timer: new Timer(),
    }

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
    await chrome.alarms.create("dailyReset", { delayInMinutes, periodInMinutes: 1440 })


    chrome.runtime.onMessage.addListener(messageEventListener)
    chrome.alarms.onAlarm.addListener(alarmEventListener)
    chrome.runtime.onInstalled.addListener(onInstalled)
    chrome.runtime.onStartup.addListener(onStartup)
    chrome.tabs.onActivated.addListener(tabsOnActivated);
    chrome.tabs.onUpdated.addListener(tabsOnUpdated);
    chrome.windows.onFocusChanged.addListener(windowsOnFocusChanged);


})()

async function tabsOnActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    try {
        const { tabId, windowId } = activeInfo;

        if (activeTab.url) {
            const page: Page = {
                openedAt: activeTab.openedAt,
                page: activeTab.url,
                timeSpent: activeTab.timer.getTimeValues().seconds,
                domain: activeTab.domain || getMainDomain(activeTab.url),
                meta: {
                    title: '',
                    description: '',
                    url: activeTab.url,
                },
                lastVisited: new Date().getTime(),
                synced: false
            }
            activeTab.timer.stop();
            activeTab.isActive = false;
            log.info("storing Data:", {
                domain: page.domain,
                pages: [page]
            })
            await storeData(page);
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

    } catch (error) {
        log.error('Error onActivated', error)
    }
}

async function tabsOnUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
    try {
        if (changeInfo.status === 'loading') {
            if (activeTab.url) {

                const page: Page = {
                    openedAt: activeTab.openedAt,
                    page: activeTab.url,
                    timeSpent: activeTab.timer.getTimeValues().seconds,
                    domain: activeTab.domain || getMainDomain(activeTab.url),
                    meta: {
                        title: '',
                        description: '',
                        url: activeTab.url,
                    },
                    lastVisited: new Date().getTime(),
                    synced: false
                }

                activeTab.timer.stop();
                activeTab.isActive = false;

                log.info("storing Data:", {
                    domain: page.domain,
                    pages: [page]
                })

                await storeData(page);
            }

            // resetting active tab
            resetActiveTab();
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
    } catch (error) {
        log.error('Error onUpdated', error)
    }
}

async function windowsOnFocusChanged(windowId: number) {
    try {
        log.debug("[L1] onFocusChanged", windowId)
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
            // log.debug("window unfocused")
            activeTab.timer.pause();
            activeTab.isActive = false;

            log.debug("previously activeTab", activeTab, { timeSpent: activeTab.timer.getTimeValues().seconds })

            if (activeTab.url && !urlIsExcluded(activeTab.url)) {

                const page: Page = {
                    openedAt: activeTab.openedAt,
                    page: activeTab.url,
                    timeSpent: activeTab.timer.getTimeValues().seconds,
                    domain: activeTab.domain || getMainDomain(activeTab.url),
                    meta: {
                        title: '',
                        description: '',
                        url: activeTab.url,
                    },
                    lastVisited: new Date().getTime(),
                    synced: false
                }
                activeTab.timer.stop();
                activeTab.isActive = false;

                // storing data 
                log.info("storing Data: when window is unfocused ", {
                    domain: page.domain,
                    pages: [page]
                })

                await storeData(page);
            }

            // resetting active tab
            resetActiveTab();
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

    } catch (error) {
        log.error('Error onFocusChanged', error)
    }
}

async function onStartup() {
    log.debug("[onStartup]");

    log.debug('[onStartup][start] standardizing page list...');
    const { pageList, lastSynced } = await chrome.storage.local.get(['pageList', 'lastSynced'])
    if (pageList) {
        for (let page of pageList) {
            if (!page.timeSpent || isNaN(page.timeSpent)) {
                page.timeSpent = 0;  // Set a default value
            }
        }
    } else {
        await chrome.storage.local.set({ pageList: [] });
    }
    log.debug('[onStartup][end] standardizing page list... done');


    log.debug('[onStartup][start] syncing data...');
    const now = new Date().getTime();
    const lastSyncedDate = new Date(lastSynced || 0).getTime();
    if (!lastSynced || now - lastSyncedDate > 7200000) {
        console.log("syncing data on startup")
        // await sendData([]);
    }
    log.debug('[onStartup][end] syncing data... done');


    log.debug('[onStartup][start]] Query: runs on startup - tabsOnActivated')
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    log.trace('activeTab', tabs)
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
    log.debug('[onStartup][end] Query: runs on startup - tabsOnActivated')

}

async function onInstalled(details: chrome.runtime.InstalledDetails) {
    log.debug("[L1] onInstalled", details)
    if (details.reason === "install" || details.reason === "update") {

        if (details.reason === "update" && (details.previousVersion === "2.5.0" || details.previousVersion === "2.7.0")) {
            chrome.storage.local.clear();
            return true;
        }

    }
}

async function alarmEventListener(alarm: chrome.alarms.Alarm) {
    log.debug("[L1] alarmEventListener", alarm)
    if (alarm.name === "syncData") {
        // sendDataToServer();
        return;
    }

    if (alarm.name === "dailyReset") {
        chrome.storage.local.clear();
        return;
    }
}

async function messageEventListener(request: any, sender: chrome.runtime.MessageSender, sendResponse: any) {
    log.debug("[L1] messageEventListener", request, sender)

    if (request.action === "syncData") {
        // sendDataToServer()
        //     .then(() => {
        //         log.debug("syncData: success");
        //         sendResponse({ success: true })
        //     });
    }
    return true;
}

function resetActiveTab() {
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

async function sendData(visits: Page | Page[]) {
    try {
        const { user_email, pageList } = await chrome.storage.local.get(['user_email', 'pageList']);
        log.debug('[sendData] user_email', user_email);
        log.debug('[sendData] pageList', pageList);

        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        log.debug("[sendData] User's Time Zone:", userTimeZone);

        const requestBody = {
            email: user_email,
            date: new Date(),
            timeZone: userTimeZone,
            data: [visits].flat() satisfies Page[],
            version: chrome.runtime.getManifest().version,
        };

        log.debug('[sendData] Sending data to server:', requestBody);

        const URL = 'https://page-trail-dashboard.vercel.app/api/extension';

        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (data.status !== 200) {
            throw new Error(`[sendData] Server returned ${data.status} ${data.message}`);
        }

        log.debug('[sendData] Data sent successfully:', data);


        await chrome.storage.local.set({ pageList: pageList });
        await chrome.storage.local.set({ lastSynced: new Date().toISOString() });


    } catch (error) {
        log.error('[sendData] Error on sendData', error);
    }
}

async function storeData(data: Page) {
    try {
        log.debug('[storeData] Storing data:', data);

        const { pageList: result } = await chrome.storage.local.get(['pageList']);

        log.debug('[storeData] Existing data:', result);

        if (result === undefined) {
            log.debug('[storeData] No data found in storage. Creating new data...');
            await chrome.storage.local.set({ pageList: [] });
        }

        if (chrome.runtime.lastError) {
            log.error('[storeData] Error storing data:', chrome.runtime.lastError.message);
            return false;
        }

        await sendData(data);

        const pageList: Page[] = result || [];
        log.debug('[storeData] pageList', pageList);

        pageList.push(data);
        log.debug('[storeData] Merged data:', pageList);

        await chrome.storage.local.set({ pageList: pageList });
    } catch (e) {
        log.error('[storeData] Error storing data:', e);
    }
}
