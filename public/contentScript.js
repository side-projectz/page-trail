function extractMetaTags() {
  const metaTags = document.getElementsByTagName('meta');
  const metaData = [];

  for (let meta of metaTags) {

    if (!meta.name.includes("og:") || !meta.name.includes("twitter:")) {
      continue;
    }

    const attributes = {};
    for (let attr of meta.attributes) {
      attributes[attr.name] = attr.value;
    }
    metaData.push(attributes);
  }

  return metaData;
}


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("contentScript request", request);

  if (request.action === "checkScript") {
    sendResponse({ scriptActive: true });
  }

  if (request.action === "getMeta") {
    const meta = extractMetaTags();
    sendResponse({ title: document.title, url: window.location.href, meta });
  }
});
