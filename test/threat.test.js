const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

require("../shared/trackers.js");
const { assessThreat, pageParts } = require("../shared/threat.js");
const { buildBlockeeRules } = require("../shared/rules.js");

const trackers = globalThis.BLOCKEE_TRACKERS;

test("tracker domains are sorted and unique", () => {
  assert.deepEqual(trackers, trackers.slice().sort());
  assert.equal(new Set(trackers).size, trackers.length);
});

test("tracker rules match the checked-in file and do not include pop-under rules", () => {
  const built = buildBlockeeRules(trackers, [], { popScripts: false });
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "../rules/trackers.json"), "utf8"));
  assert.deepEqual(file, built);
  assert.equal(file.some((rule) => rule.condition.regexFilter), false);
  assert.equal(file.some((rule) => (rule.condition.requestDomains || []).includes("google-analytics.com")), true);
});

test("ordinary sites and streamxtv are not treated as malicious", () => {
  assert.equal(assessThreat("https://streamxtv.tech/watch/1").malicious, false);
  assert.equal(assessThreat("https://www.paypal.com/signin").malicious, false);
  assert.equal(assessThreat("https://login.microsoftonline.com/").malicious, false);
  assert.equal(assessThreat("https://steam-news.com/article").malicious, false);
  assert.equal(assessThreat("https://192.168.1.20/").malicious, false);
});

test("phishing lookalikes, raw IPs, and threat lists are malicious", () => {
  const paypal = assessThreat("https://paypal.evil.example/login");
  assert.equal(paypal.malicious, true);
  assert.match(paypal.reason, /paypal/);

  const secure = assessThreat("https://secure-paypal-login.xyz/account");
  assert.equal(secure.malicious, true);

  const ip = assessThreat("http://8.8.8.8/login");
  assert.equal(ip.malicious, true);
  assert.match(ip.reason, /IP/);

  const disguised = assessThreat("https://xn--pypal-4ve.com/");
  assert.equal(disguised.malicious, true);

  const parts = pageParts("https://phish.example/steal?id=1");
  const listed = assessThreat("https://phish.example/steal?id=1", {
    urls: [parts.key],
    hosts: ["malware.example"],
  });
  assert.equal(listed.malicious, true);
  assert.match(listed.reason, /phishing/);

  const hostHit = assessThreat("https://drop.malware.example/file", {
    hosts: ["malware.example"],
  });
  assert.equal(hostHit.malicious, true);
  assert.match(hostHit.reason, /malware/);
});
