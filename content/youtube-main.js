(function () {
  if (globalThis.__blockeeYoutubeMain || !globalThis.BlockeeYoutube) return;
  globalThis.__blockeeYoutubeMain = true;

  const style = document.createElement("style");
  style.id = "blockee-yt-main";
  style.textContent = [
    ".ytp-ad-image,",
    ".ytp-ad-text,",
    ".ytp-ad-preview-container,",
    ".ytp-ad-preview-image,",
    ".ytp-ad-player-overlay,",
    ".ytp-ad-player-overlay-layout,",
    ".ytp-ad-module,",
    ".ytp-ad-overlay-container,",
    ".ytp-ad-overlay-slot,",
    ".html5-video-player.ad-showing video,",
    ".html5-video-player.ad-interrupting video,",
    ".html5-video-player.ad-showing .ytp-cued-thumbnail-overlay,",
    ".html5-video-player.ad-interrupting .ytp-cued-thumbnail-overlay",
    "{opacity:0!important;visibility:hidden!important}",
  ].join("");
  (document.documentElement || document.head).appendChild(style);

  let parsing = false;

  function videoOn() {
    return document.documentElement.dataset.blockeeVideo !== "off";
  }

  function strip(data) {
    if (!videoOn() || parsing) return data;
    parsing = true;
    try {
      return globalThis.BlockeeYoutube.stripYoutubeAds(data);
    } catch (err) {
      return data;
    } finally {
      parsing = false;
    }
  }

  function hookProperty(name) {
    let current = window[name];
    if (current) strip(current);
    try {
      Object.defineProperty(window, name, {
        configurable: false,
        enumerable: true,
        get: function () {
          return current;
        },
        set: function (value) {
          current = value;
          strip(current);
        },
      });
    } catch (err) {
      strip(current);
    }
  }

  hookProperty("ytInitialPlayerResponse");
  hookProperty("ytInitialData");

  const nativeParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const value = nativeParse.call(this, text, reviver);
    if (
      !parsing &&
      videoOn() &&
      typeof text === "string" &&
      (text.indexOf("adPlacement") !== -1 || text.indexOf("playerAds") !== -1 || text.indexOf('"adSlots"') !== -1)
    ) {
      strip(value);
    }
    return value;
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const pending = nativeFetch.call(window, input, init);
      if (!globalThis.BlockeeYoutube.isYoutubePlayerUrl(url)) return pending;
      return pending.then((response) => {
        if (!videoOn()) return response;
        return response
          .clone()
          .text()
          .then((body) => {
            if (body.indexOf("adPlacement") === -1 && body.indexOf("playerAds") === -1) return response;
            const data = nativeParse(body);
            strip(data);
            const headers = new Headers(response.headers);
            headers.delete("content-length");
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            });
          })
          .catch(() => response);
      });
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__blockeeUrl = String(url || "");
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (globalThis.BlockeeYoutube.isYoutubePlayerUrl(this.__blockeeUrl)) {
      this.addEventListener("readystatechange", function () {
        if (this.readyState !== 4 || this.__blockeeDone || !videoOn()) return;
        this.__blockeeDone = true;
        try {
          const raw = typeof this.response === "object" && this.response ? this.response : nativeParse(this.responseText);
          strip(raw);
          if (typeof this.responseText === "string") {
            const text = JSON.stringify(raw);
            Object.defineProperty(this, "responseText", { configurable: true, get: () => text });
            if (this.responseType === "" || this.responseType === "text") {
              Object.defineProperty(this, "response", { configurable: true, get: () => text });
            }
          }
        } catch (err) {
          // The player can still use the original response.
        }
      });
    }
    return xhrSend.apply(this, arguments);
  };

  function endAd(video) {
    if (!video || video.__blockeeEnded) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 90) return;
    video.__blockeeEnded = true;
    if (video.currentTime < video.duration - 0.05) video.currentTime = video.duration;
    video.dispatchEvent(new Event("ended"));
  }

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const player = this.closest && this.closest(".html5-video-player");
    const result = nativePlay.apply(this, arguments);
    if (!videoOn() || !player || (!player.classList.contains("ad-showing") && !player.classList.contains("ad-interrupting"))) {
      return result;
    }
    endAd(this);
    this.addEventListener("loadedmetadata", () => endAd(this), { once: true });
    this.addEventListener("durationchange", () => endAd(this), { once: true });
    return result;
  };

  document.addEventListener(
    "timeupdate",
    (event) => {
      const video = event.target;
      if (!videoOn() || !video || video.tagName !== "VIDEO" || !video.closest) return;
      const player = video.closest(".html5-video-player");
      if (!player) return;
      const ad = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
      if (!ad) {
        video.__blockeeEnded = false;
        return;
      }
      endAd(video);
    },
    true
  );
})();
