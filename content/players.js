(function () {
  if (globalThis.__blockeePlayers) return;
  globalThis.__blockeePlayers = true;
  const host = location.hostname.toLowerCase();
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host.indexOf("youtube-nocookie.com") !== -1) return;

  const ROOTS = ".ima-ad-container, #ima-ad-container, .videoAdUi, .teads-inread, .teads-ad, .primis-player";

  function enabled() {
    const flag = document.documentElement.dataset.blockeeVideo;
    if (flag === "on" || flag === "off") return flag === "on";
    return document.documentElement.dataset.blockee !== "off";
  }

  function sweep() {
    if (!enabled()) return;
    document.querySelectorAll(ROOTS).forEach((element) => element.remove());
  }

  document.addEventListener("blockee-state", sweep);
  document.addEventListener("DOMContentLoaded", sweep);
  setInterval(sweep, 1000);
})();
