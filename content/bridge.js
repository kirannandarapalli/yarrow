(function () {
  if (globalThis.__blockeeBridge) return;
  globalThis.__blockeeBridge = true;

  function publish(enabled, annoyances, video, banners, sponsors) {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.blockee = enabled !== false ? "on" : "off";
    root.dataset.blockeeAnnoyances = annoyances !== false ? "on" : "off";
    root.dataset.blockeeVideo = video !== false ? "on" : "off";
    root.dataset.blockeeBanners = banners !== false ? "on" : "off";
    root.dataset.blockeeSponsors = sponsors !== false ? "on" : "off";
    document.dispatchEvent(new CustomEvent("blockee-state"));
  }

  function hostPaused(pausedSites) {
    const host = location.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    return (pausedSites || []).some((site) => host === site || host.endsWith("." + site));
  }

  function readStorage() {
    chrome.storage.local.get(
      { enabled: true, annoyancesEnabled: true, videoAdsEnabled: true, bannersEnabled: true, sponsorsEnabled: true, pausedSites: [] },
      (data) => {
        const paused = hostPaused(data.pausedSites);
        publish(
          data.enabled !== false && !paused,
          data.annoyancesEnabled !== false && !paused,
          data.videoAdsEnabled !== false && !paused,
          data.bannersEnabled !== false && !paused,
          data.sponsorsEnabled !== false && !paused
        );
      }
    );
  }

  readStorage();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area !== "local" ||
      (!changes.enabled &&
        !changes.pausedSites &&
        !changes.annoyancesEnabled &&
        !changes.videoAdsEnabled &&
        !changes.bannersEnabled &&
        !changes.sponsorsEnabled)
    ) {
      return;
    }
    readStorage();
  });

  document.addEventListener("blockee-blocked", (event) => {
    chrome.runtime.sendMessage({ type: "blockee-blocked", url: (event && event.detail) || "" }, () => {
      void chrome.runtime.lastError;
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "blockee-enabled") return;
    publish(message.enabled !== false, message.annoyances !== false, message.video !== false, message.banners !== false, message.sponsors !== false);
  });
})();
