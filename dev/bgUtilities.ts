import { Tabs, Domain, Page } from "./chrome.interface";
import log from 'loglevel';
import deepmerge from "deepmerge";

log.setLevel("warn");

const exclusionRules: {
    urlPatterns: string[];
    domains: string[];
} = {
    urlPatterns: ['chrome://', 'about:', 'chrome-extension://'],
    domains: [],
};

export function urlIsExcluded(url: string) {
    return url.trim() === '' ||
        exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
        exclusionRules.domains.some((domain) => new URL(url).hostname.includes(domain));
}

export function getMainDomain(url: string) {
    log.debug('Getting main domain for:', url);
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;

        // Check if the hostname is 'localhost' or an IP address
        if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
            return hostname;
        }

        // Split the hostname into parts
        const parts = hostname.split('.').reverse();

        // Identify main domain parts (top-level domain and second-level domain)
        const topLevelDomain = parts[0];
        let secondLevelDomain = parts[1];
        let mainDomain = secondLevelDomain + '.' + topLevelDomain;

        // Handle special cases like 'co.uk', 'co.in', etc.
        if (parts.length > 2 && ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(secondLevelDomain)) {
            mainDomain = parts[2] + '.' + mainDomain;
        }

        // Check for subdomains other than 'www'
        if (parts.length > 2 && hostname !== 'www.' + mainDomain) {
            return hostname; // return full domain with subdomain
        }

        // Return main domain (without subdomain)
        return mainDomain;
    } catch (error) {
        log.error('[error] Invalid URL:', error);
        return '';
    }
}


export function storeData(removedPages: Domain[]) {

    log.debug('Storing data:', removedPages);
    chrome.storage.local.get(['pageList'], async (result) => {

        if (result.pageList === undefined) {
            log.debug('No data found in storage. Creating new data...');
            await chrome.storage.local.set({ pageList: [] });
            return true;
        }

        if (chrome.runtime.lastError) {
            log.error('Error storing data:', chrome.runtime.lastError.message);
        } else {

            const pageList: Domain[] = result.pageList || [];

            const domainIndex = pageList.findIndex(item => item.domain === removedPages[0].domain);
            log.debug('domainIndex', domainIndex);

            if (domainIndex === -1) {
                log.debug('Domain not found. Creating new domain...');
                pageList.push(removedPages[0]);
                await chrome.storage.local.set({ pageList: pageList });
                return true;
            }

            pageList[domainIndex].pages = [...(pageList[domainIndex].pages || []), ...removedPages[0].pages];

            log.debug('Merged data:', pageList);

            chrome.storage.local.set({ pageList: pageList }).then(() => {
                log.info('Data stored successfully');
            }).catch((error) => {
                log.error('Error storing data:', error);
            })
            return true;
        }
    });

}

