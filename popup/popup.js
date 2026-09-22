const headline = document.getElementById("headline");
const site = document.getElementById("site");
const threatBox = document.getElementById("threat");
const threatReason = document.getElementById("threat-reason");
const count = document.getElementById("count");
const pause = document.getElementById("pause");
const domainInput = document.getElementById("domain");
const listError = document.getElementById("list-error");
const chips = document.getElementById("chips");
const hides = document.getElementById("hides");
const themeButtons = {
  light: document.getElementById("theme-light"),
  dark: document.getElementById("theme-dark"),
};
const switches = {
  enabled: document.getElementById("ads"),
  trackingEnabled: document.getElementById("tracking"),
  securityEnabled: document.getElementById("security"),
  annoyancesEnabled: document.getElementById("annoyances"),
  videoAdsEnabled: document.getElementById("video-ads"),
  bannersEnabled: document.getElementById("banners"),
};

let state = {
  enabled: true,
  trackingEnabled: true,
  securityEnabled: true,
  annoyancesEnabled: true,
  videoAdsEnabled: true,
  bannersEnabled: true,
  pausedHere: false,
  hiddenHere: [],
  allowList: [],
  blockList: [],
  threat: null,
};
let pageUrl = "";
let tabId = null;
let themeChosen = false;

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  themeButtons.light.setAttribute("aria-pressed", next === "light" ? "true" : "false");
  themeButtons.dark.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
  try {
    localStorage.setItem("blockee-theme", next);
  } catch (err) {
    /* The popup still switches for this open. */
  }
}

function loadTheme() {
  applyTheme(document.documentElement.dataset.theme);
  chrome.storage.local.get("theme", (data) => {
    if (themeChosen || chrome.runtime.lastError) return;
    if (data.theme === "light" || data.theme === "dark") applyTheme(data.theme);
  });
}

function hostFrom(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (err) {
    return "";
  }
}

function formatCount(value) {
  const total = value || 0;
  return total === 1 ? "1 blocked" : total + " blocked";
}

function siteActive() {
  return state.enabled && !state.pausedHere;
}

function render() {
  const threat = state.securityEnabled && state.threat && state.threat.malicious ? state.threat : null;
  const active = siteActive();
  if (threat) headline.textContent = "Danger on this site";
  else if (!state.enabled) headline.textContent = "Blocking is off";
  else if (state.pausedHere) headline.textContent = "Paused on this site";
  else headline.textContent = "Blocking this site";
  threatBox.hidden = !threat;
  threatReason.textContent = threat ? threat.reason : "";
  pause.setAttribute("aria-checked", active ? "true" : "false");
  pause.setAttribute("aria-label", active ? "Turn blocking off for this site" : "Turn blocking on for this site");
  pause.disabled = !hostFrom(pageUrl);
  Object.keys(switches).forEach((key) => {
    switches[key].setAttribute("aria-checked", state[key] ? "true" : "false");
    switches[key].disabled = false;
  });
  renderChips();
  renderHides();
}

function renderChips() {
  chips.replaceChildren();
  state.blockList.forEach((domain) => chips.append(chip(domain, "block")));
  state.allowList.forEach((domain) => chips.append(chip(domain, "allow")));
}

function renderHides() {
  hides.replaceChildren();
  (state.hiddenHere || []).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip block";
    button.textContent = item.selector;
    button.setAttribute("aria-label", "Show " + item.selector);
    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "blockee-unhide", url: pageUrl, selector: item.selector }, () => load());
    });
    hides.append(button);
  });
}

function chip(domain, kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip " + kind;
  button.textContent = (kind === "block" ? "Block " : "Allow ") + domain;
  button.setAttribute("aria-label", "Remove " + domain);
  button.addEventListener("click", () => {
    changeList(kind === "block" ? "remove-block" : "remove-allow", domain);
  });
  return button;
}

