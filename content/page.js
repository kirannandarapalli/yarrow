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

  function controlFrom(event) {
    const element = elementFrom(event);
    if (!element || !element.closest) return null;
    return element.closest(
      "button, input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='tab']"
    );
  }

  function dialogFrom(element) {
    if (!element || !element.closest) return null;
    return element.closest("dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true']");
  }

  function clickIsHidden(element) {
    const dialog = dialogFrom(element);
    if (dialog && !isHidden(dialog)) return false;
    return isHidden(element);
  }

  function classify(event) {
    const anchor = anchorFrom(event);
    const control = controlFrom(event);
    const element = elementFrom(event);
    const hidden = clickIsHidden(control || anchor || element);
    if (control) return { kind: "control", href: anchor ? anchor.href : null, hidden: hidden };
    if (anchor && globalThis.BlockeeMatch.isRealNavigation(anchor.href, location.href)) {
      return { kind: "navigate", href: anchor.href, hidden: hidden };
    }
    return { kind: "other", href: anchor ? anchor.href : null, hidden: hidden };
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
    let bound;
    try {
      win.__blockeeHooked = true;
      bound = native.bind(win);
    } catch (err) {
      return;
    }
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
          return inertPopup();
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

  function inertPopup() {
    const doc = {
      open() {},
      close() {},
      write() {},
      writeln() {},
      createElement() {
        return { style: {}, setAttribute() {}, appendChild(node) { return node; } };
      },
    };
    const popup = {
      closed: false,
      close() {
        popup.closed = true;
      },
      focus() {},
      blur() {},
      print() {},
      stop() {},
      postMessage() {},
      document: doc,
      location: { href: "about:blank", assign() {}, replace() {} },
    };
    doc.defaultView = popup;
    return popup;
  }

  function onActivate(event) {
    try {
      onActivateUnsafe(event);
    } catch (err) {
      // A click must still reach the page.
    }
  }

  function onActivateUnsafe(event) {
    readEnabled();
    clickState = Object.assign({ at: Date.now() }, classify(event));
    if (!enabled) return;
    // pointerdown and mousedown only remember the click. Cancelling them
    // drops the browser's user gesture, so a later window.open returns null.
    if (event.type === "pointerdown" || event.type === "mousedown") return;
    if (controlFrom(event)) return;
    const anchor = anchorFrom(event);
    if (!anchor || !anchor.href) return;
    const block = globalThis.BlockeeMatch.shouldBlockNewTabAnchor({
      enabled: true,
      href: anchor.href,
      target: anchor.target,
      pageUrl: location.href,
      hidden: clickIsHidden(anchor),
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
    try {
      const contentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
      if (contentWindow && contentWindow.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
          configurable: true,
          enumerable: contentWindow.enumerable,
          get: function () {
            const frameWindow = contentWindow.get.call(this);
            try {
              hookWindow(frameWindow, true);
            } catch (err) {
              // Reading the frame must still succeed.
            }
            return frameWindow;
          },
        });
      }
    } catch (err) {
      // Leave the browser's contentWindow in place.
    }
  }

  function blockedForm(form) {
    if (!enabled || !form) return false;
    return globalThis.BlockeeMatch.shouldBlockFormSubmit({
      enabled: true,
      action: form.getAttribute("action") || form.action,
      target: form.target,
      pageUrl: location.href,
      hidden: clickIsHidden(form),
    });
  }

  if (typeof HTMLFormElement === "function") {
    const nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      try {
        if (blockedForm(this)) {
          noteBlock(this.getAttribute("action") || this.action);
          return undefined;
        }
      } catch (err) {
        // If the check fails, submit as the page asked.
      }
      return nativeSubmit.call(this);
    };
    window.addEventListener(
      "submit",
      function (event) {
        try {
          const form = event.target;
          if (!form || form.tagName !== "FORM") return;
          const adAction = globalThis.BlockeeMatch.isAdUrl(form.action, location.href);
          if (!adAction && !clickIsHidden(form)) return;
          if (!adAction && !blockedForm(form)) return;
          event.preventDefault();
          event.stopPropagation();
          noteBlock(form.getAttribute("action") || form.action);
        } catch (err) {
          // Leave the submit alone when the check itself fails.
        }
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
      if (depth > 0) return native.apply(this, arguments);
      depth += 1;
      try {
        let blocked = false;
        try {
          blocked = popScriptNode(node);
          if (blocked) noteBlock(node.getAttribute && node.getAttribute("src"));
        } catch (err) {
          blocked = false;
        }
        if (blocked) return node;
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
