let activeTab = null;
let startTime = new Date().getTime();
let isWindowFocused = true;
let lastActiveTime = {};

// const pagesVisited = [
//   {
//     domainName: 'google.com',
//     pages: [
//       {
//         page: "https://www.google.com",
//         timeSpent: 0
//       }
//     ]
//   }
// ]

const exclusionRules = {
  urlPatterns: ['chrome://', 'about:'],
  domains: []
};

function urlIsExcluded(url) {
  return exclusionRules.urlPatterns.some(pattern => url.startsWith(pattern)) ||
         exclusionRules.domains.some(domain => new URL(url).hostname.includes(domain));
}

function getMainDomain(url) {
  try {
    const parsedUrl = new URL(url);

    // Extracting the hostname and the main domain name
    const hostname = parsedUrl.hostname;
    const parts = hostname.split('.').reverse();
    let mainDomain;
    if (parts.length > 2 && (parts[1].length === 2 || ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(parts[1]))) {
      mainDomain = parts[2] + '.' + parts[1] + '.' + parts[0];
    } else {
      mainDomain = parts[1] + '.' + parts[0];
    }

    // Extracting query parameters
    const queryParams = {};
    parsedUrl.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Extracting other useful information
    const protocol = parsedUrl.protocol;
    const pathname = parsedUrl.pathname;
    const search = parsedUrl.search;
    const hash = parsedUrl.hash;

    return {
      mainDomain,
      hostname,
      protocol,
      pathname,
      search,
      hash,
      queryParams
    };
  } catch (error) {
    console.error("Invalid URL:", error);
    return null;
  }
}

function updateTabTime(tabId) {
  if (tabId !== null && isWindowFocused) {
    let currentTime = new Date().getTime();
    let duration = currentTime - startTime;

    chrome.tabs.get(tabId, function(tab) {

      console.log(tabId);
      console.log(tab);

      if (chrome.runtime.lastError || !tab || !tab.url || urlIsExcluded(tab.url)) {
        console.error("Error retrieving tab: ", chrome.runtime.lastError);
        return;
      }

      const domainData = getMainDomain(tab.url);
      if (!domainData) {
        console.error("Invalid domain data for URL: ", tab.url);
        return;
      }

      chrome.storage.local.get(['pagesVisited'], function(result) {
        let pagesVisited = result.pagesVisited || [];
        let domainIndex = pagesVisited.findIndex(item => item.domainName === domainData.mainDomain);

        if (domainIndex === -1) {
          pagesVisited.push({ 
            domainName: domainData.mainDomain,
            pages: [{ page: tab.url, timeSpent: duration }]
          });
        } else {
          let pageIndex = pagesVisited[domainIndex].pages.findIndex(page => page.page === tab.url);
          if (pageIndex === -1) {
            pagesVisited[domainIndex].pages.push({ page: tab.url, timeSpent: duration });
          } else {
            pagesVisited[domainIndex].pages[pageIndex].timeSpent += duration;
          }
        }

        chrome.storage.local.set({ 'pagesVisited': pagesVisited });
      });
    });
  }
}

chrome.windows.onFocusChanged.addListener(function (windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isWindowFocused = false;
    updateTabTime(activeTab);
    activeTab = null;
  } else {
    isWindowFocused = true;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        updateTabTime(activeTab);
        activeTab = tabs[0].id;
        startTime = new Date().getTime();
      }
    });
  }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  updateTabTime(activeTab);
  activeTab = activeInfo.tabId;
  startTime = new Date().getTime();
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {

  console.log("onUpdate", changeInfo);

  if (changeInfo.status === 'complete' && tabId === activeTab) {
    updateTabTime(activeTab);
    startTime = new Date().getTime();
  }
});