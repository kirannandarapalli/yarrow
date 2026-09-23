(function () {
  if (globalThis.__blockeePage || !globalThis.BlockeeMatch) return;
  globalThis.__blockeePage = true;

  let enabled = document.documentElement?.dataset.blockee !== "off";
  let clickState = null;

  function readEnabled() {
    enabled = document.documentElement?.dataset.blockee !== "off";
  }

  function noteBlock(url) {
    try {
      if (!document || typeof document.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
      document.dispatchEvent(new CustomEvent("blockee-blocked", { detail: url || "" }));
    } catch (err) {
      // Counting is optional. Blocking still applies.
    }
  }

  function elementFrom(event) {
    const target = event.target;
    return target && target.nodeType === 1 ? target : target && target.parentElement;
  }

  function anchorFrom(event) {
    const element = elementFrom(event);
    if (!element || !element.closest) return null;
    return element.closest("a[href]");
  }

  function classify(event) {
    const anchor = anchorFrom(event);
    if (anchor && globalThis.BlockeeMatch.isRealNavigation(anchor.href, location.href)) {
      return { kind: "navigate", href: anchor.href, hidden: isHidden(anchor) };
    }
    const element = elementFrom(event);
    if (element && element.closest && element.closest("button, input, select, textarea, [role='button']")) {
      return { kind: "control", href: null };
    }
    return { kind: "other", href: null };
  }

  function currentClick() {
    if (!clickState || Date.now() - clickState.at > 3000) return { kind: "none", href: null, hidden: false };
    return clickState;
  }

  function isHidden(element) {
    if (!element || element.nodeType !== 1 || typeof element.getBoundingClientRect !== "function") return false;
    try {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return true;
      if (style.display === "contents") {
        const kids = element.children;
        if (!kids || !kids.length) return false;
        for (let i = 0; i < kids.length; i += 1) {
          if (!isHidden(kids[i])) return false;
        }
        return true;
      }
      const rect = element.getBoundingClientRect();
      return rect.width < 2 || rect.height < 2;
    } catch (err) {
      return false;
    }
  }

  function hookWindow(win, viaFrame) {
    if (!win) return;
    let already = false;
    try {
      already = win.__blockeeHooked === true;
    } catch (err) {
      return;
    }
    if (already) return;
    let native;
    try {
      native = win.open;
    } catch (err) {
      return;
    }
    if (typeof native !== "function") return;
    try {
      win.__blockeeHooked = true;
    } catch (err) {
      return;
    }
    const bound = native.bind(win);
    function hookedOpen(...args) {
      try {
        const click = currentClick();
        if (
          enabled &&
          globalThis.BlockeeMatch.shouldBlockPopup({
            enabled: true,
            openUrl: args.length ? args[0] : null,
            pageUrl: location.href,
            clickedHref: click.href,
            clickKind: click.kind,
            clickedHidden: click.hidden,
            viaFrame: viaFrame,
          })
        ) {
          noteBlock(args.length ? args[0] : "");
          return null;
        }
      } catch (err) {
        // If the check fails, keep the page working.
      }
      return bound(...args);
    }
    try {
      Object.defineProperty(win, "open", {
        configurable: true,
        enumerable: true,
        get: function () {
          return hookedOpen;
        },
        set: function () {},
      });
    } catch (err) {
      try {
        win.open = hookedOpen;
      } catch (assignErr) {
        // Leave the original open in place if the page forbids the hook.
      }
    }
  }

  function onActivate(event) {
    readEnabled();
    clickState = Object.assign({ at: Date.now() }, classify(event));
    if (!enabled) return;
    const anchor = anchorFrom(event);
    if (!anchor || !anchor.href) return;
    const block = globalThis.BlockeeMatch.shouldBlockNewTabAnchor({
      enabled: true,
      href: anchor.href,
      target: anchor.target,
      pageUrl: location.href,
      hidden: isHidden(anchor),
      modifiedClick: !!(event.metaKey || event.ctrlKey || event.button === 1),
    });
    if (!block) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "click" || event.type === "auxclick" || event.type === "keydown") noteBlock(anchor.href);
  }

  function onKeydown(event) {
    if (event.key !== "Enter") return;
    onActivate(event);
  }

  hookWindow(window, false);

  if (typeof HTMLIFrameElement === "function") {
    const contentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    if (contentWindow && contentWindow.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        configurable: true,
        enumerable: contentWindow.enumerable,
        get: function () {
          const frameWindow = contentWindow.get.call(this);
          hookWindow(frameWindow, true);
          return frameWindow;
        },
      });
    }
  }

  function blockedForm(form) {
    if (!enabled || !form) return false;
    return globalThis.BlockeeMatch.shouldBlockFormSubmit({
      enabled: true,
      action: form.getAttribute("action") || form.action,
      target: form.target,
      pageUrl: location.href,
    });
  }

  if (typeof HTMLFormElement === "function") {
    const nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      if (blockedForm(this)) {
        noteBlock(this.getAttribute("action") || this.action);
        return undefined;
      }
      return nativeSubmit.call(this);
    };
    window.addEventListener(
      "submit",
      function (event) {
        const form = event.target;
        if (!form || form.tagName !== "FORM") return;
        const adAction = globalThis.BlockeeMatch.isAdUrl(form.action, location.href);
        if (!adAction && !isHidden(form)) return;
        if (!adAction && !blockedForm(form)) return;
        event.preventDefault();
        event.stopPropagation();
        noteBlock(form.getAttribute("action") || form.action);
      },
      true
    );
  }

  function popScriptNode(node) {
    try {
      if (!enabled || !node || node.nodeType !== 1) return false;
      const tag = node.localName || node.tagName;
      if (String(tag || "").toLowerCase() !== "script" || !node.getAttribute) return false;
      const src = node.getAttribute("src");
      if (!src || !globalThis.BlockeeMatch.isPopScriptUrl(src, location.href)) return false;
      return true;
    } catch (err) {
      return false;
    }
  }

  function hookInsert(name) {
    const native = Node.prototype[name];
    if (typeof native !== "function") return;
    let depth = 0;
    Node.prototype[name] = function (node) {
      depth += 1;
      try {
        if (depth > 4) return node;
        if (depth === 1 && popScriptNode(node)) {
          noteBlock(node.getAttribute && node.getAttribute("src"));
          return node;
        }
        return native.apply(this, arguments);
      } finally {
        depth -= 1;
      }
    };
  }

  if (typeof Node === "function" && Node.prototype) {
    hookInsert("appendChild");
    hookInsert("insertBefore");
  }

  window.addEventListener("pointerdown", onActivate, true);
  window.addEventListener("mousedown", onActivate, true);
  window.addEventListener("click", onActivate, true);
  window.addEventListener("auxclick", onActivate, true);
  window.addEventListener("keydown", onKeydown, true);
  document.addEventListener("blockee-state", readEnabled);
  if (document.documentElement) {
    new MutationObserver(readEnabled).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-blockee"],
    });
  }
})();
