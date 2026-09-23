const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const outDir = path.join(root, "dist");
const zipPath = path.join(outDir, "yarrow-" + manifest.version + ".zip");
const include = ["manifest.json", "background.js", "LICENSE", "content", "shared", "popup", "rules", "icons"];

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execFileSync("zip", ["-r", "-X", zipPath].concat(include), { cwd: root, stdio: "inherit" });
console.log(zipPath);
