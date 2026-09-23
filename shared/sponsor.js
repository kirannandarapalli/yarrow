(function () {
  const CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview"];

  function videoIdFromUrl(raw) {
    let url;
    try {
      url = new URL(String(raw));
    } catch (err) {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const youtube =
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com") ||
      host === "youtu.be";
    if (!youtube) return null;
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") id = parts[1] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  function usableSegments(segments, duration) {
    return (segments || [])
      .filter((segment) => {
        if (!Array.isArray(segment) || segment.length < 2) return false;
        const start = Number(segment[0]);
        const end = Number(segment[1]);
        const length = end - start;
        if (!Number.isFinite(start) || !Number.isFinite(end) || length <= 0 || length > 600) return false;
        if (duration > 0 && length > duration * 0.6) return false;
        return true;
      })
      .map((segment) => [Number(segment[0]), Number(segment[1])]);
  }

  function skipTarget(segments, time, duration) {
    const usable = usableSegments(segments, duration);
    let cursor = Number(time);
    if (!Number.isFinite(cursor)) return null;
    let changed = false;
    for (let pass = 0; pass < 8; pass += 1) {
      let next = null;
      usable.forEach((segment) => {
        if (cursor >= segment[0] && cursor < segment[1] - 0.2) next = next == null ? segment[1] : Math.max(next, segment[1]);
      });
      if (next == null) break;
      cursor = next;
      changed = true;
    }
    return changed ? cursor : null;
  }

  function parseSegments(payload) {
    if (!Array.isArray(payload)) return [];
    return payload.map((item) => (item && item.segment) || null).filter((segment) => Array.isArray(segment));
  }

  const api = { CATEGORIES, parseSegments, skipTarget, usableSegments, videoIdFromUrl };
  globalThis.BlockeeSponsor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
