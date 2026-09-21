// smejj.com — das PWA-Offline-Messwerkzeug zaehlt den RICHTIGEN Speicher.
//
// BEFUND F10 (2026-09-14): scripts/diagnose/pwa-offline.mjs meldete
// "dateien: 12", waehrend smejj-shell-v871 live 235 Eintraege hatte. Die 12
// sind WILLKOMMEN_SHELL: der erste, unangemeldete Aufruf landet auf der
// Werbeseite, die den schmalen Service Worker registriert. Das Werkzeug
// summierte alle Speicher und brach beim ersten Eintrag ab.
//
// Ohne den Fix ist dieser Test rot: das Modul pwa-cache-zaehlung.mjs gab es
// nicht, und das Werkzeug summierte "for (const n of namen) ... dateien +=".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  KERN_PFADE, aktiverShellCache, cacheNameAusSw, shellListeAusSw, zaehleShellCache,
} from "../scripts/diagnose/pwa-cache-zaehlung.mjs";

const sw = fs.readFileSync("public/sw.js", "utf8");
const werkzeug = fs.readFileSync("scripts/diagnose/pwa-offline.mjs", "utf8");
const shell = shellListeAusSw(sw);
const cacheName = cacheNameAusSw(sw);
const willkommenName = cacheName.replace("smejj-shell-", "smejj-willkommen-");
const alsUrls = (liste) => liste.map((e) => new URL(e, "https://smejj.com").href);

test("sw.js liefert Cache-Name und eine volle Precache-Liste mit den Kern-Dateien", () => {
  assert.match(cacheName, /^smejj-shell-v\d+$/);
  assert.ok(shell.length > 200, `SHELL hat ${shell.length} Eintraege — erwartet die ganze App`);
  for (const pfad of KERN_PFADE) assert.ok(shell.includes(pfad), `${pfad} fehlt in SHELL`);
});

test("Anfuehrungszeichen in Kommentaren des SHELL-Blocks sind keine Eintraege", () => {
  // Zeile 214 von sw.js: // ... (Einstellungen "API" + ... — ein naiver
  // "alles in Anfuehrungszeichen"-Abzug zaehlte 236 und meldete /API als fehlend.
  assert.ok(!shell.includes("API"), "Kommentar-Wort als Eintrag");
  for (const e of shell) assert.ok(e.startsWith("/"), `kein Pfad: ${e}`);
  assert.equal(new Set(shell).size, shell.length, "kein Eintrag doppelt (cache.addAll ist alles oder nichts)");
  assert.deepEqual(shellListeAusSw('const SHELL = [\n  "/a.js",\n  // ein "Wort" im Kommentar\n  "/b.css", // Hinweis\n];\n'), ["/a.js", "/b.css"]);
});

test("der schmale Willkommen-Speicher zaehlt NICHT als Shell-Cache", () => {
  const willkommen = [...sw.match(/const WILLKOMMEN_SHELL = \[([\s\S]*?)\n\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // Die ZAHL ist nicht die Zusicherung: die Landeseite bekommt hin und wieder
  // ein Modul dazu (12 am 13.09., 14 am 21.09.). Zugesichert ist, dass der
  // schmale Speicher KLEIN bleibt und nicht als Shell-Cache durchgeht — sonst
  // meldete die App "offline bereit", obwohl die halbe Anwendung fehlt.
  assert.ok(willkommen.length >= 10 && willkommen.length <= 25,
    `schmaler Speicher hat ${willkommen.length} Dateien — das ist keine Landeseite mehr`);
  assert.ok(willkommen.length < shell.length / 5, "der schmale Speicher darf nie in die Naehe der Shell kommen");
  assert.equal(aktiverShellCache([willkommenName]), null);
  const z = zaehleShellCache({ [willkommenName]: alsUrls(willkommen) }, shell);
  assert.equal(z.aktiverCache, null);
  assert.equal(z.dateien, 0, "nichts vom schmalen Speicher mitzaehlen");
  assert.equal(z.vollstaendig, false);
  assert.ok(z.kernFehlt.includes("/assets/app.js"));
});

test("liegen beide Speicher vor, zaehlt nur der Shell-Cache — und zwar vollstaendig", () => {
  const z = zaehleShellCache({
    [willkommenName]: alsUrls(["/willkommen.html", "/favicon.ico"]),
    [cacheName]: alsUrls(shell),
  }, shell);
  assert.equal(z.aktiverCache, cacheName);
  assert.equal(z.dateien, shell.length);
  assert.equal(z.erwartet, shell.length);
  assert.deepEqual(z.fehlend, []);
  assert.deepEqual(z.kernFehlt, []);
  assert.equal(z.vollstaendig, true);
});

test("fehlt eine Kern-Datei oder ein Precache-Eintrag, ist der Speicher nicht vollstaendig", () => {
  const ohneApp = alsUrls(shell.filter((e) => e !== "/assets/app.js" && e !== "/assets/start-styles.css"));
  const z = zaehleShellCache({ [cacheName]: ohneApp }, shell);
  assert.equal(z.dateien, shell.length - 2);
  assert.deepEqual(z.kernFehlt, ["/assets/app.js", "/assets/start-styles.css"]);
  assert.deepEqual(z.fehlend, ["/assets/start-styles.css", "/assets/app.js"].sort((a, b) => shell.indexOf(a) - shell.indexOf(b)));
  assert.equal(z.vollstaendig, false);
});

test("bei mehreren Shell-Caches gilt der hoechste; ?v-Marken stoeren den Abgleich nicht", () => {
  assert.equal(aktiverShellCache(["smejj-shell-v870", "smejj-willkommen-v871", "smejj-shell-v871"]), "smejj-shell-v871");
  const z = zaehleShellCache({ "smejj-shell-v871": ["https://smejj.com/assets/app.js?v=9"] }, ["/assets/app.js?v=9"]);
  assert.deepEqual(z.fehlend, []);
});

test("das Werkzeug benutzt die Zaehlweise und summiert nicht mehr ueber alle Speicher", () => {
  assert.match(werkzeug, /from "\.\/pwa-cache-zaehlung\.mjs"/);
  assert.match(werkzeug, /zaehleShellCache\(/);
  assert.match(werkzeug, /shellListeAusSw\(/);
  assert.doesNotMatch(werkzeug, /dateien \+= \(await c\.keys\(\)\)\.length/, "alte Summe ueber alle Caches");
  assert.doesNotMatch(werkzeug, /if \(voll > 0\) break;/, "alte Warteschleife brach beim schmalen Speicher ab");
});