function showError(message) {
  headline.textContent = message;
  pause.setAttribute("aria-checked", "false");
}

function showListError(message) {
  listError.hidden = !message;
  listError.textContent = message || "";
}

function applyResponse(response) {
  state = {
    enabled: response.enabled !== false,
    trackingEnabled: response.trackingEnabled !== false,
    securityEnabled: response.securityEnabled !== false,
    annoyancesEnabled: response.annoyancesEnabled !== false,
    videoAdsEnabled: response.videoAdsEnabled !== false,
    bannersEnabled: response.bannersEnabled !== false,
    pausedHere: !!response.pausedHere,
    hiddenHere: response.hiddenHere || [],
    allowList: response.allowList || [],
    blockList: response.blockList || [],
    threat: response.threat || null,
  };
  count.textContent = formatCount(response.blockedCount);
  render();
}

function load() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    pageUrl = tab ? tab.url || "" : "";
    tabId = tab ? tab.id : null;
    site.textContent = hostFrom(pageUrl) || "This page";
    chrome.runtime.sendMessage({ type: "blockee-get", url: pageUrl, tabId: tabId, fresh: true }, (response) => {
      if (chrome.runtime.lastError || !response) {
        showError("Could not read Yarrow.");
        Object.values(switches).forEach((button) => {
          button.disabled = true;
        });
        pause.disabled = true;
        return;
      }
      applyResponse(response);
    });
  });
}

function bind(key, button) {
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-checked") !== "true";
    state[key] = next;
    render();
    chrome.runtime.sendMessage({ type: "blockee-set", key: key, value: next }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        state[key] = !next;
        render();
        showError("Could not update Yarrow. Try again.");
        return;
      }
      load();
    });
  });
}

function changeList(action, domain) {
  showListError("");
  chrome.runtime.sendMessage({ type: "blockee-list", action: action, domain: domain }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      showListError((response && response.error) || "Could not update that domain.");
      return;
    }
    domainInput.value = "";
    load();
  });
}

Object.keys(switches).forEach((key) => bind(key, switches[key]));

Object.keys(themeButtons).forEach((theme) => {
  themeButtons[theme].addEventListener("click", () => {
    themeChosen = true;
    applyTheme(theme);
    chrome.storage.local.set({ theme: theme });
  });
});

loadTheme();

function finishSiteChange(ok) {
  pause.disabled = false;
  if (!ok) {
    showListError("Could not update this site.");
    return;
  }
  load();
}

pause.addEventListener("click", () => {
  pause.disabled = true;
  showListError("");
  if (siteActive()) {
    chrome.runtime.sendMessage({ type: "blockee-pause", url: pageUrl }, (response) => {
      finishSiteChange(!chrome.runtime.lastError && response && response.ok);
    });
    return;
  }
  const resume = () => {
    if (!state.pausedHere) return finishSiteChange(true);
    chrome.runtime.sendMessage({ type: "blockee-pause", url: pageUrl }, (response) => {
      finishSiteChange(!chrome.runtime.lastError && response && response.ok);
    });
  };
  if (state.enabled) return resume();
  chrome.runtime.sendMessage({ type: "blockee-set", key: "enabled", value: true }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) return finishSiteChange(false);
    state.enabled = true;
    resume();
  });
});

document.getElementById("pick").addEventListener("click", () => {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: "blockee-pick" }, () => {
    void chrome.runtime.lastError;
    window.close();
  });
});

document.getElementById("add-block").addEventListener("click", () => changeList("block", domainInput.value));
document.getElementById("add-allow").addEventListener("click", () => changeList("allow", domainInput.value));
domainInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") changeList("block", domainInput.value);
});

load();
setInterval(() => {
  if (tabId == null) return;
  chrome.runtime.sendMessage({ type: "blockee-get", url: pageUrl, tabId: tabId }, (response) => {
    if (!response) return;
    count.textContent = formatCount(response.blockedCount);
  });
}, 1000);
