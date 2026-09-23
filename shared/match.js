(function () {
  const domains = globalThis.BLOCKEE_AD_DOMAINS;
  const paths = globalThis.BLOCKEE_AD_PATHS;
  const popScriptPath = globalThis.BLOCKEE_POP_SCRIPT_PATH;
  if (!domains || !paths || !popScriptPath) {
    throw new Error("Yarrow blocklist failed to load");
  }
  const popScriptPattern = new RegExp(popScriptPath);

  const domainSet = new Set(domains);

  function hostMatches(host, set) {
    let current = host;
    while (current) {
      if (set.has(current)) return true;
      const dot = current.indexOf(".");
      if (dot === -1) return false;
      current = current.slice(dot + 1);
    }
    return false;
  }

  function pathMatches(pathname, prefix) {
    if (!pathname.startsWith(prefix)) return false;
    if (pathname.length === prefix.length) return true;
    if (prefix.endsWith("/") || prefix.endsWith("_")) return true;
    return pathname.charAt(prefix.length) === "/";
  }

  function asUrl(value, base) {
    if (value == null || value === "") return null;
    try {
      return new URL(String(value), base || undefined);
    } catch (err) {
      return null;
    }
  }

  function isAdUrl(value, base) {
    const url = asUrl(value, base);
    if (!url) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (hostMatches(host, domainSet)) return true;
    for (let i = 0; i < paths.length; i += 1) {
      const rule = paths[i];
      if (host === rule.host || host.endsWith("." + rule.host)) {
        if (pathMatches(url.pathname, rule.path)) return true;
      }
    }
    return false;
  }

  function sameDestination(left, right, base) {
    const a = asUrl(left, base);
    const b = asUrl(right, base);
    if (!a || !b) return false;
    if (a.origin !== b.origin) return false;
    return a.pathname === b.pathname && a.search === b.search;
  }

  function bareHost(url) {
    return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  }

  function sameSite(left, right, base) {
    const a = asUrl(left, base);
    const b = asUrl(right, base);
    if (!a || !b) return false;
    const leftHost = bareHost(a);
    const rightHost = bareHost(b);
    return leftHost === rightHost || leftHost.endsWith("." + rightHost) || rightHost.endsWith("." + leftHost);
  }

  function isRealNavigation(href, pageUrl) {
    const target = asUrl(href, pageUrl);
    const page = asUrl(pageUrl);
    if (!target || !page) return false;
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;
    if (target.origin === page.origin && target.pathname === page.pathname && target.search === page.search) {
      return false;
    }
    return true;
  }

  function clickKindOf(options, pageUrl) {
    if (options.clickKind) return options.clickKind;
    if (options.clickedHref && isRealNavigation(options.clickedHref, pageUrl)) return "navigate";
    return "none";
  }

  // Block a window.open call when it is an ad, when a real link click also
  // opens some other cross-origin page, or when a click that is not a button
  // opens a cross-origin page (the "any click opens an ad" pattern).
  function shouldBlockPopup(options) {
    if (!options || !options.enabled) return false;
    const pageUrl = options.pageUrl || undefined;
    const openUrl = asUrl(
      options.openUrl == null || options.openUrl === "" ? "about:blank" : options.openUrl,
      pageUrl
    );
    if (!openUrl) return true;
    if (isAdUrl(openUrl.href)) return true;

    const kind = clickKindOf(options, pageUrl);
    const page = asUrl(pageUrl);
    if (
      kind === "navigate" &&
      options.clickedHref &&
      (sameDestination(openUrl.href, options.clickedHref, pageUrl) || sameSite(openUrl.href, options.clickedHref, pageUrl))
    ) {
      return false;
    }
    if (options.viaFrame && page && openUrl.origin !== page.origin) return true;
    if (options.viaFrame && (openUrl.protocol === "about:" || openUrl.protocol === "javascript:" || openUrl.protocol === "data:")) {
      return true;
    }
    if (kind === "none" || kind === "control") return false;

    const protocol = openUrl.protocol;
    if (protocol === "about:" && kind === "navigate" && !options.clickedHidden) return false;
    if (protocol === "javascript:" || protocol === "data:" || protocol === "about:") return true;
    if (!page) return false;
    return openUrl.origin !== page.origin;
  }

  function isPopScriptUrl(src, pageUrl) {
    const url = asUrl(src, pageUrl);
    const page = asUrl(pageUrl);
    if (!url || !page) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.origin === page.origin) return false;
    return popScriptPattern.test(url.pathname);
  }

  function opensNewContext(target) {
    const name = String(target || "").trim().toLowerCase();
    return name === "_blank" || name === "_new";
  }

  function shouldBlockFormSubmit(options) {
    if (!options || !options.enabled) return false;
    const action = asUrl(options.action || "about:blank", options.pageUrl);
    if (action && isAdUrl(action.href)) return true;
    if (!opensNewContext(options.target)) return false;
    if (!action) return true;
    const page = asUrl(options.pageUrl);
    if (!page) return false;
    return action.origin !== page.origin;
  }

  function shouldBlockNewTabAnchor(options) {
    if (!options || !options.enabled) return false;
    if (isAdUrl(options.href, options.pageUrl)) return true;
    const newTab = options.modifiedClick || opensNewContext(options.target);
    if (!newTab) return false;
    return !!options.hidden;
  }

  const api = {
    hostMatches,
    isAdUrl,
    isPopScriptUrl,
    isRealNavigation,
    sameDestination,
    sameSite,
    shouldBlockFormSubmit,
    shouldBlockNewTabAnchor,
    shouldBlockPopup,
  };
  globalThis.BlockeeMatch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
