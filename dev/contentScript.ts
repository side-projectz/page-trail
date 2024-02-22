function extractPageMetadata() {
  const metaTags = document.getElementsByTagName('meta');
  const metaData: {
    title: string;
    description: string;
    tags: string[];
  } = {
    title: document.title,
    description: '',
    tags: [],
  };

  for (let meta of Array.from(metaTags)) {
    // Extract description
    if (meta.name.toLowerCase() === 'description') {
      metaData.description = meta.content;
    }

    // Extract specific tags (like keywords)
    if (
      meta.name.toLowerCase() === 'keywords' ||
      meta.name.toLowerCase() === 'tags'
    ) {
      metaData.tags = meta.content.split(',').map((tag) => tag.trim());
    }
  }

  return metaData;
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'checkScript') {
    sendResponse({ scriptActive: true });
    return true;
  }

  if (request.action === 'getMeta') {
    const meta = extractPageMetadata();
    sendResponse({ title: document.title, url: window.location.href, meta });
    return true;
  }

  return false;
});
