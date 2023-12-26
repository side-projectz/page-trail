chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  console.log("contentScript request", request);

  if (request.action === "checkScript") {
    sendResponse({ scriptActive: true });
  }

  if (request.action === "getMeta") {
    // Perform DOM manipulation or access
    const page = {
      title: document.title,
      url: window.location.href
    }
    sendResponse(page);
  }
});
