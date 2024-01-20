import log from 'loglevel';

log.setLevel('warn');

const exclusionRules: {
  urlPatterns: string[];
  domains: string[];
} = {
  urlPatterns: ['chrome://', 'about:', 'chrome-extension://'],
  domains: [],
};

export function urlIsExcluded(url: string) {
  return (
    url.trim() === '' ||
    exclusionRules.urlPatterns.some((pattern) => url.startsWith(pattern)) ||
    exclusionRules.domains.some((domain) =>
      new URL(url).hostname.includes(domain)
    )
  );
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
    if (
      parts.length > 2 &&
      ['co', 'com', 'net', 'org', 'gov', 'edu'].includes(secondLevelDomain)
    ) {
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