export function authenticateUser(callback: (userInfo: { email: string; name: string; picture: string } | null) => void) {
    log.debug('Authenticating user...');
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            log.error('Authentication error:', chrome.runtime.lastError.message);
            callback(null);
            return;
        }
        fetch(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`)
            .then((response) => response.json())
            .then(async (userInfo) => {
                await chrome.storage.local.set({ user_email: userInfo.email });
                log.debug('User authenticated:', userInfo);
                callback(userInfo);
            })
            .catch((error) => {
                log.error('Authentication error:', error);
                callback(null);
            });
    });
}

export async function sendDataToServer() {
    try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth()).padStart(2, '0') + 1;
        const yyyy = today.getFullYear();
        const date = `${dd}-${mm}-${yyyy}`;

        const { user_email } = await chrome.storage.local.get(['user_email']);
        const { pageList } = await chrome.storage.local.get(['pageList']);

        log.debug('user_email', user_email);
        log.debug('pageList', pageList);

        const unSyncedData = (pageList as Domain[] || []).map((domain: Domain) => {
            return {
                domain: domain.domain,
                pages: domain.pages.filter((page: Page) => (typeof page.synced === 'undefined' || !page.synced))
            }
        })
            .filter((domain: Domain) => domain.pages.length > 0);

        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log("User's Time Zone:", userTimeZone);

        const requestBody = {
            email: user_email,
            data: unSyncedData,
            date,
            timeZone: userTimeZone,
        }

        log.debug('Sending data to server:', requestBody);

        const URL = 'https://page-trail-dashboard.vercel.app/api/extension';
        // const URL = 'http://localhost:3000/api/extension';

        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        })

        log.debug('Data sent successfully:', await response.json());
        log.debug('Data synchronized to the server.');

        pageList.forEach((domain: Domain) => {
            domain.pages.forEach((page: Page) => {
                page.synced = true;
            })
        })

        await chrome.storage.local.set({ pageList: pageList });
        await chrome.storage.local.set({ lastSynced: new Date().toISOString() });
        log.debug('updated pageList after sync');

    } catch (error) {
        log.error('Error sending data to server:', error);
    }
}

export async function loadPageList() {
    log.debug('Loading page list...');
    const { pageList } = await chrome.storage.local.get(['pageList']);
    if (pageList) {
        for (let page of pageList) {
            if (!page.timeSpent || isNaN(page.timeSpent)) {
                page.timeSpent = 0;  // Set a default value
            }
        }
    }
    log.debug('Page list loaded:', pageList);
    return pageList || [];
}

export function transformTabsListForStorage(tabsList: { [key: number]: Tabs }): Domain[] {
    const transformedData: Domain[] = [];

    Object.values(tabsList).forEach((tab: Tabs) => {
        if (!tab.url) {
            return;
        }
        const domainKey = tab.domain || getMainDomain(tab.url);

        if (urlIsExcluded(tab.url || '')) {
            return;
        }

        const existingDomainIndex = transformedData.findIndex(item => item.domain === domainKey);

        if (existingDomainIndex > -1) {
            const existingDomain = transformedData[existingDomainIndex];
            const page: Page = {
                openedAt: tab.openedAt,
                page: tab.url || '',
                timeSpent: tab.timer.getTimeValues().seconds,
                domain: domainKey,
                meta: {
                    title: '',
                    description: '',
                },
                lastVisited: new Date().getTime(),
                synced: false
            }
            existingDomain.pages.push(page);
        } else {
            const page: Page = {
                openedAt: tab.openedAt,
                page: tab.url || '',
                timeSpent: tab.timer.getTimeValues().seconds,
                domain: domainKey,
                meta: {
                    title: '',
                    description: '',
                },
                lastVisited: new Date().getTime(),
                synced: false
            }
            const domain = {
                domain: domainKey,
                pages: [page]
            }
            transformedData.push(domain);
        }
    });

    return transformedData;
}

// Function to merge two arrays based on a unique key
function mergeByUniqueKey<T>(uniqueKey: keyof T, array1: T[], array2: T[]): T[] {
    const merged: T[] = [...array1];
    array2.forEach(item => {
        const existingItemIndex = merged.findIndex(mergedItem => mergedItem[uniqueKey] === item[uniqueKey]);
        if (existingItemIndex > -1) {
            merged[existingItemIndex] = deepmerge(merged[existingItemIndex], item) as T;
        } else {
            merged.push(item);
        }
    });
    return merged;
}

/**
 * This Login ADD the timeSpent from the existing timeSpent and the new timeSpent
 * and also updates the lastVisited to the latest time
 * 
 * @param destinationArray 
 * @param sourceArray 
 * @returns 
 */
const mergePages = (destinationArray: Page[], sourceArray: Page[]): Page[] => {
    return sourceArray.reduce((acc, sourceItem) => {
        const existingItemIndex = acc.findIndex(item => item.page === sourceItem.page);
        if (existingItemIndex > -1) {
            const existingItem = acc[existingItemIndex];

            if (sourceItem.openedAt > existingItem.lastVisited) {
                existingItem.timeSpent += sourceItem.timeSpent;
            }

            existingItem.lastVisited = Math.max(existingItem.lastVisited, sourceItem.lastVisited);
        } else {
            acc.push({ ...sourceItem });
        }
        return acc;
    }, [...destinationArray]);
};

/**
 * Custom merger function for the whole structure
 * 
 * @param x Original array
 * @param y New array to merge
 * @returns Merged array
 */
export const customDeepMerger = (x: Domain[], y: Domain[]): Domain[] => {
    const mergedDomains = mergeByUniqueKey('domain', x, y);

    // Apply custom merging for 'pages' in each domain
    return mergedDomains.map(domain => ({
        ...domain,
        pages: mergePages(domain.pages, y.find(yDomain => yDomain.domain === domain.domain)?.pages || [])
    }));
};