// smejj.com — App-Routen duerfen nicht auf ausgelieferte Dateien zeigen.
//
// BEFUND live 2026-09-06: VIEW_PATHS.tools stand auf "/status". Neben der App
// liegt aber public/status.html, und GitHub Pages beantwortet /status mit
// genau dieser Datei (HTTP 200). Der SPA-Fallback aus 404.html kam damit nie
// zum Zug: die Ansicht "Systemzustand" war per Direktaufruf, per Lesezeichen
// und nach jedem Neuladen unerreichbar — man landete stumm auf der
// oeffentlichen Betriebsstatus-Seite. In der App selbst fiel es nicht auf,
// weil goToView die Adresse nur per pushState setzt und die Ansicht zeigt.
//
// Dieselbe Falle wartet auf jede kuenftige Route: wer eine Ansicht "/hilfe"
// nennt, waehrend public/hilfe.html existiert, baut sie unbemerkt wieder ein.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(wurzel, "public");

const { VIEW_PATHS, ALIAS_PATHS, PATH_VIEWS } = await import(
  new URL("../public/view-routes.js", import.meta.url).href
);

/** Womit wuerde GitHub Pages diesen Pfad beantworten, ohne den SPA-Fallback? */
function ausgelieferteDatei(pfad) {
  const rein = pfad.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!rein) return null; // "/" ist die Shell selbst — gewollt
  for (const kandidat of [`${rein}.html`, join(rein, "index.html")]) {
    if (existsSync(join(publicDir, kandidat))) return kandidat;
  }
  return null;
}

// GEWOLLTE Ueberdeckung: /profile hat eine eigenstaendige Seite
// (public/profile/index.html, "Konto & Einstellungen"), die denselben Inhalt
// zeigt wie die App-Ansicht #profile. Wer /profile aufruft oder in der Ansicht
// neu laedt, bekommt also dasselbe zu sehen — anders als bei /status, wo die
// verdeckende Seite (Betriebsstatus der Dienste) etwas ganz anderes zeigte als
// die Ansicht dahinter (Systemzustand der App).
//
// Neue Eintraege gehoeren NUR hierher, wenn die verdeckende Seite denselben
// Zweck erfuellt. Sonst ist die Route umzubenennen.
const GEWOLLT_VERDECKT = new Set(["/profile"]);

test("keine App-Route wird von einer echten Datei verdeckt", () => {
  const kollisionen = [];
  for (const [viewId, pfad] of [...Object.entries(VIEW_PATHS), ...Object.entries(ALIAS_PATHS)]) {
    if (GEWOLLT_VERDECKT.has(pfad)) continue;
    const datei = ausgelieferteDatei(pfad);
    if (datei) kollisionen.push(`${viewId} -> ${pfad} wird von public/${datei} verdeckt`);
  }
  assert.deepEqual(kollisionen, [], kollisionen.join("; "));
});

// Gegenprobe: der Waechter muss die Falle auch wirklich sehen. Ohne sie waere
// eine gruene Zeile kein Beweis, sondern nur eine leere Liste.
test("der Waechter erkennt eine verdeckte Route", () => {
  assert.ok(ausgelieferteDatei("/status"), "public/status.html verdeckt /status — das muss auffallen");
  assert.equal(ausgelieferteDatei("/systemzustand"), null, "die neue Adresse ist frei");
  assert.equal(ausgelieferteDatei("/gibtesnicht123"), null);
});

test("404.html kennt genau die Routen, die die App auch kennt", () => {
  const quelle = readFileSync(join(publicDir, "404.html"), "utf8");
  const block = quelle.match(/var ROUTES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, "ROUTES-Liste in 404.html nicht gefunden");
  const routen = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  // "/home" ist die Sonderbehandlung fuer die Startseite, sie hat keine Ansicht.
  const fehlend = Object.values(VIEW_PATHS)
    .filter((p) => p !== "/")
    .filter((p) => !routen.includes(p));
  assert.deepEqual(fehlend, [], `Direktaufruf zeigt die 404-Seite: ${fehlend.join(", ")}`);

  const unbekannt = routen
    .filter((p) => p !== "/home")
    .filter((p) => !PATH_VIEWS[p]);
  assert.deepEqual(unbekannt, [], `404.html leitet ins Leere: ${unbekannt.join(", ")}`);
});
