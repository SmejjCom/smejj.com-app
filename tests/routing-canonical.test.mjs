// smejj.com — Schutztests fuer GitHub-Pages-Routing, Deep-Link-Restore und Canonical.
// Hintergrund (Live-Audit 2026-07-03): App-Routen liefern auf GitHub Pages HTTP 404;
// 404.html leitet zur Shell um. Deshalb gilt:
// 1. 404.html muss die angefragte Route in sessionStorage ablegen.
// 2. app.js muss diese Route beim Boot wieder anwenden (Deep-Link-Restore).
// 3. Der Canonical darf NIE auf eine server-seitige 404-URL zeigen (immer "/").
// 4. Die Sitemap darf nur URLs enthalten, die wirklich HTTP 200 liefern.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("public/app.js", "utf8");
const notFound = fs.readFileSync("public/404.html", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");

const RESTORE_KEY = "smejj-restore-route";
const SPA_ROUTES = [
  "/search",
  "/websites",
  "/projects",
  "/files",
  "/storage",
  "/ai",
  "/cost",
  "/settings",
  "/profile"
];

test("404.html speichert die angefragte App-Route fuer den SPA-Fallback", () => {
  assert.match(notFound, new RegExp(`sessionStorage\\.setItem\\("${RESTORE_KEY}"`));
  assert.match(notFound, /location\.replace\("\/"\)/);
});

test("/home wird nicht als Hauptseite restauriert, sondern sauber auf Root geleitet", () => {
  assert.match(notFound, /path\.replace\(\/\\\/\$\/,\s*""\) === "\/home"/);
  assert.match(notFound, /location\.replace\("\/"\);\s*\n\s*return;/);
  assert.match(app, /start:\s*"\/"/);
  assert.match(app, /home:\s*"\/"/);
  assert.doesNotMatch(app, /start:\s*"\/home"/);
});

test("app.js wendet die gespeicherte Restore-Route beim Boot an (Deep-Link-Restore)", () => {
  assert.match(app, new RegExp(`sessionStorage\\.getItem\\("${RESTORE_KEY}"\\)`));
  assert.match(app, new RegExp(`sessionStorage\\.removeItem\\("${RESTORE_KEY}"\\)`));
  assert.match(app, /applyPendingRestoreRoute\(\);\s*\n\s*restoreViewFromUrl\(\);/);
  // Nur same-origin Pfade duerfen uebernommen werden (kein "//host"-Redirect).
  assert.match(app, /pending\.startsWith\("\/"\) && !pending\.startsWith\("\/\/"\)/);
});

test("Canonical zeigt nie auf eine 404-App-Route (immer Root-URL)", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/smejj\.com\/">/);
  assert.match(app, /canonical\.href = "https:\/\/smejj\.com\/"/);
  // Kein dynamischer Canonical mit Pfad-Interpolation mehr:
  assert.doesNotMatch(app, /canonical\.href = `https:\/\/smejj\.com\$\{/);
});

test("Sitemap enthaelt keine server-seitigen 404-Routen", () => {
  for (const route of SPA_ROUTES) {
    assert.doesNotMatch(
      sitemap,
      new RegExp(`<loc>https://smejj\\.com${route.replace(/\//g, "\\/")}</loc>`),
      `SPA-Route ${route} darf nicht in der Sitemap stehen (liefert HTTP 404).`
    );
  }
  assert.match(sitemap, /<loc>https:\/\/smejj\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/smejj\.com\/impressum\.html<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/smejj\.com\/datenschutz\.html<\/loc>/);
});
