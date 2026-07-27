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
  // Schreibweise am 2026-07-27 nachgezogen: der Pfad wird jetzt einmal zentral
  // normalisiert (location.pathname.replace(/\/+$/, "")) und danach verglichen.
  // Die Zusicherung ist unveraendert — /home leitet ohne Restore auf Root.
  assert.match(notFound, /path === "\/home"/);
  assert.match(notFound, /location\.replace\("\/"\);\s*\n\s*return;/);
  assert.match(app, /start:\s*"\/"/);
  assert.match(app, /home:\s*"\/"/);
  assert.doesNotMatch(app, /start:\s*"\/home"/);
});

test("nur bekannte App-Routen werden zur Shell umgeleitet, Tippfehler zeigen die 404-Seite", () => {
  // QA-Welle 1, Befund F-05: Vorher galt "jeder Pfad ohne Punkt ist eine
  // App-Route". Ein Vertipper (/gibtesnicht123) landete dadurch in der App,
  // fand keine Ansicht und bekam die generische Fehlerseite "Aktion blockiert"
  // mit Kosten-/Provider-Text. Die echte 404-Seite war unerreichbar.
  assert.match(notFound, /var ROUTES = \[/);
  assert.match(notFound, /ROUTES\.indexOf\(path\) === -1/);
  // Jede in app.js gefuehrte App-Route muss in der Whitelist stehen, sonst
  // zeigt ihr Direktaufruf ploetzlich die 404-Seite.
  for (const route of SPA_ROUTES) {
    assert.ok(
      notFound.includes(`"${route}"`),
      `App-Route ${route} fehlt in der ROUTES-Whitelist von 404.html.`
    );
  }
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
