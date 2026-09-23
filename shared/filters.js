(function () {
  const EXACT_KEEP = {
    "google.com": true,
    "googleapis.com": true,
    "googleusercontent.com": true,
    "googlevideo.com": true,
    "gstatic.com": true,
    "gmail.com": true,
    "ggpht.com": true,
    "youtube.com": true,
    "youtube-nocookie.com": true,
    "ytimg.com": true,
  };
  const FEED_BLOCK_START = 3000;
  const FEED_ALLOW_START = 20000;

  function skipDomain(domain) {
    if (!domain || EXACT_KEEP[domain]) return true;
    return (
      domain.endsWith(".youtube.com") ||
      domain.endsWith(".googlevideo.com") ||
      domain.endsWith(".ytimg.com") ||
      domain.endsWith(".youtube-nocookie.com")
    );
  }

  function optionsOk(options) {
    if (!options) return true;
    return options.split(",").every((part) => {
      const name = part.split("=")[0].replace(/^~/, "");
      return /^(third-party|3p|doc|document|image|script|stylesheet|xmlhttprequest|subdocument|media|other|font|websocket|ping)$/i.test(
        name
      );
    });
  }

  function parseFilterList(text, limits) {
    const cap = (limits && limits.domains) || 60000;
    const cosmeticCap = (limits && limits.cosmetics) || 2000;
    const block = [];
    const allow = [];
    const cosmetic = [];
    const seenBlock = new Set();
    const seenAllow = new Set();
    String(text || "")
      .split(/\r?\n/)
      .forEach((raw) => {
        const line = raw.trim();
        if (!line || line.charAt(0) === "!" || line.charAt(0) === "[") return;
        if (line.includes("##")) {
          if (cosmetic.length >= cosmeticCap) return;
          const parts = line.split("##");
          if (parts.length !== 2 || !parts[0] || parts[0].includes(",") || parts[0].includes("*")) return;
          const selector = parts[1].trim();
          if (!selector || selector.indexOf("+js") === 0 || /[{}<>]/.test(selector) || selector.length > 180) return;
          const host = parts[0].toLowerCase().replace(/^\|\|/, "").replace(/\^$/, "").replace(/^www\./, "");
          if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || skipDomain(host)) return;
          cosmetic.push({ host: host, selector: selector });
          return;
        }
        let body = line;
        let exception = false;
        if (body.indexOf("@@") === 0) {
          exception = true;
          body = body.slice(2);
        }
        const dollar = body.indexOf("$");
        let options = "";
        if (dollar !== -1) {
          options = body.slice(dollar + 1);
          body = body.slice(0, dollar);
        }
        if (!optionsOk(options)) return;
        const match = /^\|\|([a-z0-9.-]+)\^$/.exec(body.toLowerCase());
        if (!match) return;
        const domain = match[1].replace(/^www\./, "");
        if (skipDomain(domain)) return;
        if (exception) {
          if (seenAllow.has(domain) || allow.length >= cap) return;
          seenAllow.add(domain);
          allow.push(domain);
          return;
        }
        if (seenBlock.has(domain) || block.length >= cap) return;
        seenBlock.add(domain);
        block.push(domain);
      });
    const allowSet = new Set(allow);
    return {
      block: block.filter((domain) => !allowSet.has(domain)),
      allow: allow,
      cosmetic: cosmetic,
    };
  }

  function buildFeedRules(cache, settings, resourceTypes) {
    const types = (resourceTypes || []).slice();
    const blocks = [];
    const allows = [];
    const adsOn = !settings || settings.enabled !== false;
    const trackingOn = !settings || settings.trackingEnabled !== false;
    const annoyancesOn = !settings || settings.annoyancesEnabled !== false;
    function take(bucket, enabled) {
      if (!enabled || !bucket) return;
      (bucket.block || []).forEach((domain) => blocks.push(domain));
      (bucket.allow || []).forEach((domain) => allows.push(domain));
    }
    take(cache && cache.ads, adsOn);
    take(cache && cache.tracking, trackingOn);
    take(cache && cache.annoyances, annoyancesOn);
    const allowSet = new Set(allows);
    const blockDomains = [...new Set(blocks)].filter((domain) => !allowSet.has(domain));
    const allowDomains = [...allowSet];
    const rules = [];
    const chunk = 100;
    let id = FEED_BLOCK_START;
    for (let i = 0; i < blockDomains.length && id < FEED_ALLOW_START; i += chunk) {
      rules.push({
        id: id,
        priority: 10,
        action: { type: "block" },
        condition: { requestDomains: blockDomains.slice(i, i + chunk), resourceTypes: types },
      });
      id += 1;
    }
    id = FEED_ALLOW_START;
    for (let i = 0; i < allowDomains.length && id < FEED_ALLOW_START + 2000; i += chunk) {
      rules.push({
        id: id,
        priority: 100,
        action: { type: "allow" },
        condition: { requestDomains: allowDomains.slice(i, i + chunk), resourceTypes: types },
      });
      id += 1;
    }
    return rules;
  }

  const api = {
    FEED_ALLOW_START: FEED_ALLOW_START,
    FEED_BLOCK_START: FEED_BLOCK_START,
    buildFeedRules: buildFeedRules,
    parseFilterList: parseFilterList,
  };
  globalThis.BlockeeFilters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
