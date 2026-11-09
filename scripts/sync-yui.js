// Copy the pinned yui release (devDependency) into public/vendor/yui so the app keeps serving static
// files only from public/. Run `npm run ui:sync` after changing the yui version in package.json.
const fs = require("fs");
const path = require("path");

const source = path.join(path.dirname(require.resolve("@yumi233/yui/package.json")), "dist");
const target = path.join(__dirname, "..", "public", "vendor", "yui");
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(target, file));
console.log(`yui ${require("@yumi233/yui/package.json").version} → public/vendor/yui`);
