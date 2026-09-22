(function () {
  if (globalThis.__blockeePicker || window.top !== window) return;
  globalThis.__blockeePicker = true;

  const STYLE_ID = "blockee-picked";
  let picking = false;
  let current = null;
  let banner = null;

  function host() {
    return location.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  }

  function matches(ruleHost) {
    const page = host();
    return page === ruleHost || page.endsWith("." + ruleHost);
  }

  function applySaved(rules) {
    const selectors = (rules || [])
      .filter((rule) => rule && matches(rule.host) && globalThis.BlockeeGuards.usableSelector(rule.selector))
      .map((rule) => rule.selector);
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

  function loadSaved() {
    chrome.storage.local.get({ hiddenElements: [], pausedSites: [] }, (data) => {
      const page = host();
      const paused = (data.pausedSites || []).some((site) => page === site || page.endsWith("." + site));
      applySaved(paused ? [] : data.hiddenElements);
    });
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function looksRandom(id) {
    return id.length > 40 || /^[a-z0-9]{8,}$/i.test(id) || /[0-9a-f]{8,}/i.test(id);
  }

  function selectorFor(element) {
    if (!element || element.nodeType !== 1) return null;
    if (element.id && !looksRandom(element.id) && document.querySelectorAll("#" + cssEscape(element.id)).length === 1) {
      return globalThis.BlockeeGuards.usableSelector("#" + cssEscape(element.id));
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 4) {
      if (node.id && !looksRandom(node.id)) {
        parts.unshift("#" + cssEscape(node.id));
        break;
      }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
    }
    return globalThis.BlockeeGuards.usableSelector(parts.join(" > "));
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function move(event) {
    if (!picking) return;
    const next = event.target;
    if (!next || next === banner || (banner && banner.contains(next))) return;
    if (current) current.style.outline = current.dataset.blockeeOutline || "";
    current = next;
    current.dataset.blockeeOutline = current.style.outline;
    current.style.outline = "2px solid #e5484d";
  }

  function choose(event) {
    if (!picking) return;
    stop(event);
    const target = event.target;
    if (!target || target === banner || (banner && banner.contains(target))) return;
    const selector = selectorFor(target === banner ? null : target);
    cancel();
    if (!selector) return;
    chrome.runtime.sendMessage({ type: "blockee-hide", selector: selector }, () => {
      void chrome.runtime.lastError;
      loadSaved();
    });
  }

  function cancel() {
    picking = false;
    if (current) current.style.outline = current.dataset.blockeeOutline || "";
    current = null;
    if (banner) banner.remove();
    banner = null;
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", choose, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(event) {
    if (event.key === "Escape") cancel();
  }

  function start() {
    cancel();
    picking = true;
    banner = document.createElement("div");
    banner.textContent = "Click the element to hide it. Press Esc to cancel.";
    banner.setAttribute("style", "position:fixed;top:8px;left:8px;z-index:2147483647;padding:8px 10px;border-radius:8px;background:#101114;color:#f4f6f8;font:13px system-ui,sans-serif");
    (document.body || document.documentElement).appendChild(banner);
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", choose, true);
    document.addEventListener("keydown", onKey, true);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "blockee-pick") start();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.hiddenElements || changes.pausedSites || changes.enabled)) loadSaved();
  });
  document.addEventListener("blockee-state", loadSaved);
  loadSaved();
})();
