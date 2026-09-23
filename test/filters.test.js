const test = require("node:test");
const assert = require("node:assert/strict");

const { buildFeedRules, parseFilterList } = require("../shared/filters.js");
const { extractArticleBody, looksLikeAdblockWall, looksLikeAnnoyance, shouldFillArticle, shouldUnlockScroll, usableSelector, youtubeAdAction } = require("../shared/guards.js");
const { stripYoutubeAds } = require("../shared/youtube.js");

const SAMPLE = `
! comment
||ads.example.com^
||tracker.example.net^$third-party
@@||ads.example.com^
||youtube.com^
||googlevideo.com^
||adservice.google.com^
news.example##.sponsor-box
##.generic-ad
||not a domain^
`;

test("public lists keep ad domains and leave youtube video hosts alone", () => {
  const parsed = parseFilterList(SAMPLE);
  assert.deepEqual(parsed.block.sort(), ["adservice.google.com", "tracker.example.net"]);
  assert.deepEqual(parsed.allow, ["ads.example.com"]);
  assert.deepEqual(parsed.cosmetic, [{ host: "news.example", selector: ".sponsor-box" }]);
});

test("feed blocks sit below a personal allow and a paused site", () => {
  const rules = buildFeedRules(
    { ads: { block: ["ads.example"], allow: ["keep.example"] }, tracking: { block: [], allow: [] } },
    { enabled: true, trackingEnabled: false, annoyancesEnabled: false },
    ["script"]
  );
  const block = rules.find((rule) => rule.action.type === "block");
  const allow = rules.find((rule) => rule.action.type === "allow");
  assert.equal(block.priority, 10);
  assert.equal(allow.priority, 100);
  assert.deepEqual(block.condition.requestDomains, ["ads.example"]);
  assert.equal(block.condition.resourceTypes.includes("main_frame"), false);
  assert.equal(rules.some((rule) => (rule.condition.requestDomains || []).includes("keep.example") && rule.action.type === "block"), false);
});

test("walls, cookie popups, and youtube ads are recognized", () => {
  assert.equal(looksLikeAdblockWall("Please disable your ad blocker to continue"), true);
  assert.equal(looksLikeAdblockWall("A long article about the history of newspapers ".repeat(20)), false);
  assert.equal(looksLikeAnnoyance("We use cookies. Accept all cookies"), true);
  assert.equal(looksLikeAnnoyance("The recipe needs flour"), false);
  assert.equal(youtubeAdAction({ adShowing: true, hasSkipButton: true, duration: 15, currentTime: 1 }), "skip");
  assert.equal(youtubeAdAction({ adShowing: true, hasSkipButton: false, duration: 15, currentTime: 1 }), "seek");
  assert.equal(youtubeAdAction({ adShowing: false, hasSkipButton: true, duration: 200, currentTime: 1 }), "none");
  const articleJson = '"articleBody":"For years, the ideal Indian holiday came with a checklist.\\n\\n' + "A".repeat(420) + '",\n"author":';
  const article = extractArticleBody(articleJson);
  assert.equal(article.startsWith("For years, the ideal Indian holiday"), true);
  assert.equal(shouldFillArticle("For a growing number of Indian travellers, the perfect holiday is shorter.", article), true);
  assert.equal(shouldFillArticle(article, article), false);
  assert.equal(shouldUnlockScroll({ locked: true, visibleBlocker: false }), true);
  assert.equal(shouldUnlockScroll({ locked: true, visibleBlocker: true }), false);
  assert.equal(shouldUnlockScroll({ locked: false, visibleBlocker: false }), false);
  assert.equal(usableSelector(".sponsor-box"), ".sponsor-box");
  assert.equal(usableSelector("body { background: url(https://evil) }"), null);
});

test("youtube player data loses ads and keeps the real video", () => {
  const data = {
    videoDetails: { title: "Real video" },
    adPlacements: [{ adPlacementRenderer: { id: 1 } }],
    playerAds: [{ id: 2 }],
    contents: [{ videoRenderer: { videoId: "abc" } }, { adSlotRenderer: { id: 3 } }, { promotedVideoRenderer: { id: 4 } }],
  };
  stripYoutubeAds(data);
  assert.equal(data.videoDetails.title, "Real video");
  assert.equal(data.adPlacements, undefined);
  assert.equal(data.playerAds, undefined);
  assert.deepEqual(data.contents, [{ videoRenderer: { videoId: "abc" } }]);
  const wrapped = { player_response: JSON.stringify({ videoDetails: { title: "Nested" }, adPlacements: [{ id: 1 }] }) };
  stripYoutubeAds(wrapped);
  assert.equal(JSON.parse(wrapped.player_response).adPlacements, undefined);
  assert.equal(JSON.parse(wrapped.player_response).videoDetails.title, "Nested");
});
