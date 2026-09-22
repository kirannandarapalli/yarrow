const fs = require("fs");
const path = require("path");

require("../shared/blocklist.js");
require("../shared/trackers.js");
const { buildBlockeeRules } = require("../shared/rules.js");

const rules = buildBlockeeRules(globalThis.BLOCKEE_AD_DOMAINS, globalThis.BLOCKEE_AD_PATHS);
const out = path.join(__dirname, "../rules/ads.json");
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + "\n");
console.log(`Wrote ${rules.length} ad rules to ${out}`);

const trackerRules = buildBlockeeRules(globalThis.BLOCKEE_TRACKERS, [], { popScripts: false });
const trackerOut = path.join(__dirname, "../rules/trackers.json");
fs.writeFileSync(trackerOut, JSON.stringify(trackerRules, null, 2) + "\n");
console.log(`Wrote ${trackerRules.length} tracker rules to ${trackerOut}`);
