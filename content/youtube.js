(function () {
  if (globalThis.__blockeeYoutube || !globalThis.BlockeeGuards) return;
  const host = location.hostname.toLowerCase();
  if (host !== "youtube.com" && !host.endsWith(".youtube.com") && host !== "youtube-nocookie.com" && !host.endsWith(".youtube-nocookie.com")) {
    return;
  }
  globalThis.__blockeeYoutube = true;

  const AD_SLOTS = [
    "ytd-ad-slot-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-search-pyv-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-companion-slot-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer",
    "#player-ads",
    "#masthead-ad",
    ".ytp-ad-overlay-container",
    ".ytp-ad-overlay-slot",
    ".ytp-ad-module",
    ".ytp-ad-image-overlay",
    "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-ads']",
  ].join(",");

  const HIDE_ID = "blockee-yt-hide";

  function enabled() {
    const flag = document.documentElement.dataset.blockeeVideo;
    if (flag === "on" || flag === "off") return flag === "on";
    return document.documentElement.dataset.blockee !== "off";
  }

  function ensureHideStyle() {
    if (document.getElementById(HIDE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_ID;
    style.textContent = [
      ".ytp-ad-image,.ytp-ad-text,.ytp-ad-preview-container,.ytp-ad-preview-image,",
      ".ytp-ad-player-overlay,.ytp-ad-player-overlay-layout,.ytp-ad-module,",
      ".ytp-ad-overlay-container,.ytp-ad-overlay-slot,",
      ".html5-video-player.ad-showing video,.html5-video-player.ad-interrupting video,",
      ".html5-video-player.ad-showing .ytp-cued-thumbnail-overlay,",
      ".html5-video-player.ad-interrupting .ytp-cued-thumbnail-overlay",
      "{opacity:0!important;visibility:hidden!important}",
    ].join("");
    (document.documentElement || document.head).appendChild(style);
  }

  function sweep() {
    if (!enabled()) {
      const style = document.getElementById(HIDE_ID);
      if (style) style.remove();
      return;
    }
    ensureHideStyle();
    document.querySelectorAll(AD_SLOTS).forEach((element) => element.remove());
    document.querySelectorAll("ytd-reel-video-renderer[is-ad]").forEach((reel) => {
      const next = document.querySelector("#navigation-button-down button, button[aria-label='Next video']");
      if (next) next.click();
      else reel.remove();
    });
    document.querySelectorAll("ytd-enforcement-message-view-model, ytd-popup-container, tp-yt-paper-dialog").forEach((element) => {
      if (globalThis.BlockeeGuards.looksLikeAdblockWall(element.innerText || "")) element.remove();
    });
    document.querySelectorAll(".html5-video-player").forEach((player) => {
      if (player.dataset.blockeeWatch !== "1") {
        player.dataset.blockeeWatch = "1";
        new MutationObserver(sweep).observe(player, { attributes: true, attributeFilter: ["class"] });
      }
      const video = player.querySelector("video");
      const skip = player.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button__text");
      const adShowing = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
      const action = globalThis.BlockeeGuards.youtubeAdAction({
        adShowing: adShowing,
        hasSkipButton: !!skip,
        duration: video && Number.isFinite(video.duration) ? video.duration : 0,
        currentTime: video ? video.currentTime : 0,
      });
      if (!adShowing || !video) {
        if (video && video.dataset.blockeeRate) {
          video.playbackRate = Number(video.dataset.blockeeRate) || 1;
          delete video.dataset.blockeeRate;
        }
        return;
      }
      if (action === "skip" && skip) skip.click();
      if (!video.dataset.blockeeRate) video.dataset.blockeeRate = String(video.playbackRate || 1);
      if (video.playbackRate < 16) video.playbackRate = 16;
      if (Number.isFinite(video.duration) && video.duration > 0 && video.duration < 90 && video.currentTime < video.duration - 0.05) {
        video.currentTime = video.duration;
      }
    });
  }

  ensureHideStyle();
  sweep();
  setInterval(sweep, 50);
  document.addEventListener("blockee-state", sweep);
  if (document.documentElement) {
    new MutationObserver(sweep).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-blockee", "data-blockee-video"],
    });
  }
})();
