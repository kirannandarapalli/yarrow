(function () {
  const WALL_PHRASES = [
    "ad blocker",
    "adblock",
    "ad-block",
    "disable your ad",
    "turn off your ad",
    "using an ad blocker",
    "whitelist us",
    "allow ads",
    "ad blockers violate",
    "blockers violate youtube",
  ];

  function compact(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function looksLikeAdblockWall(text) {
    const value = compact(text);
    if (value.length < 8 || value.length > 500) return false;
    return WALL_PHRASES.some((phrase) => value.includes(phrase));
  }

  function looksLikeAnnoyance(text) {
    const value = compact(text);
    if (value.length < 8 || value.length > 400) return false;
    return /we use cookies|cookie consent|accept cookies|accept all cookies|subscribe to our newsletter|sign up for our newsletter|join our newsletter|get our newsletter/.test(
      value
    );
  }

function extractArticleBody(text) {
  const source = String(text || "");
  const key = '"articleBody"';
  const at = source.indexOf(key);
  if (at < 0) return "";
  let i = source.indexOf('"', at + key.length);
  if (i < 0) return "";
  i += 1;
  let out = "";
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === "\\") {
      const next = source.charAt(i + 1);
      if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "t") out += "\t";
      else if (next === "u" && /^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      } else out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out.trim();
}

function shouldFillArticle(visible, body) {
  const article = String(body || "").replace(/\s+/g, " ").trim();
  if (article.length < 400) return false;
  const shown = String(visible || "").replace(/\s+/g, " ").trim();
  return !shown.includes(article.slice(0, 80));
}

function shouldUnlockScroll(state) {
  if (!state || !state.locked || state.visibleBlocker) return false;
  return true;
}

  function youtubeAdAction(state) {
    if (!state || !state.adShowing) return "none";
    if (state.hasSkipButton) return "skip";
    if (state.duration > 0 && state.currentTime < state.duration - 0.25) return "seek";
    return "none";
  }

  function usableSelector(selector) {
    const value = String(selector || "").trim();
    if (!value || value.length > 300) return null;
    if (/[{}<>]|url\s*\(|expression\s*\(/i.test(value)) return null;
    return value;
  }

  const api = {
    looksLikeAdblockWall: looksLikeAdblockWall,
    looksLikeAnnoyance: looksLikeAnnoyance,
    extractArticleBody: extractArticleBody,
    shouldFillArticle: shouldFillArticle,
    shouldUnlockScroll: shouldUnlockScroll,
    usableSelector: usableSelector,
    youtubeAdAction: youtubeAdAction,
  };
  globalThis.BlockeeGuards = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
