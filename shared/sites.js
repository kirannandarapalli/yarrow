(function () {
  const LIST_LIMIT = 100;

  function normalizeDomain(input) {
    let value = String(input || "").trim().toLowerCase();
    value = value.replace(/^[a-z]+:\/\//, "");
    value = value.split("/")[0].split("?")[0].split("#")[0];
    value = value.replace(/:\d+$/, "").replace(/\.$/, "");
    if (value.startsWith("www.")) value = value.slice(4);
    if (!/^[a-z0-9.-]+$/.test(value) || !value.includes(".") || value.includes("..")) return null;
    if (value.startsWith(".") || value.endsWith(".")) return null;
    return value;
  }

  function siteHost(raw) {
    try {
      const host = new URL(String(raw)).hostname.toLowerCase().replace(/\.$/, "");
      return host.startsWith("www.") ? host.slice(4) : host;
    } catch (err) {
      return normalizeDomain(raw);
    }
  }

  function matchesSite(host, site) {
    return !!host && !!site && (host === site || host.endsWith("." + site));
  }

  function isSitePaused(raw, pausedSites) {
    const host = siteHost(raw);
    return (pausedSites || []).some((site) => matchesSite(host, site));
  }

  function togglePaused(pausedSites, raw) {
    const host = siteHost(raw);
    if (!host || !host.includes(".")) return { ok: false, error: "This page has no site to pause." };
    const current = pausedSites || [];
    const paused = current.some((site) => site === host);
    const next = paused ? current.filter((site) => site !== host) : current.concat(host).sort();
    return { ok: true, host: host, paused: !paused, pausedSites: next };
  }

  function uniqueSorted(list) {
    return [...new Set(list)].sort();
  }

  function applyListChange(state, action, raw) {
    const allowList = (state && state.allowList) || [];
    const blockList = (state && state.blockList) || [];
    if (action === "remove-allow" || action === "remove-block") {
      const domain = normalizeDomain(raw);
      if (!domain) return { ok: false, error: "That domain is not valid." };
      return {
        ok: true,
        allowList: action === "remove-allow" ? allowList.filter((item) => item !== domain) : allowList,
        blockList: action === "remove-block" ? blockList.filter((item) => item !== domain) : blockList,
      };
    }
    const domain = normalizeDomain(raw);
    if (!domain) return { ok: false, error: "Enter a domain like ads.example.com." };
    if (action === "allow") {
      if (!allowList.includes(domain) && allowList.length >= LIST_LIMIT) {
        return { ok: false, error: "The allow list is full." };
      }
      return {
        ok: true,
        domain: domain,
        allowList: uniqueSorted(allowList.concat(domain)),
        blockList: blockList.filter((item) => item !== domain),
      };
    }
    if (action === "block") {
      if (!blockList.includes(domain) && blockList.length >= LIST_LIMIT) {
        return { ok: false, error: "The block list is full." };
      }
      return {
        ok: true,
        domain: domain,
        allowList: allowList.filter((item) => item !== domain),
        blockList: uniqueSorted(blockList.concat(domain)),
      };
    }
    return { ok: false, error: "Unknown list action." };
  }

  function toolbarMode(input) {
    if (input && input.malicious) return "bad";
    if (!input || input.enabled === false) return "off";
    if (input.paused) return "paused";
    return "on";
  }

function buildSiteRules(state, resourceTypes) {
    const types = resourceTypes.concat(["main_frame"]);
    const rules = [];
    const blockList = (state && state.blockList) || [];
    const allowList = (state && state.allowList) || [];
    const pausedSites = (state && state.pausedSites) || [];
    if (blockList.length) {
      rules.push({
        id: 1,
        priority: 160,
        action: { type: "block" },
        condition: { requestDomains: blockList, resourceTypes: types },
      });
    }
    if (allowList.length) {
      rules.push({
        id: 1000,
        priority: 200,
        action: { type: "allow" },
        condition: { requestDomains: allowList, resourceTypes: types },
      });
    }
    if (pausedSites.length) {
      rules.push({
        id: 2000,
        priority: 300,
        action: { type: "allow" },
        condition: { initiatorDomains: pausedSites, resourceTypes: types },
      });
    }
    return rules;
  }

  const api = {
    applyListChange,
    buildSiteRules,
    isSitePaused,
    normalizeDomain,
    siteHost,
    togglePaused,
    toolbarMode,
  };
  globalThis.BlockeeSites = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
