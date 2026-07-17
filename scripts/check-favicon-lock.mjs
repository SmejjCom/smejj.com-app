#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MANIFEST_PATH = "docs/frontend/favicon-lock-manifest.json";
const ASSET_FILES = [
  "public/favicon.ico",
  "public/icons/smejj_favicon.svg",
  "public/icons/favicon-16x16.png",
  "public/icons/favicon-32x32.png",
  "public/icons/favicon-48x48.png",
  "public/apple-touch-icon.png"
];
const SOURCE_FILES = [
  "scripts/branding/generate-brand-assets.mjs",
  "scripts/i18n/generate-language-pages.mjs",
  "scripts/i18n/locales.json"
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walkHtml(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkHtml(target);
    return entry.isFile() && entry.name.endsWith(".html") ? [target] : [];
  });
}

function faviconLinks(file) {
  const html = fs.readFileSync(file, "utf8");
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag.trim())
    .filter((tag) => /\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(tag));
}

function currentState() {
  const references = Object.fromEntries(
    walkHtml("public").sort().map((file) => [file, faviconLinks(file)]).filter(([, links]) => links.length > 0)
  );
  const webManifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  return {
    assets: Object.fromEntries(ASSET_FILES.map((file) => [file, sha256(file)])),
    sources: Object.fromEntries(SOURCE_FILES.map((file) => [file, sha256(file)])),
    htmlHeadReferences: references,
    webManifestIcons: webManifest.icons
  };
}

if (process.argv.includes("--print-manifest")) {
  console.log(JSON.stringify({
    schemaVersion: 1,
    frozenAt: new Date().toISOString(),
    approval: "Das Browser-Favicon ist jetzt final und funktioniert einwandfrei. Bitte behandle es ab sofort als geschützt und unveränderlich.",
    ...currentState()
  }, null, 2));
  process.exit(0);
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`favicon-lock FEHLER: ${MANIFEST_PATH} fehlt.`);
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const actual = currentState();
const violations = [];
for (const key of ["assets", "sources", "htmlHeadReferences", "webManifestIcons"]) {
  if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) violations.push(key);
}

if (violations.length > 0) {
  console.error(`favicon-lock VERLETZT: ${violations.join(", ")}.`);
  console.error("Keine Änderung ausführen oder freigeben. Zuerst ist eine neue ausdrückliche schriftliche Nutzerbestätigung erforderlich.");
  process.exit(1);
}

console.log(`favicon-lock OK — ${Object.keys(actual.assets).length} Dateien, ${Object.keys(actual.htmlHeadReferences).length} HTML-Seiten, Web-Manifest und Generatorquellen unverändert.`);
