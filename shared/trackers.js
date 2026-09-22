// Analytics and tracker hosts. Subdomains are matched automatically.
// Kept separate from the ad list so tracking protection can be switched off.
globalThis.BLOCKEE_TRACKERS = [
  "ads-twitter.com",
  "agkn.com",
  "amplitude.com",
  "analytics.tiktok.com",
  "bat.bing.com",
  "bluekai.com",
  "chartbeat.com",
  "chartbeat.net",
  "clarity.ms",
  "connect.facebook.net",
  "crazyegg.com",
  "ct.pinterest.com",
  "demdex.net",
  "everesttech.net",
  "exelator.com",
  "fullstory.com",
  "google-analytics.com",
  "googletagmanager.com",
  "hotjar.com",
  "krxd.net",
  "mc.yandex.ru",
  "mixpanel.com",
  "mouseflow.com",
  "omtrdc.net",
  "parsely.com",
  "quantserve.com",
  "rlcdn.com",
  "sc-static.net",
  "scorecardresearch.com",
  "segment.com",
  "segment.io",
  "snap.licdn.com",
  "tapad.com",
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BLOCKEE_TRACKERS: globalThis.BLOCKEE_TRACKERS };
}
