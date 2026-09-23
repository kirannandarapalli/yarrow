(function () {
  if (globalThis.__blockeeSponsor || !globalThis.BlockeeSponsor) return;
  const host = location.hostname.toLowerCase();
  const youtube =
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com");
  if (!youtube) return;
  globalThis.__blockeeSponsor = true;

  const cache = new Map();
  let currentId = "";

  function enabled() {
    return document.documentElement.dataset.blockeeSponsors !== "off";
  }

  function load(id) {
    if (cache.has(id)) return;
    cache.set(id, []);
    const categories = encodeURIComponent(JSON.stringify(globalThis.BlockeeSponsor.CATEGORIES));
    fetch("https://sponsor.ajay.app/api/skipSegments?videoID=" + encodeURIComponent(id) + "&categories=" + categories)
      .then((response) => (response.ok ? response.json() : []))
      .then((payload) => {
        cache.set(id, globalThis.BlockeeSponsor.parseSegments(payload));
      })
      .catch(() => {
        cache.set(id, []);
      });
  }

  function tick() {
    if (!enabled()) return;
    const id = globalThis.BlockeeSponsor.videoIdFromUrl(location.href);
    if (!id) return;
    if (id !== currentId) {
      currentId = id;
      load(id);
    }
    const video = document.querySelector("video");
    if (!video) return;
    const target = globalThis.BlockeeSponsor.skipTarget(cache.get(id) || [], video.currentTime, video.duration);
    if (target == null || target <= video.currentTime) return;
    video.currentTime = target;
  }

  setInterval(tick, 500);
  document.addEventListener("yt-navigate-finish", tick);
})();
