// import Timer from "easytimer.js";

function extractPageMetadata() {
  const metaTags = document.getElementsByTagName('meta');
  const metaData: {
    title: string,
    description: string,
    tags: string[]
  } = {
    title: document.title,
    description: '',
    tags: []
  };

  for (let meta of Array.from(metaTags)) {
    // Extract description
    if (meta.name.toLowerCase() === 'description') {
      metaData.description = meta.content;
    }

    // Extract specific tags (like keywords)
    if (meta.name.toLowerCase() === 'keywords' || meta.name.toLowerCase() === 'tags') {
      metaData.tags = meta.content.split(',').map((tag) => tag.trim());
    }
  }

  return metaData;
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  if (request.action === "checkScript") {
    sendResponse({ scriptActive: true });
    return true;
  }

  if (request.action === "getMeta") {
    const meta = extractPageMetadata();
    sendResponse({ title: document.title, url: window.location.href, meta });
    return true;
  }

  return false;
});

// const div = document.createElement('div');
// div.classList.add('page-trail-timer');
// div.style.position = 'fixed';
// div.style.bottom = '0';
// div.style.right = '0';
// div.style.backgroundColor = 'white';
// div.style.padding = '10px';
// div.style.border = '1px solid #ccc';
// div.style.borderRadius = '5px';
// div.style.zIndex = '99';

// document.body.appendChild(div);

// chrome.storage.local.get(['pageList'], function (result) {
//   const pageList = result.pageList || [];
//   const hostname = window.location.hostname;

//   const domainMatchIndex = pageList.findIndex((item: any) => item.domain === hostname);
//   const domain = domainMatchIndex > -1 ? pageList[domainMatchIndex] : null;

//   const page = domain ? domain.pages.find((item: any) => item.page === window.location.href) : null;
//   const pageTimer = page ? page.timeSpent : 0;

//   const timer = new Timer({ precision: 'seconds' });
//   timer.start();

//   timer.addEventListener('secondsUpdated', function (e) {
//     document.querySelector('.page-trail-timer')!.innerHTML = timer.getTimeValues().toString();
//   });
// });
