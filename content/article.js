(function () {
  if (globalThis.__blockeeArticle || !globalThis.BlockeeGuards) return;
  const host = location.hostname.toLowerCase();
  if (host !== "moneycontrol.com" && !host.endsWith(".moneycontrol.com")) return;
  globalThis.__blockeeArticle = true;

  const pageWorld = !globalThis.chrome || !chrome.runtime || !chrome.runtime.id;
  const AD = /advslot|andbeyond|taboola|outbrain|ads-|ad-container|google-ad|google_ads|dfp/i;

  if (pageWorld) {
    try {
      Object.defineProperty(window, "readmorefunctionality", {
        configurable: true,
        get: function () {
          return 0;
        },
        set: function () {},
      });
    } catch (err) {
      // The page can keep its own flag. The article text is still inserted below.
    }
  }

  function adsOn() {
    return document.documentElement.dataset.blockee !== "off";
  }

  function decode(text) {
    return String(text)
      .replace(/&nbsp;/gi, " ")
      .replace(/&ldquo;|&rdquo;/gi, '"')
      .replace(/&lsquo;|&rsquo;/gi, "'")
      .replace(/&eacute;/gi, "é")
      .replace(/&amp;/gi, "&")
      .replace(/&#(\d+);/g, function (_, code) {
        return String.fromCharCode(Number(code));
      });
  }

  function articleBody() {
    const scripts = document.querySelectorAll("script");
    for (let i = 0; i < scripts.length; i++) {
      const raw = scripts[i].textContent || "";
      if (raw.indexOf("articleBody") === -1) continue;
      const body = decode(globalThis.BlockeeGuards.extractArticleBody(raw));
      if (body.length >= 400) return body;
    }
    return "";
  }

  function unhide(box) {
    const gate = document.getElementById("readmoredivarticle");
    if (gate) gate.remove();
    const nodes = box.querySelectorAll("[style*='display']");
    nodes.forEach(function (el) {
      if (AD.test(String(el.className || "") + " " + (el.id || ""))) return;
      if (el.style.display === "none") el.style.setProperty("display", "block", "important");
    });
  }

  function fill(body) {
    if (document.querySelector("[data-blockee-article]")) return;
    document.documentElement.dataset.blockeeArticleFilled = "1";
    const holder = document.createElement("div");
    holder.dataset.blockeeArticle = "1";
    holder.style.setProperty("display", "block", "important");
    holder.style.setProperty("max-height", "none", "important");
    holder.style.setProperty("overflow", "visible", "important");
    body.replace(/\r\n/g, "\n").split(/\n\s*\n/).forEach(function (part) {
      const text = part.replace(/\s+/g, " ").trim();
      if (!text) return;
      const p = document.createElement("p");
      p.textContent = text;
      p.style.setProperty("display", "block", "important");
      holder.appendChild(p);
    });
    const lede = document.querySelector(".article_desc");
    if (lede && lede.parentElement) {
      lede.insertAdjacentElement("afterend", holder);
      return;
    }
    const box = document.getElementById("contentdata");
    if (!box) {
      holder.remove();
      return;
    }
    const author = box.querySelector(".author_wrapper");
    if (author) box.insertBefore(holder, author);
    else box.appendChild(holder);
  }

  function repair() {
    try {
      if (!adsOn()) return;
      const body = articleBody();
      const lede = document.querySelector(".article_desc");
      const box = document.getElementById("contentdata");
      const scope = (lede && lede.parentElement) || box;
      if (!scope || !body) return;
      if (globalThis.BlockeeGuards.shouldFillArticle(scope.textContent || "", body)) fill(body);
      if (box) unhide(box);
    } catch (err) {
      // Keep retrying. A half-loaded article page should not stop the next pass.
    }
  }

  document.addEventListener("blockee-state", repair);
  document.addEventListener("DOMContentLoaded", repair);
  setInterval(repair, 1000);
  repair();
})();
