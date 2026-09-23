const test = require("node:test");
const assert = require("node:assert/strict");

const { applyListChange, buildSiteRules, isSitePaused, normalizeDomain, togglePaused, toolbarMode } = require("../shared/sites.js");

test("domains are normalized from pasted urls", () => {
  assert.equal(normalizeDomain("https://www.Ads.Example.com/path"), "ads.example.com");
  assert.equal(normalizeDomain("not a domain"), null);
  assert.equal(normalizeDomain("localhost"), null);
});

test("pausing a site only affects that site", () => {
  const first = togglePaused([], "https://www.streamxtv.tech/watch/1");
  assert.equal(first.ok, true);
  assert.equal(first.paused, true);
  assert.deepEqual(first.pausedSites, ["streamxtv.tech"]);
  assert.equal(isSitePaused("https://player.streamxtv.tech/embed", first.pausedSites), true);
  assert.equal(isSitePaused("https://example.com", first.pausedSites), false);
  const second = togglePaused(first.pausedSites, "streamxtv.tech");
  assert.equal(second.paused, false);
  assert.deepEqual(second.pausedSites, []);
});

test("allow and block lists stay exclusive and sorted", () => {
  const blocked = applyListChange({ allowList: ["keep.example"], blockList: [] }, "block", "https://tracker.test/a");
  assert.deepEqual(blocked.blockList, ["tracker.test"]);
  const allowed = applyListChange(blocked, "allow", "tracker.test");
  assert.deepEqual(allowed.blockList, []);
  assert.deepEqual(allowed.allowList, ["keep.example", "tracker.test"]);
  const removed = applyListChange(allowed, "remove-allow", "keep.example");
  assert.deepEqual(removed.allowList, ["tracker.test"]);
  assert.equal(applyListChange({ allowList: [], blockList: [] }, "block", "nope").ok, false);
});

test("the toolbar icon follows pause and a full off switch", () => {
  assert.equal(toolbarMode({ enabled: true, paused: false, malicious: false }), "on");
  assert.equal(toolbarMode({ enabled: true, paused: true, malicious: false }), "paused");
  assert.equal(toolbarMode({ enabled: false, paused: false, malicious: false }), "off");
  assert.equal(toolbarMode({ enabled: true, paused: false, malicious: true }), "bad");
});

test("the toolbar badge shows the blocked count while blocking is on", () => {
  const { badgeText } = require("../shared/sites.js");
  assert.equal(badgeText("on", 0), "0");
  assert.equal(badgeText("on", 12), "12");
  assert.equal(badgeText("on", 10000), "9999");
  assert.equal(badgeText("paused", 4), "OFF");
  assert.equal(badgeText("off", 4), "OFF");
  assert.equal(badgeText("bad", 4), "!");
});

test("the block log keeps one row per domain", () => {
  const { rememberLog } = require("../shared/sites.js");
  const first = rememberLog([], "https://ads.example/a");
  const second = rememberLog(first, "https://ads.example/b");
  const third = rememberLog(second, "https://pixel.test/c");
  assert.deepEqual(third.map((item) => item.domain), ["ads.example", "pixel.test"]);
  assert.equal(rememberLog(third, "not a url").length, 2);
});

test("a backup round-trips lists and switches", () => {
  const { backupSettings, importSettings } = require("../shared/sites.js");
  const backup = backupSettings({
    enabled: false,
    sponsorsEnabled: false,
    allowList: ["https://keep.example/a"],
    blockList: ["keep.example", "ads.example"],
    pausedSites: ["streamxtv.tech"],
    hiddenElements: [{ host: "news.example", selector: "#sponsor" }, { host: "nope", selector: "#" }],
  });
  assert.equal(backup.yarrow, 1);
  assert.equal(backup.enabled, false);
  assert.equal(backup.sponsorsEnabled, false);
  assert.deepEqual(backup.allowList, ["keep.example"]);
  assert.deepEqual(backup.blockList, ["ads.example"]);
  assert.deepEqual(backup.hiddenElements, [{ host: "news.example", selector: "#sponsor" }]);
  const imported = importSettings(backup);
  assert.equal(imported.ok, true);
  assert.equal(imported.settings.enabled, false);
  assert.equal(importSettings({ yarrow: 2 }).ok, false);
  assert.equal(importSettings(null).ok, false);
});

test("custom rules let a paused site and an allowed domain through", () => {
  const rules = buildSiteRules(
    { blockList: ["ads.example"], allowList: ["ads.example"], pausedSites: ["streamxtv.tech"] },
    ["script", "image"]
  );
  const block = rules.find((rule) => rule.action.type === "block");
  const allow = rules.find((rule) => rule.action.type === "allow" && rule.condition.requestDomains);
  const pause = rules.find((rule) => rule.condition.initiatorDomains);
  assert.ok(allow.priority > block.priority);
  assert.ok(pause.priority > allow.priority);
  assert.deepEqual(pause.condition.initiatorDomains, ["streamxtv.tech"]);
  assert.equal(block.condition.resourceTypes.includes("main_frame"), true);
});
