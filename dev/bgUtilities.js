export function urlIsExcluded(url) {
    return url === '' ||
        exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
        exclusionRules.domains.some((domain) => new URL(url).hostname.includes(domain));
}


const exclusionRules = {
    urlPatterns: ['chrome://', 'about:', 'chrome-extension://'],
    domains: [],
};

export function getMainDomain(url) {
    console.log('url:', url);
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const parts = hostname.split('.').reverse();
        return parts.length > 2 && (parts[1].length === 2 || ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))
            ? parts[2] + '.' + parts[1] + '.' + parts[0]
            : parts[1] + '.' + parts[0];
    } catch (error) {
        console.log('[error] Invalid URL:', error);
        return '';
    }
}

export function storeData(tabsList) {
    chrome.storage.local.set({ tabsList }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error storing data:', chrome.runtime.lastError.message);
        }
    });
}


export function authenticateUser(callback) {
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

export async function sendDataToServer() {
    try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth()).padStart(2, '0');
        const yyyy = today.getFullYear();
        const date = `${dd}-${mm}-${yyyy}`;

        const { user_email } = await chrome.storage.local.get(['user_email']);

        const requestBody = {
            email: user_email.email,
            data: pageList,
            date,
        }

        const response = await fetch(`https://page-trail-dashboard.vercel.app/api/extension`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, data: pagesVisited }),
        })
        console.log('Data sent successfully:', await response.json());

        await updateLastSyncTime();

        // Implement your data synchronization logic here
        console.log('Data synchronized to the server.');
        saveData();
    } catch (error) {

    }

}

export function loadPageList() {
    chrome.storage.local.get(['pageList'], (result) => {
        if (result.pageList) {
            pageList = result.pageList;
            for (let page of pageList) {
                if (!page.timeSpent || isNaN(page.timeSpent)) {
                    page.timeSpent = 0;  // Set a default value
                }
            }
        }
    });
}