(function () {
  if (globalThis.__blockeeCosmetic) return;
  globalThis.__blockeeCosmetic = true;

  const STYLE_ID = "blockee-css";
  let enabled = bannersOn();

  function bannersOn() {
    const flag = document.documentElement?.dataset.blockeeBanners;
    if (flag === "on" || flag === "off") return flag === "on";
    return document.documentElement?.dataset.blockee !== "off";
  }
  const neutralized = new Set();
  let scheduled = false;

  function readEnabled() {
    const next = bannersOn();
    if (next === enabled) {
      if (next) ensureStyle();
      return;
    }
    enabled = next;
    if (enabled) {
      ensureStyle();
      scheduleScan();
      return;
    }
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    if (document.documentElement?.dataset.blockee === "off") restoreOverlays();
  }

  function ensureStyle() {
    if (!enabled || document.getElementById(STYLE_ID) || !globalThis.BLOCKEE_HIDE_CSS) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = globalThis.BLOCKEE_HIDE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function backgroundAlpha(color) {
    if (!color || color === "transparent") return 0;
    const match = String(color).match(/rgba?\(([^)]+)\)/i);
    if (!match) return 1;
    const parts = match[1].split(",");
    if (parts.length < 4) return 1;
    const alpha = parseFloat(parts[3]);
    return Number.isFinite(alpha) ? alpha : 1;
  }

  function hasVisibleContent(element) {
    if ((element.innerText || "").trim().length > 0) return true;
    if (element.querySelector("img, video, canvas, svg, picture")) return true;
    return false;
  }

  function coversViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width >= window.innerWidth * 0.9 &&
      rect.height >= window.innerHeight * 0.9 &&
      rect.top <= window.innerHeight * 0.1 &&
      rect.left <= window.innerWidth * 0.1
    );
  }

  function linksOnlyToAd(element) {
    if (!globalThis.BlockeeMatch) return false;
    const href = element.tagName === "A" ? element.href : "";
    if (href && globalThis.BlockeeMatch.isAdUrl(href)) return true;
    const links = element.querySelectorAll("a[href]");
    if (links.length !== 1) return false;
    return globalThis.BlockeeMatch.isAdUrl(links[0].href);
  }

  function isHijackOverlay(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (element.id === STYLE_ID) return false;
    const style = getComputedStyle(element);
    if (style.position !== "fixed") return false;
    if (!coversViewport(element)) return false;
    if (parseFloat(style.opacity) < 0.05) return true;
    const z = Number(style.zIndex);
    const invisible =
      backgroundAlpha(style.backgroundColor) < 0.05 &&
      style.backgroundImage === "none" &&
      !hasVisibleContent(element);
    if (invisible && z >= 999999) return true;
    if (linksOnlyToAd(element) && z >= 100) return true;
    return false;
  }

  function neutralize(element) {
    if (neutralized.has(element)) return;
    neutralized.add(element);
    element.dataset.blockeePointer = element.style.pointerEvents;
    element.style.setProperty("pointer-events", "none", "important");
  }

  function restoreOverlays() {
    neutralized.forEach((element) => {
      if (!element.isConnected) return;
      element.style.pointerEvents = element.dataset.blockeePointer || "";
      delete element.dataset.blockeePointer;
    });
    neutralized.clear();
  }

  function scanOverlays() {
    if (document.documentElement?.dataset.blockee === "off") return;
    const roots = [];
    if (document.body) roots.push(document.body);
    if (document.documentElement) roots.push(document.documentElement);
    roots.forEach((root) => {
      Array.from(root.children).forEach((child) => {
        if (isHijackOverlay(child)) neutralize(child);
      });
    });
  }

  function adsOn() {
    return document.documentElement?.dataset.blockee !== "off";
  }

  function scheduleScan() {
    if (!adsOn() || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanOverlays();
    });
  }

  ensureStyle();
  document.addEventListener("blockee-state", readEnabled);
  if (document.documentElement) {
    new MutationObserver((records) => {
      let stateChanged = false;
      let domChanged = false;
      records.forEach((record) => {
        if (record.type === "attributes") stateChanged = true;
        if (record.type === "childList") domChanged = true;
      });
      if (stateChanged) readEnabled();
      if (adsOn() && (stateChanged || domChanged)) {
        if (enabled) ensureStyle();
        scheduleScan();
      }
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-blockee", "data-blockee-banners"],
      childList: true,
      subtree: true,
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    ensureStyle();
    scheduleScan();
  });
  window.addEventListener("load", scheduleScan);
})();
