(function () {
  const AD_RENDERERS = {
    adBreakHeartbeatParams: true,
    adPlacementRenderer: true,
    adSlotRenderer: true,
    bannerPromoRenderer: true,
    inFeedAdLayoutRenderer: true,
    mastheadAd: true,
    playerAds: true,
    promotedSparklesTextSearchRenderer: true,
    promotedSparklesWebRenderer: true,
    promotedVideoRenderer: true,
    searchPyvRenderer: true,
    statementBannerRenderer: true,
    videoMastheadAdV3Renderer: true,
  };

  function isYoutubePlayerUrl(url) {
    const value = String(url || "");
    return (
      value.indexOf("/youtubei/v1/player") !== -1 ||
      value.indexOf("/youtubei/v1/next") !== -1 ||
      value.indexOf("get_watch") !== -1
    );
  }

  function hasAdRenderer(item) {
    if (!item || typeof item !== "object") return false;
    const keys = Object.keys(item);
    for (let i = 0; i < keys.length; i += 1) {
      if (AD_RENDERERS[keys[i]]) return true;
    }
    return false;
  }

  function clearAdLists(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    delete node.adPlacements;
    delete node.playerAds;
    delete node.adSlots;
    delete node.adBreakHeartbeatParams;
    ["player_response", "raw_player_response"].forEach((key) => {
      const raw = node[key];
      if (typeof raw !== "string" || raw.indexOf("adPlacement") === -1) return;
      try {
        const parsed = JSON.parse(raw);
        walk(parsed, 0);
        node[key] = JSON.stringify(parsed);
      } catch (err) {
        // Leave the original string if it is not JSON.
      }
    });
  }

  function stripYoutubeAds(data) {
    walk(data, 0);
    return data;
  }

  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) {
        if (hasAdRenderer(node[i])) node.splice(i, 1);
        else walk(node[i], depth + 1);
      }
      return;
    }
    clearAdLists(node);
    if (node.playerResponse) clearAdLists(node.playerResponse);
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      if (AD_RENDERERS[keys[i]]) {
        delete node[keys[i]];
        continue;
      }
      const child = node[keys[i]];
      if (child && typeof child === "object") walk(child, depth + 1);
    }
  }

  const api = { isYoutubePlayerUrl: isYoutubePlayerUrl, stripYoutubeAds: stripYoutubeAds };
  globalThis.BlockeeYoutube = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
