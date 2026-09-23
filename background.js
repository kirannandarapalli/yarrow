importScripts(
  "shared/blocklist.js",
  "shared/match.js",
  "shared/trackers.js",
  "shared/threat.js",
  "shared/rules.js",
  "shared/sites.js",
  "shared/filters.js",
  "shared/guards.js"
);

const ADS_RULESET = "blockee_ads";
const TRACKER_RULESET = "blockee_trackers";
const FEED_MAX_AGE = 12 * 60 * 60 * 1000;
const DEFAULTS = {
  enabled: true,
  trackingEnabled: true,
  securityEnabled: true,
  pausedSites: [],
  allowList: [],
  blockList: [],
  annoyancesEnabled: true,
  videoAdsEnabled: true,
  bannersEnabled: true,
  sponsorsEnabled: true,
  hiddenElements: [],
};

let settings = {
  enabled: true,
  trackingEnabled: true,
  securityEnabled: true,
  pausedSites: [],
  allowList: [],
  blockList: [],
  annoyancesEnabled: true,
  videoAdsEnabled: true,
  bannersEnabled: true,
  sponsorsEnabled: true,
  hiddenElements: [],
};
let filterCache = {
  updatedAt: 0,
  ads: { block: [], allow: [] },
  tracking: { block: [], allow: [] },
  annoyances: { block: [], allow: [] },
};
let ready;
let threatIndex = { urls: new Set(), hosts: new Set() };
const blockedCounts = new Map();
const blockedLogs = new Map();
const navTimes = new Map();
const seenRequests = new Set();
const badgeTimers = new Map();
const LOG_LIMIT = 30;
const countsReady = chrome.storage.session
  .get(null)
  .then((all) => {
    Object.keys(all || {}).forEach((key) => {
      if (key.startsWith("blockee-count-")) {
        const tabId = Number(key.slice("blockee-count-".length));
        if (Number.isInteger(tabId)) blockedCounts.set(tabId, all[key] || 0);
      }
      if (key.startsWith("blockee-log-")) {
        const tabId = Number(key.slice("blockee-log-".length));
        if (Number.isInteger(tabId) && Array.isArray(all[key])) blockedLogs.set(tabId, all[key]);
      }
    });
  })
  .catch(() => {});
let persistTimer = null;

function countKey(tabId) {
  return "blockee-count-" + tabId;
}

function logKey(tabId) {
  return "blockee-log-" + tabId;
}

function isBlockedMatch(rule) {
  const rulesetId = rule && rule.rulesetId;
  const ruleId = rule && rule.ruleId;
  const dynamicId = (chrome.declarativeNetRequest && chrome.declarativeNetRequest.DYNAMIC_RULESET_ID) || "_dynamic";
  if (rulesetId === dynamicId || rulesetId === "dynamic") {
    if (ruleId === 1) return true;
    return ruleId >= 3000 && ruleId < 20000;
  }
  return rulesetId === ADS_RULESET || rulesetId === TRACKER_RULESET;
}

function rememberRequest(requestId) {
  if (!requestId || seenRequests.has(requestId)) return false;
  seenRequests.add(requestId);
  if (seenRequests.size > 4000) seenRequests.delete(seenRequests.values().next().value);
  return true;
}

function persistCounts() {
  const payload = {};
  blockedCounts.forEach((value, tabId) => {
    payload[countKey(tabId)] = value;
  });
  blockedLogs.forEach((value, tabId) => {
    payload[logKey(tabId)] = value;
  });
  chrome.storage.session.set(payload).catch(() => {});
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistCounts();
  }, 100);
}

function pushLog(tabId, url) {
  if (!url) return;
  blockedLogs.set(tabId, globalThis.BlockeeSites.rememberLog(blockedLogs.get(tabId), url, LOG_LIMIT));
}

function logsFor(tabId) {
  return (blockedLogs.get(tabId) || []).slice();
}

