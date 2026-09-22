(function () {
  if (globalThis.__blockeeHides || !globalThis.BlockeeGuards) return;
  globalThis.__blockeeHides = true;

  const STYLE_ID = "blockee-feed-css";

  function host() {
    return location.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  }

  function matches(ruleHost) {
    const page = host();
    return page === ruleHost || page.endsWith("." + ruleHost);
  }

  function apply(rules) {
    const adsOn = document.documentElement.dataset.blockee !== "off";
    const annoyOn = document.documentElement.dataset.blockeeAnnoyances === "on";
    const selectors = (rules || [])
      .filter((rule) => {
        if (!rule || !matches(rule.host)) return false;
        if (rule.kind === "annoyance") return annoyOn;
        return adsOn;
      })
      .map((rule) => globalThis.BlockeeGuards.usableSelector(rule.selector))
      .filter(Boolean);
    let style = document.getElementById(STYLE_ID);
    if (!selectors.length) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = selectors.map((selector) => selector + "{display:none!important}").join("");
  }

  function load() {
    chrome.storage.local.get({ feedCosmetics: [] }, (data) => apply(data.feedCosmetics));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.feedCosmetics) load();
  });
  document.addEventListener("blockee-state", load);
  load();
})();