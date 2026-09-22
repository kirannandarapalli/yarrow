const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

require("../shared/blocklist.js");
const {
  isAdUrl,
  isPopScriptUrl,
  shouldBlockFormSubmit,
  shouldBlockNewTabAnchor,
  shouldBlockPopup,
} = require("../shared/match.js");
const { buildBlockeeRules } = require("../shared/rules.js");

const domains = globalThis.BLOCKEE_AD_DOMAINS;
const paths = globalThis.BLOCKEE_AD_PATHS;
const page = "https://news.example/story";

test("ad domains are sorted and unique", () => {
  const sorted = domains.slice().sort();
  assert.deepEqual(domains, sorted);
  assert.equal(new Set(domains).size, domains.length);
  for (const domain of domains) {
    assert.match(domain, /^[a-z0-9.-]+$/);
    assert.equal(domain.includes(".."), false);
  }
});

test("known ad hosts are blocked, lookalikes are not", () => {
  for (const domain of domains) {
    assert.equal(isAdUrl(`https://${domain}/creative`), true, domain);
    assert.equal(isAdUrl(`https://cdn.${domain}/a.js`), true, domain);
    assert.equal(isAdUrl(`https://not${domain}/a.js`), false, domain);
  }
});

test("path rules catch ad endpoints and leave the rest of the site alone", () => {
  assert.equal(isAdUrl("https://www.google.com/pagead/ads?x=1"), true);
  assert.equal(isAdUrl("https://www.google.com/aclk?sa=l"), true);
  assert.equal(isAdUrl("https://www.google.com/search?q=pagead"), false);
  assert.equal(isAdUrl("https://www.google.com/pageadvert"), false);
  assert.equal(isAdUrl("https://maps.googleapis.com/maps/api/js"), false);
  assert.equal(isAdUrl("https://imasdk.googleapis.com/js/sdkloader/ima3.js"), true);
  assert.equal(isAdUrl("https://www.youtube.com/get_midroll_2"), true);
  assert.equal(isAdUrl("https://www.youtube.com/watch?v=abc"), false);
  assert.equal(isAdUrl("https://news.example/article"), false);
  assert.equal(isAdUrl("https://socialmedia.net/post"), false);
});

test("popup policy blocks ads and click hijacks, and allows real popups", () => {
  assert.equal(
    shouldBlockPopup({
      enabled: false,
      openUrl: "https://doubleclick.net/a",
      pageUrl: page,
      clickedHref: null,
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      pageUrl: page,
      clickedHref: null,
    }),
    true
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      pageUrl: page,
      clickedHref: null,
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: null,
      pageUrl: page,
      clickedHref: null,
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "about:blank",
      pageUrl: page,
      clickedHref: "https://news.example/story/next",
    }),
    true
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://unknown-sponsor.test/landing",
      pageUrl: page,
      clickedHref: "https://news.example/story/next",
    }),
    true
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://news.example/story/next",
      pageUrl: page,
      clickedHref: "https://news.example/story/next#section",
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://news.example/preview",
      pageUrl: page,
      clickedHref: "https://news.example/story/next",
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://popads.net/show",
      pageUrl: page,
      clickedHref: "https://popads.net/show",
    }),
    true
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      pageUrl: page,
      clickedHref: "https://news.example/story#login",
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      pageUrl: page,
      clickKind: "control",
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://unknown-sponsor.test/landing",
      pageUrl: page,
      clickKind: "other",
    }),
    true
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://news.example/modal",
      pageUrl: page,
      clickKind: "other",
    }),
    false
  );
});

test("streamxtv-style popunders are blocked", () => {
  const site = "https://streamxtv.tech/watch/1";
  const popScript = "https://oo.iniquegearbox.com/rOQrKsD3puWAnFY/140399";
  assert.equal(isPopScriptUrl(popScript, site), true);
  assert.equal(isPopScriptUrl("https://hs.friseurash.com/t3UKJMz1tqqBM0/140275", site), true);
  assert.equal(isPopScriptUrl("https://streamxtv.tech/assets/index.js", site), false);
  assert.equal(isPopScriptUrl("https://cdn.example.com/static/app.js", site), false);
  assert.equal(isAdUrl(popScript), true);

  assert.equal(
    shouldBlockFormSubmit({
      enabled: true,
      action: "https://ads.example/landing",
      target: "_blank",
      pageUrl: site,
    }),
    true
  );
  assert.equal(
    shouldBlockFormSubmit({
      enabled: true,
      action: "https://streamxtv.tech/search",
      target: "_blank",
      pageUrl: site,
    }),
    false
  );

  assert.equal(
    shouldBlockNewTabAnchor({
      enabled: true,
      href: "https://sponsor.example/offer",
      target: "_blank",
      pageUrl: site,
      hidden: true,
    }),
    true
  );
  assert.equal(
    shouldBlockNewTabAnchor({
      enabled: true,
      href: "https://discord.gg/example",
      target: "_blank",
      pageUrl: site,
      hidden: false,
    }),
    false
  );

  assert.equal(
    shouldBlockPopup({
      enabled: true,
      openUrl: "https://sponsor.example/offer",
      pageUrl: site,
      clickKind: "control",
      viaFrame: true,
    }),
    true
  );
});

test("checked-in network rules match the blocklist", () => {
  const built = buildBlockeeRules(domains, paths);
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "../rules/ads.json"), "utf8"));
  assert.deepEqual(file, built);
  const covered = new Set(file.flatMap((rule) => rule.condition.requestDomains || []));
  assert.deepEqual([...covered], domains);
  assert.equal(file.some((rule) => rule.condition.urlFilter === "||google.com/pagead"), true);
  assert.equal(
    file.some((rule) => rule.condition.regexFilter === "^https?://[^/]+/[A-Za-z0-9_-]{10,}/[0-9]{5,7}/?($|[?])"),
    true
  );
  assert.equal(file.every((rule) => !rule.condition.resourceTypes.includes("main_frame")), true);
});