function scheduleBadge(tabId) {
  if (badgeTimers.has(tabId)) return;
  const timer = setTimeout(() => {
    badgeTimers.delete(tabId);
    chrome.tabs
      .get(tabId)
      .then((tab) => paintTab(tab.id, tab.url || "", false))
      .catch(() => {});
  }, 200);
  badgeTimers.set(tabId, timer);
}

function noteBlock(tabId, requestId, url) {
  if (tabId == null || tabId < 0) return;
  countsReady.then(() => {
    if (requestId && !rememberRequest(requestId)) return;
    blockedCounts.set(tabId, (blockedCounts.get(tabId) || 0) + 1);
    pushLog(tabId, url);
    schedulePersist();
    scheduleBadge(tabId);
  });
}

async function countFor(tabId) {
  await countsReady;
  if (tabId == null) return 0;
  return blockedCounts.get(tabId) || 0;
}

async function refreshMatched(tabId) {
  await countsReady;
  if (tabId == null || !chrome.declarativeNetRequest.getMatchedRules) return countFor(tabId);
  try {
    const result = await chrome.declarativeNetRequest.getMatchedRules({
      tabId: tabId,
      minTimeStamp: navTimes.get(tabId) || 0,
    });
    const matched = (result.rulesMatchedInfo || []).filter((info) => isBlockedMatch(info.rule)).length;
    const next = Math.max(matched, blockedCounts.get(tabId) || 0);
    blockedCounts.set(tabId, next);
    schedulePersist();
    return next;
  } catch (err) {
    return blockedCounts.get(tabId) || 0;
  }
}

function whenReady() {
  if (!ready) {
    ready = chrome.storage.local
      .get(DEFAULTS)
      .then((data) => {
        settings = {
          enabled: data.enabled !== false,
          trackingEnabled: data.trackingEnabled !== false,
          securityEnabled: data.securityEnabled !== false,
          pausedSites: Array.isArray(data.pausedSites) ? data.pausedSites : [],
          allowList: Array.isArray(data.allowList) ? data.allowList : [],
          blockList: Array.isArray(data.blockList) ? data.blockList : [],
          annoyancesEnabled: data.annoyancesEnabled !== false,
          videoAdsEnabled: data.videoAdsEnabled !== false,
          bannersEnabled: data.bannersEnabled !== false,
          sponsorsEnabled: data.sponsorsEnabled !== false,
          hiddenElements: Array.isArray(data.hiddenElements) ? data.hiddenElements : [],
        };
        return syncSettings();
      })
      .then(() => loadCachedFeed())
      .then(() => loadFilterCache())
      .then(() => syncDynamicRules())
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

async function loadFilterCache() {
  const stored = await chrome.storage.local.get({ filterCache: null });
  if (stored.filterCache) filterCache = stored.filterCache;
}

async function loadCachedFeed() {
  const stored = await chrome.storage.local.get({ threatFeed: null });
  const feed = stored.threatFeed;
  if (!feed) return;
  threatIndex = {
    urls: new Set(feed.urls || []),
    hosts: new Set(feed.hosts || []),
  };
}

async function syncSettings() {
  await chrome.storage.local.set(settings);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: [
      ...(settings.enabled ? [ADS_RULESET] : []),
      ...(settings.trackingEnabled ? [TRACKER_RULESET] : []),
    ],
    disableRulesetIds: [
      ...(!settings.enabled ? [ADS_RULESET] : []),
      ...(!settings.trackingEnabled ? [TRACKER_RULESET] : []),
    ],
  });
  await applyToolbar(null, settings.enabled ? "on" : "off");
  await syncDynamicRules();
  await scanOpenTabs(false);
}

async function syncDynamicRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const types = (globalThis.BLOCKEE_RESOURCE_TYPES || []).slice();
  const userRules = globalThis.BlockeeSites.buildSiteRules(settings, types);
  const feedRules = globalThis.BlockeeFilters.buildFeedRules(filterCache, settings, types);
  const maxRules = Math.max(20, (chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 5000) - 5);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: userRules.concat(feedRules).slice(0, maxRules),
  });
}

function protectionOn(url) {
  return settings.enabled && !globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites);
}

