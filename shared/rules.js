(function () {
  const RESOURCE_TYPES = [
    "sub_frame",
    "stylesheet",
    "script",
    "image",
    "font",
    "object",
    "xmlhttprequest",
    "ping",
    "media",
    "websocket",
    "other",
  ];

  function buildBlockeeRules(domains, paths, options) {
    const rules = [];
    let id = 1;
    const chunkSize = 30;
    const popScripts = !options || options.popScripts !== false;
    for (let i = 0; i < domains.length; i += chunkSize) {
      rules.push({
        id: id,
        priority: 1,
        action: { type: "block" },
        condition: {
          requestDomains: domains.slice(i, i + chunkSize),
          resourceTypes: RESOURCE_TYPES,
        },
      });
      id += 1;
    }
    if (popScripts) {
      rules.push({
        id: id,
        priority: 3,
        action: { type: "block" },
        condition: {
          regexFilter: "^https?://[^/]+/[A-Za-z0-9_-]{10,}/[0-9]{5,7}/?($|[?])",
          resourceTypes: ["script"],
        },
      });
      id += 1;
    }
    for (let i = 0; i < paths.length; i += 1) {
      const rule = paths[i];
      rules.push({
        id: id,
        priority: 2,
        action: { type: "block" },
        condition: {
          urlFilter: "||" + rule.host + rule.path,
          resourceTypes: RESOURCE_TYPES,
        },
      });
      id += 1;
    }
    return rules;
  }

  globalThis.BLOCKEE_RESOURCE_TYPES = RESOURCE_TYPES;
  globalThis.buildBlockeeRules = buildBlockeeRules;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildBlockeeRules, RESOURCE_TYPES };
  }
})();
