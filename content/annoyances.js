(function () {
  if (globalThis.__blockeeAnnoyances || !globalThis.BlockeeGuards) return;
  globalThis.__blockeeAnnoyances = true;

  const STYLE_ID = "blockee-annoyances";
  const HIDE_CSS = [
    "#onetrust-consent-sdk",
    "#onetrust-banner-sdk",
    "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyUnderlay",
    "#didomi-host",
    ".didomi-popup-container",
    "#sp_message_container",
    ".fc-consent-root",
    "#usercentrics-root",
    ".cky-consent-container",
    "#cookie-law-info-bar",
    ".cc-window",
    ".osano-cm-window",
    "#truste-consent-track",
    ".qc-cmp2-container",
    "#pandectes-banner",
  ]
    .map((selector) => selector + "{display:none!important}")
    .join("");

  function adsOn() {
    return document.documentElement.dataset.blockee !== "off";
  }

  function annoyancesOn() {
    return document.documentElement.dataset.blockeeAnnoyances === "on";
  }

  function ensureStyle() {
    const existing = document.getElementById(STYLE_ID);
    if (!annoyancesOn()) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = HIDE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  const LOCK_CLASSES = ["modal-open", "no-scroll", "noscroll", "overflow-hidden", "scroll-lock", "disable-scroll", "body_hidden"];

  function nodeLocked(node) {
    const raw = node.getAttribute("style") || "";
    if (/overflow(-y)?\s*:\s*hidden/i.test(raw) || /position\s*:\s*fixed/i.test(raw)) return true;
    return LOCK_CLASSES.some((name) => node.classList.contains(name));
  }

  function visibleBlocker() {
    if (!document.body) return false;
    return Array.from(document.body.children).some((element) => {
      const style = getComputedStyle(element);
      if (style.position !== "fixed") return false;
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= window.innerWidth * 0.7 && rect.height >= window.innerHeight * 0.5;
    });
  }

  function unlockScroll() {
    const blocker = visibleBlocker();
    [document.documentElement, document.body].forEach((node) => {
      if (!node) return;
      const style = getComputedStyle(node);
      const locked = globalThis.BlockeeGuards.shouldUnlockScroll({
        locked: nodeLocked(node),
        visibleBlocker: blocker,
      });
      if (!locked) return;
      node.style.setProperty("overflow", "auto", "important");
      node.style.setProperty("overflow-y", "auto", "important");
      LOCK_CLASSES.forEach((name) => node.classList.remove(name));
      if (style.position === "fixed") {
        const top = parseInt(style.top, 10);
        node.style.setProperty("position", "static", "important");
        node.style.top = "";
        node.style.width = "";
        if (Number.isFinite(top) && top < 0) window.scrollTo(0, -top);
      }
    });
  }

  function dismiss(element) {
    if (!element || element === document.body || element === document.documentElement) return;
    element.remove();
    unlockScroll();
  }

  function consider(element) {
    if (!element || element.nodeType !== 1) return;
    const style = getComputedStyle(element);
    const overlay =
      element.getAttribute("role") === "dialog" ||
      element.getAttribute("aria-modal") === "true" ||
      style.position === "fixed" ||
      style.position === "sticky";
    if (!overlay) return;
    const text = (element.innerText || "").slice(0, 600);
    if (adsOn() && globalThis.BlockeeGuards.looksLikeAdblockWall(text)) dismiss(element);
    else if (annoyancesOn() && globalThis.BlockeeGuards.looksLikeAnnoyance(text)) dismiss(element);
  }

  let scheduled = false;

  function scan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureStyle();
      if (!document.body) return;
      Array.from(document.body.children).forEach(consider);
      document.querySelectorAll("[role='dialog'], [aria-modal='true']").forEach(consider);
      unlockScroll();
    });
  }

  document.addEventListener("blockee-state", scan);
  document.addEventListener("DOMContentLoaded", scan);
  setInterval(scan, 1000);
  scan();

  const watchRoot = new MutationObserver(() => {
    if (!document.body) return;
    watchRoot.disconnect();
    new MutationObserver(scan).observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    scan();
  });
  watchRoot.observe(document.documentElement, { childList: true });
})();
