(function () {
  const BRANDS = [
    { token: "paypal", domains: ["paypal.com"] },
    { token: "apple", domains: ["apple.com", "icloud.com"] },
    { token: "appleid", domains: ["apple.com", "icloud.com"] },
    { token: "icloud", domains: ["icloud.com", "apple.com"] },
    { token: "microsoft", domains: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "office365.com", "outlook.com"] },
    { token: "outlook", domains: ["outlook.com", "office.com", "microsoft.com", "live.com"] },
    { token: "google", domains: ["google.com", "gmail.com", "youtube.com"] },
    { token: "gmail", domains: ["google.com", "gmail.com"] },
    { token: "netflix", domains: ["netflix.com"] },
    { token: "amazon", domains: ["amazon.com"] },
    { token: "facebook", domains: ["facebook.com", "fb.com"] },
    { token: "instagram", domains: ["instagram.com", "facebook.com"] },
    { token: "whatsapp", domains: ["whatsapp.com"] },
    { token: "binance", domains: ["binance.com"] },
    { token: "coinbase", domains: ["coinbase.com"] },
    { token: "metamask", domains: ["metamask.io"] },
    { token: "steam", domains: ["steampowered.com", "steamcommunity.com"] },
  ];

  const SUSPICIOUS_WORDS = new Set([
    "login",
    "verify",
    "secure",
    "account",
    "update",
    "confirm",
    "support",
    "unlock",
    "password",
    "signin",
    "billing",
    "invoice",
  ]);

  const SUSPICIOUS_TLDS = new Set([
    "zip",
    "mov",
    "xyz",
    "top",
    "click",
    "gq",
    "ml",
    "cf",
    "tk",
    "buzz",
    "rest",
    "monster",
    "country",
    "cam",
    "loan",
  ]);

  const SHARED_ROOTS = [
    "blogspot.com",
    "github.io",
    "google.com",
    "youtube.com",
    "facebook.com",
    "microsoft.com",
    "apple.com",
    "amazon.com",
    "cloudflare.com",
    "wikipedia.org",
    "wordpress.com",
  ];

  function pageParts(raw) {
    try {
      const url = new URL(String(raw));
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      const path = url.pathname.replace(/\/$/, "");
      return { host: host, key: host + path + url.search.toLowerCase() };
    } catch (err) {
      return null;
    }
  }

  function isOfficial(host, domains) {
    return domains.some((domain) => host === domain || host.endsWith("." + domain));
  }

  function isPublicIp(host) {
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return host.includes(":") && host !== "::1";
    const parts = match.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    return true;
  }

  function listedHost(host, hosts) {
    const set = hosts instanceof Set ? hosts : new Set(hosts || []);
    let current = host;
    while (current) {
      if (set.has(current) && !SHARED_ROOTS.includes(current)) return true;
      const dot = current.indexOf(".");
      if (dot === -1) return false;
      current = current.slice(dot + 1);
    }
    return false;
  }

  function impersonatedBrand(host) {
    const labels = host.split(".");
    const segments = labels.flatMap((label) => label.split("-")).filter(Boolean);
    const tld = labels[labels.length - 1];
    for (let i = 0; i < BRANDS.length; i += 1) {
      const brand = BRANDS[i];
      if (isOfficial(host, brand.domains)) continue;
      if (!segments.includes(brand.token)) continue;
      const exactLabel = labels.includes(brand.token);
      const suspiciousWord = segments.some((segment) => SUSPICIOUS_WORDS.has(segment));
      if (exactLabel || suspiciousWord || SUSPICIOUS_TLDS.has(tld)) return brand.token;
    }
    return null;
  }

  function assessThreat(raw, lists) {
    const page = pageParts(raw);
    if (!page) return { malicious: false };
    const urls = lists && lists.urls ? lists.urls : [];
    const urlHit = urls instanceof Set ? urls.has(page.key) : urls.indexOf(page.key) !== -1;
    if (urlHit) {
      return { malicious: true, host: page.host, reason: "This page is on a phishing list." };
    }
    if (listedHost(page.host, lists && lists.hosts)) {
      return { malicious: true, host: page.host, reason: "This domain is on a malware list." };
    }
    if (isPublicIp(page.host)) {
      return {
        malicious: true,
        host: page.host,
        reason: "This site is hosted on a raw IP address, which phishing pages often use.",
      };
    }
    if (page.host.split(".").some((label) => label.indexOf("xn--") === 0)) {
      return {
        malicious: true,
        host: page.host,
        reason: "This address disguises its characters, a common phishing trick.",
      };
    }
    const brand = impersonatedBrand(page.host);
    if (brand) {
      return { malicious: true, host: page.host, reason: "This address imitates " + brand + "." };
    }
    return { malicious: false, host: page.host };
  }

  function shouldIgnoreFeedHost(host) {
    return SHARED_ROOTS.includes(host);
  }

  const api = { assessThreat, pageParts, shouldIgnoreFeedHost };
  globalThis.BlockeeThreat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