function annoyancesOn(url) {
  return settings.annoyancesEnabled && !globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites);
}

function videoOn(url) {
  return settings.videoAdsEnabled && !globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites);
}

function bannersOn(url) {
  return settings.bannersEnabled && !globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites);
}

function sponsorsOn(url) {
  return settings.sponsorsEnabled && !globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites);
}

function hiddenFor(url) {
  const host = globalThis.BlockeeSites.siteHost(url);
  return (settings.hiddenElements || []).filter((item) => item && (item.host === host || (host && host.endsWith("." + item.host))));
}

function saveHidden(list) {
  settings.hiddenElements = list;
  return chrome.storage.local.set({ hiddenElements: list });
}

async function broadcastAds() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return Promise.resolve();
      return chrome.tabs
        .sendMessage(tab.id, {
          type: "blockee-enabled",
          enabled: protectionOn(tab.url || ""),
          annoyances: annoyancesOn(tab.url || ""),
          video: videoOn(tab.url || ""),
          banners: bannersOn(tab.url || ""),
          sponsors: sponsorsOn(tab.url || ""),
        })
        .catch(() => {});
    })
  );
}

async function setSetting(key, value) {
  settings[key] = !!value;
  await syncSettings();
  if (key === "enabled" || key === "annoyancesEnabled" || key === "videoAdsEnabled" || key === "bannersEnabled" || key === "sponsorsEnabled") {
    await broadcastAds();
  }
}

function assess(url) {
  if (!settings.securityEnabled || !url) return { malicious: false };
  return globalThis.BlockeeThreat.assessThreat(url, threatIndex);
}

async function closeAdTab(tabId, url, openerTabId) {
  if (!settings.enabled || openerTabId == null || !url) return;
  if (!globalThis.BlockeeMatch.isAdUrl(url)) return;
  const opener = await chrome.tabs.get(openerTabId).catch(() => null);
  if (opener && globalThis.BlockeeSites.isSitePaused(opener.url || "", settings.pausedSites)) return;
  chrome.tabs.remove(tabId).catch(() => {});
}

const TOOLBAR_ICONS = {
  on: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  off: { 16: "icons/off16.png", 32: "icons/off32.png", 48: "icons/off48.png", 128: "icons/off128.png" },
  paused: { 16: "icons/off16.png", 32: "icons/off32.png", 48: "icons/off48.png", 128: "icons/off128.png" },
  bad: { 16: "icons/bad16.png", 32: "icons/bad32.png", 48: "icons/bad48.png", 128: "icons/bad128.png" },
};

async function applyToolbar(tabId, mode, count) {
  const icons = TOOLBAR_ICONS[mode] || TOOLBAR_ICONS.off;
  const target = tabId == null ? {} : { tabId: tabId };
  await chrome.action.setIcon(Object.assign({ path: icons }, target));
  if (mode === "bad") return;
  const on = mode === "on";
  const text = globalThis.BlockeeSites.badgeText(mode, count);
  await chrome.action.setBadgeText(Object.assign({ text: text }, target));
  await chrome.action.setBadgeBackgroundColor(Object.assign({ color: on ? "#137333" : "#5f6368" }, target));
  const title = mode === "paused" ? "Yarrow is paused on this site" : on ? "Yarrow is on" : "Yarrow is off";
  await chrome.action.setTitle(Object.assign({ title: title }, target));
}

async function showThreat(tabId, threat, notify) {
  await applyToolbar(tabId, "bad");
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
  await chrome.action.setTitle({ tabId, title: "Yarrow: " + threat.reason });
  if (!notify || !threat.host) return;
  const stored = await chrome.storage.session.get({ notified: {} });
  const notified = stored.notified || {};
  if (notified[threat.host]) return;
  notified[threat.host] = Date.now();
  await chrome.storage.session.set({ notified });
  await chrome.notifications.create("blockee-" + threat.host.replace(/[^a-z0-9.-]/gi, "-"), {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Yarrow: malicious site",
    message: threat.host + ". " + threat.reason,
    priority: 2,
  });
}

