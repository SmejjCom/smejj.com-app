// smejj.com — jede HTML-Seite, die die App selbst anfordert, muss der lokale
// Server auch ausliefern.
//
// BEFUND 2026-08-17: public/maus-replay.html lag in public/, wurde live von
// GitHub Pages mit HTTP 200 ausgeliefert und vom Maus-Panel der Startseite per
// iframe geladen — stand aber nicht in der Erlaubnisliste von
// src/http/staticServing.js. Der lokale Server antwortete mit 404, das Panel
// zeigte eine leere weisse Flaeche, und die einzige Ansicht, die zeigt, WAS die
// Maus getan hat, war in der Entwicklung nicht pruefbar.
//
// Kein Test schlug fehl, weil kein Test die Frage stellte. Genau die stellt er
// jetzt — und zwar nicht fuer eine Datei, sondern fuer alle: was die App
// anfordert, muss erreichbar sein.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createStaticHandlers, EIGENE_EINBETTUNG_ERLAUBT } from "../src/http/staticServing.js";
import { ROUTES, SECURITY_HEADERS } from "../src/shared/platform.js";

const WURZEL = resolve(import.meta.dirname, "..");
const PUBLIC = join(WURZEL, "public");

const { isPublicAsset } = createStaticHandlers({
  publicDir: PUBLIC,
  storageSourceDir: join(WURZEL, "src/storage"),
  aiSourceDir: join(WURZEL, "src/ai"),
  sharedSourceDir: join(WURZEL, "src/shared")
});

// Wurzelrelative Verweise auf .html-Seiten in Markup und Skripten.
// Bewusst nur "/…": relative Pfade und externe Adressen sind nicht Sache
// dieses Servers.
const VERWEIS = /["'`](\/[A-Za-z0-9._\/-]+\.html)(?:\?[^"'`]*)?["'`]/g;

// Seiten, die absichtlich nicht ueber die Erlaubnisliste laufen: die
// Anmeldeseiten haben in src/server.js eigene, engere Regeln.
const EIGENE_REGEL = new Set(["/auth/login/index.html", "/auth/register/index.html"]);

function dateien(wurzel) {
  const gefunden = [];
  const lauf = (pfad) => {
    for (const name of readdirSync(pfad)) {
      if (name.startsWith(".")) continue;
      const voll = join(pfad, name);
      if (statSync(voll).isDirectory()) lauf(voll);
      else if (/\.(html|js)$/.test(name)) gefunden.push(voll);
    }
  };
  lauf(wurzel);
  return gefunden;
}

test("jede angeforderte HTML-Seite, die es wirklich gibt, ist ausliefarbar", () => {
  const fehlend = new Map();
  for (const datei of dateien(PUBLIC)) {
    for (const treffer of readFileSync(datei, "utf8").matchAll(VERWEIS)) {
      const pfad = treffer[1];
      if (EIGENE_REGEL.has(pfad)) continue;
      // Nur Seiten pruefen, die tatsaechlich in public/ liegen. Ein Verweis
      // ins Leere ist ein anderer Fehler und gehoert nicht hierher.
      if (!existsSync(join(PUBLIC, pfad.slice(1)))) continue;
      if (isPublicAsset(pfad)) continue;
      if (!fehlend.has(pfad)) fehlend.set(pfad, []);
      fehlend.get(pfad).push(datei.replace(`${WURZEL}/`, ""));
    }
  }
  assert.equal(
    fehlend.size,
    0,
    `Diese Seiten werden angefordert, liegen in public/, liefert der lokale Server aber mit 404 aus:\n`
      + [...fehlend].map(([p, q]) => `  ${p}  (verlangt von ${q.join(", ")})`).join("\n")
  );
});

test("die Maus-Wiedergabe ist ausliefarbar — sie ist die einzige Ansicht der Laeufe", () => {
  assert.ok(isPublicAsset(ROUTES.mausReplay));
});

// Die Ausnahme muss eine Ausnahme bleiben. Waechst diese Menge, waechst die
// Angriffsflaeche fuers Clickjacking — dann soll jemand hinsehen muessen.
test("nur die Maus-Wiedergabe darf von der eigenen Herkunft gerahmt werden", () => {
  assert.deepEqual([...EIGENE_EINBETTUNG_ERLAUBT], [ROUTES.mausReplay]);
  // Die allgemeine Regel bleibt das Verbot: die Lockerung entsteht nur durch
  // Ersetzen dieser Zeichenkette, nie durch ihr Fehlen.
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
});
