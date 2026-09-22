globalThis.BLOCKEE_SELECTORS = [
  "ins.adsbygoogle",
  ".adsbygoogle",
  "iframe[id^='google_ads_iframe']",
  "iframe[src*='doubleclick.net']",
  "iframe[src*='googlesyndication.com']",
  "iframe[src*='googleadservices.com']",
  "iframe[src*='adnxs.com']",
  "iframe[src*='taboola.com']",
  "iframe[src*='outbrain.com']",
  "iframe[src*='mgid.com']",
  "iframe[src*='revcontent.com']",
  "iframe[src*='amazon-adsystem.com']",
  "[id^='div-gpt-ad']",
  "[id^='google_ads_']",
  "[id^='taboola-']",
  "[id^='outbrain_widget']",
  "[data-ad-slot]",
  "[data-ad-client]",
  "[data-ad-unit]",
  "[data-google-query-id]",
  "[aria-label='Advertisement' i]",
  "[aria-label='advertisement' i]",
  ".taboola",
  ".taboola-widget",
  ".OUTBRAIN",
  ".outbrain-widget",
  ".mgid-widget",
  ".google-auto-placed",
  ".teads-inread",
  ".teads-ad",
  ".primis-player",
  "[data-ad-manager-id]",
  "[class*='ad-slot']",
  "[id*='sticky-ad']",
  "[class*='sticky-ad']",
  "[class*='floating-ad']",
];

globalThis.BLOCKEE_HIDE_CSS =
  globalThis.BLOCKEE_SELECTORS.join(",\n") +
  " {\n  display: none !important;\n}\n";

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BLOCKEE_SELECTORS: globalThis.BLOCKEE_SELECTORS,
    BLOCKEE_HIDE_CSS: globalThis.BLOCKEE_HIDE_CSS,
  };
}