async function paintTab(tabId, url, notify) {
  await countsReady;
  const threat = assess(url);
  const mode = globalThis.BlockeeSites.toolbarMode({
    enabled: settings.enabled,
    paused: globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites),
    malicious: threat.malicious,
  });
  if (mode === "bad") {
    await showThreat(tabId, threat, notify);
    return;
  }
  await applyToolbar(tabId, mode, blockedCounts.get(tabId) || 0);
}

async function scanOpenTabs(notifyActive) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      await paintTab(tab.id, tab.url || "", notifyActive && tab.active);
    })
  );
}

async function injectOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["shared/blocklist.js", "shared/match.js", "content/page.js"],
          world: "MAIN",
        });
        if (/youtube\.com|youtube-nocookie\.com/i.test(tab.url)) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ["shared/youtube.js", "content/youtube-main.js"],
            world: "MAIN",
          });
        }
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: [
            "shared/blocklist.js",
            "shared/match.js",
            "shared/selectors.js",
            "shared/guards.js",
            "content/cosmetic.js",
            "content/bridge.js",
            "content/annoyances.js",
            "content/article.js",
            "content/hides.js",
            "content/picker.js",
            "content/youtube.js",
            "content/players.js",
            "shared/sponsor.js",
            "content/sponsor.js",
          ],
        });
      } catch (err) {
        // Restricted pages cannot be scripted.
      }
    })
  );
}

function feedKey(raw) {
  const parts = globalThis.BlockeeThreat.pageParts(raw);
  return parts ? parts.key : null;
}

async function refreshFeeds() {
  const stored = await chrome.storage.local.get({ threatFeed: null });
  const age = stored.threatFeed ? Date.now() - stored.threatFeed.updatedAt : null;
  if (age != null && age < FEED_MAX_AGE && threatIndex.hosts.size + threatIndex.urls.size > 0) return;
  try {
    const [phishResponse, malwareResponse] = await Promise.all([
      fetch("https://openphish.com/feed.txt"),
      fetch("https://urlhaus.abuse.ch/downloads/hostfile/"),
    ]);
    const phish = phishResponse.ok ? await phishResponse.text() : "";
    const malware = malwareResponse.ok ? await malwareResponse.text() : "";
    const urls = [];
    phish.split("\n").some((line) => {
      const key = feedKey(line.trim());
      if (key) urls.push(key);
      return urls.length >= 4000;
    });
    const hosts = [];
    malware.split("\n").some((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return false;
      const host = (trimmed.split(/\s+/)[1] || "").toLowerCase().replace(/\.$/, "");
      if (!host.includes(".") || globalThis.BlockeeThreat.shouldIgnoreFeedHost(host)) return false;
      hosts.push(host);
      return hosts.length >= 4000;
    });
    threatIndex = { urls: new Set(urls), hosts: new Set(hosts) };
    await chrome.storage.local.set({ threatFeed: { updatedAt: Date.now(), urls, hosts } });
    if (settings.securityEnabled) await scanOpenTabs(true);
  } catch (err) {
    console.error("Yarrow threat feed failed", err);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  closeAdTab(tabId, changeInfo.url, tab.openerTabId).catch(() => {});
  paintTab(tabId, changeInfo.url, true).catch(() => {});
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  navTimes.set(details.tabId, details.timeStamp || Date.now());
  countsReady.then(() => {
    blockedCounts.set(details.tabId, 0);
    blockedLogs.set(details.tabId, []);
    chrome.storage.session.remove([countKey(details.tabId), logKey(details.tabId)]).catch(() => {});
    paintTab(details.tabId, details.url || "", false).catch(() => {});
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  blockedCounts.delete(tabId);
  blockedLogs.delete(tabId);
  navTimes.delete(tabId);
  chrome.storage.session.remove([countKey(tabId), logKey(tabId)]).catch(() => {});
});

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const request = info.request || {};
    if (!isBlockedMatch(info.rule)) return;
    noteBlock(request.tabId, request.requestId, request.url);
  });
}

