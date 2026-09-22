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
