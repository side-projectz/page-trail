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
    return url === '' ||
        exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
        exclusionRules.domains.some((domain) => new URL(url).hostname.includes(domain));
}

export function getMainDomain(url: string) {
    log.debug('Getting main domain for:', url);
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const parts = hostname.split('.').reverse();
        return parts.length > 2 && (parts[1].length === 2 || ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))
            ? parts[2] + '.' + parts[1] + '.' + parts[0]
            : parts[1] + '.' + parts[0];
    } catch (error) {
        log.error('[error] Invalid URL:', error);
        return '';
    }
}

export function storeData(removedPages: Domain[]) {

    log.debug('Storing data:', removedPages);
    chrome.storage.local.get(['pageList'], async (result) => {
        if (chrome.runtime.lastError) {
            log.error('Error storing data:', chrome.runtime.lastError.message);
        } else {

            const pageList: Domain[] = result.pageList || [];

            const mergedData = customDeepMerger(pageList, removedPages);

            log.debug('Merged data:', mergedData);

            chrome.storage.local.set({ pageList: mergedData }).then(() => {
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
            .then((userInfo) => {
                callback(userInfo);
                chrome.storage.local.set({ user_email: userInfo.email });
                log.debug('User authenticated:', userInfo);
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
        const mm = String(today.getMonth()).padStart(2, '0');
        const yyyy = today.getFullYear();
        const date = `${dd}-${mm}-${yyyy}`;

        const { user_email } = await chrome.storage.local.get(['user_email']);
        const { pageList } = await chrome.storage.local.get(['pageList']);

        const requestBody = {
            email: user_email.email,
            data: pageList,
            date,
        }

        log.debug('Sending data to server:', requestBody);

        const response = await fetch(`https://page-trail-dashboard.vercel.app/api/extension`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        })

        log.debug('Data sent successfully:', await response.json());
        // await updateLastSyncTime();

        // Implement your data synchronization logic here
        log.debug('Data synchronized to the server.');
        // saveData();
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
        if(!tab.url) {
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
                lastVisited: new Date().getTime()
            }
            existingDomain.pages.push(page);
        } else {
            const page = {
                openedAt: tab.openedAt,
                page: tab.url || '',
                timeSpent: tab.timer.getTimeValues().seconds,
                domain: domainKey,
                meta: {
                    title: '',
                    description: '',
                },
                lastVisited: new Date().getTime()
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