if (chrome.webRequest && chrome.webRequest.onErrorOccurred) {
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.error !== "net::ERR_BLOCKED_BY_CLIENT") return;
      noteBlock(details.tabId, details.requestId, details.url);
    },
    { urls: ["<all_urls>"] }
  );
}

chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  closeAdTab(details.tabId, details.url, details.sourceTabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;
  if (message.type === "blockee-blocked") {
    noteBlock(sender.tab && sender.tab.id, null, message.url);
    return;
  }
  if (message.type === "blockee-get") {
    whenReady()
      .then(() => (message.fresh ? refreshMatched(message.tabId) : countFor(message.tabId)))
      .then((blockedCount) => {
        const url = message.url || "";
        const threat = assess(url);
        sendResponse({
          enabled: settings.enabled,
          trackingEnabled: settings.trackingEnabled,
          securityEnabled: settings.securityEnabled,
          annoyancesEnabled: settings.annoyancesEnabled,
          videoAdsEnabled: settings.videoAdsEnabled,
          bannersEnabled: settings.bannersEnabled,
          sponsorsEnabled: settings.sponsorsEnabled,
          pausedSites: settings.pausedSites,
          allowList: settings.allowList,
          blockList: settings.blockList,
          hiddenHere: hiddenFor(url),
          pausedHere: globalThis.BlockeeSites.isSitePaused(url, settings.pausedSites),
          blockedCount: blockedCount,
          blockedLog: logsFor(message.tabId),
          threat: threat.malicious ? threat : null,
        });
      })
      .catch(() =>
        sendResponse({
          enabled: true,
          trackingEnabled: true,
          securityEnabled: true,
          annoyancesEnabled: true,
          videoAdsEnabled: true,
          bannersEnabled: true,
          sponsorsEnabled: true,
          pausedSites: [],
          allowList: [],
          blockList: [],
          hiddenHere: [],
          pausedHere: false,
          blockedCount: 0,
          blockedLog: [],
          threat: null,
        })
      );
    return true;
  }
  if (message.type === "blockee-pause") {
    whenReady()
      .then(async () => {
        const result = globalThis.BlockeeSites.togglePaused(settings.pausedSites, message.url || "");
        if (!result.ok) return result;
        settings.pausedSites = result.pausedSites;
        await syncSettings();
        await broadcastAds();
        return result;
      })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-list") {
    whenReady()
      .then(async () => {
        const result = globalThis.BlockeeSites.applyListChange(settings, message.action, message.domain);
        if (!result.ok) return result;
        settings.allowList = result.allowList;
        settings.blockList = result.blockList;
        await syncSettings();
        return result;
      })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-hide") {
    whenReady()
      .then(() => {
        const selector = globalThis.BlockeeGuards.usableSelector(message.selector);
        const host = globalThis.BlockeeSites.siteHost((sender.tab && sender.tab.url) || "");
        if (!selector || !host) return { ok: false, error: "That element cannot be hidden." };
        const list = settings.hiddenElements || [];
        if (list.some((item) => item.host === host && item.selector === selector)) return { ok: true };
        if (list.length >= 200) return { ok: false, error: "The hide list is full." };
        return saveHidden(list.concat({ host: host, selector: selector })).then(() => ({ ok: true }));
      })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-unhide") {
    whenReady()
      .then(() => {
        const selector = message.selector;
        const host = globalThis.BlockeeSites.siteHost(message.url || "");
        return saveHidden(
          (settings.hiddenElements || []).filter((item) => !(item.host === host && item.selector === selector))
        ).then(() => ({ ok: true }));
      })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-set") {
    const key = message.key || "enabled";
    if (
      key !== "enabled" &&
      key !== "trackingEnabled" &&
      key !== "securityEnabled" &&
      key !== "annoyancesEnabled" &&
      key !== "videoAdsEnabled" &&
      key !== "bannersEnabled" &&
      key !== "sponsorsEnabled"
    ) {
      sendResponse({ ok: false });
      return;
    }
    const value = message.value !== undefined ? message.value : message.enabled;
    setSetting(key, value)
      .then(() => sendResponse({ ok: true, ...settings }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-export") {
    whenReady()
      .then(() => sendResponse({ ok: true, backup: globalThis.BlockeeSites.backupSettings(settings) }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "blockee-import") {
    whenReady()
      .then(async () => {
        const result = globalThis.BlockeeSites.importSettings(message.backup);
        if (!result.ok) return result;
        const backup = result.settings;
        settings.enabled = backup.enabled;
        settings.trackingEnabled = backup.trackingEnabled;
        settings.securityEnabled = backup.securityEnabled;
        settings.annoyancesEnabled = backup.annoyancesEnabled;
        settings.videoAdsEnabled = backup.videoAdsEnabled;
        settings.bannersEnabled = backup.bannersEnabled;
        settings.sponsorsEnabled = backup.sponsorsEnabled;
        settings.pausedSites = backup.pausedSites;
        settings.allowList = backup.allowList;
        settings.blockList = backup.blockList;
        settings.hiddenElements = backup.hiddenElements;
        await syncSettings();
        await broadcastAds();
        return { ok: true };
      })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  whenReady()
    .then(() => refreshFeeds())
    .then(() => {
      if (details.reason === "install") return injectOpenTabs();
      return undefined;
    })
    .catch((err) => console.error("Yarrow install failed", err));
});

chrome.alarms.create("blockee-threat-feed", { periodInMinutes: 720 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "blockee-threat-feed") {
    refreshFeeds().catch(() => {});
    refreshFilterLists().catch(() => {});
  }
});

async function refreshFilterLists() {
  const age = filterCache.updatedAt ? Date.now() - filterCache.updatedAt : null;
  const hasDomains = (filterCache.ads.block || []).length + (filterCache.tracking.block || []).length > 0;
  if (age != null && age < FEED_MAX_AGE && hasDomains) return;
  const sources = [
    { key: "ads", urls: ["https://easylist.to/easylist/easylist.txt"] },
    { key: "tracking", urls: ["https://easylist.to/easylist/easyprivacy.txt"] },
    {
      key: "annoyances",
      urls: [
        "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
        "https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt",
      ],
    },
  ];
  const next = { updatedAt: Date.now(), ads: filterCache.ads, tracking: filterCache.tracking, annoyances: filterCache.annoyances };
  const cosmetics = [];
  await Promise.all(
    sources.map(async (source) => {
      let text = "";
      for (let i = 0; i < source.urls.length && !text; i += 1) {
        try {
          const response = await fetch(source.urls[i]);
          if (response.ok) text = await response.text();
        } catch (err) {
          text = "";
        }
      }
      if (!text) return;
      const parsed = globalThis.BlockeeFilters.parseFilterList(text, { domains: 30000, cosmetics: source.key === "tracking" ? 0 : 800 });
      if (!parsed.block.length && !(filterCache[source.key] && filterCache[source.key].block.length)) return;
      if (parsed.block.length) next[source.key] = { block: parsed.block, allow: parsed.allow };
      parsed.cosmetic.forEach((rule) => {
        cosmetics.push({ host: rule.host, selector: rule.selector, kind: source.key === "annoyances" ? "annoyance" : "ad" });
      });
    })
  );
  filterCache = next;
  await chrome.storage.local.set({ filterCache: next, feedCosmetics: cosmetics.slice(0, 2000) });
  await syncDynamicRules();
}

whenReady()
  .then(() => refreshFeeds())
  .then(() => refreshFilterLists())
  .catch((err) => console.error("Yarrow failed to start", err));

function installMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "blockee-hide",
      title: "Hide this element",
      contexts: ["page", "frame", "selection", "link", "image", "video", "audio"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

installMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null || info.menuItemId !== "blockee-hide") return;
  chrome.tabs.sendMessage(tab.id, { type: "blockee-hide-target" }, { frameId: info.frameId }, () => {
    void chrome.runtime.lastError;
  });
});
