// Der Abbild-Waechter — und der Nachweis, dass er echte Fehler SIEHT.
//
// Ein Waechter, der nur "OK" sagt, ist gefaehrlicher als gar keiner: er
// unterschreibt ein kaputtes Abbild. Die Faelle hier fuettern ihn deshalb
// bewusst mit kaputten Eingaben und verlangen, dass er Alarm schlaegt.
//
// Der erste Anlauf dieses Skripts am 07.09. fand 41 statt 59 Dateien, weil sein
// Muster mehrzeilige Importbloecke uebersah. Kein Test haette das gemerkt, wenn
// er nur gegen ein gesundes Abbild geprueft haette.

import test from "node:test";
import assert from "node:assert/strict";

import {
  importbaum,
  istAbgedeckt,
  kopiertePfade,
  pruefeDienst,
  vonDockerignoreAusgeschlossen
} from "../scripts/check/abbild-importbaum.mjs";

/** Bau eine kleine Welt aus Dateien im Speicher. */
function welt(dateien) {
  const wurzel = "/repo";
  return {
    wurzel,
    lies: (p) => {
      const rel = p.startsWith(wurzel + "/") ? p.slice(wurzel.length + 1) : p;
      if (!(rel in dateien)) throw new Error(`nicht da: ${rel}`);
      return dateien[rel];
    },
    gibtEs: (p) => {
      const rel = p.startsWith(wurzel + "/") ? p.slice(wurzel.length + 1) : p;
      return rel in dateien;
    }
  };
}

// --- Importbaum --------------------------------------------------------------

test("MEHRZEILIGE Importbloecke werden gefunden — daran ist der erste Anlauf gescheitert", () => {
  const w = welt({
    "start.mjs": 'import {\n  eins,\n  zwei\n} from "./tief/modul.js";\n',
    "tief/modul.js": 'export const eins = 1; export const zwei = 2;\n'
  });
  const { dateien } = importbaum("start.mjs", w);
  assert.deepEqual(dateien, ["start.mjs", "tief/modul.js"]);
});

test("dynamische Importe zaehlen mit — sie stuerzen erst mitten im Betrieb ab", () => {
  const w = welt({
    "start.mjs": 'async function f() { const m = await import("./spaet.js"); return m; }\n',
    "spaet.js": "export const x = 1;\n"
  });
  assert.ok(importbaum("start.mjs", w).dateien.includes("spaet.js"));
});

test("ein Import ins Leere wird gemeldet, nicht verschwiegen", () => {
  const w = welt({ "start.mjs": 'import x from "./gibtsnicht.js";\n' });
  const { fehlend } = importbaum("start.mjs", w);
  assert.deepEqual(fehlend, ["gibtsnicht.js"]);
});

test("Zyklen fuehren nicht in eine Endlosschleife", () => {
  const w = welt({ "a.js": 'import "./b.js";', "b.js": 'import "./a.js";' });
  assert.equal(importbaum("a.js", w).dateien.length, 2);
});

test("Pakete aus node_modules werden NICHT verfolgt", () => {
  const w = welt({ "start.mjs": 'import http from "node:http";\nimport x from "express";\n' });
  assert.deepEqual(importbaum("start.mjs", w).dateien, ["start.mjs"]);
});

// --- COPY-Zeilen -------------------------------------------------------------

test("COPY-Quellen werden gelesen, das Ziel nicht als Quelle verwechselt", () => {
  const pfade = kopiertePfade([
    "FROM node:22-slim",
    "COPY package.json ./",
    "COPY workers/smejj-lora-loop ./workers/smejj-lora-loop",
    "COPY --chown=node:node src ./src"
  ].join("\n"));
  assert.deepEqual(pfade, ["package.json", "workers/smejj-lora-loop", "src"]);
});

test("ein Ordner deckt alles unter sich ab, eine Datei nur sich selbst", () => {
  assert.equal(istAbgedeckt("src/a/b.js", ["src"]), true);
  assert.equal(istAbgedeckt("src/a/b.js", ["src/a/b.js"]), true);
  assert.equal(istAbgedeckt("srcx/a.js", ["src"]), false, "Praefix-Verwechslung: srcx ist nicht src");
  assert.equal(istAbgedeckt("src/a/b.js", ["lib"]), false);
});

// --- .dockerignore -----------------------------------------------------------

test("erkennt eine Datei, die .dockerignore aus dem Bau-Kontext sperrt", () => {
  // Genau die Falle vom 01.08.: "workers/*" schliesst alles Neue stumm aus.
  const zeilen = ["node_modules", "workers/*", "!workers/con-autopilot", "!workers/con-autopilot/**"];
  assert.equal(vonDockerignoreAusgeschlossen("workers/smejj-lora-loop/worker.mjs", zeilen), true);
  assert.equal(vonDockerignoreAusgeschlossen("workers/con-autopilot/salad.js", zeilen), false);
});

test("die LETZTE passende Regel entscheidet — wie bei Docker", () => {
  assert.equal(vonDockerignoreAusgeschlossen("scripts/training/x.mjs", ["scripts/*", "!scripts/training", "!scripts/training/**"]), false);
  assert.equal(vonDockerignoreAusgeschlossen("scripts/training/x.mjs", ["!scripts/training", "scripts/*"]), true);
});

test("unbekannte Glob-Muster werden uebersprungen statt falsch gedeutet", () => {
  // Lieber nichts melden als etwas Falsches: ein Waechter, der raet, faellt
  // genau dort um, wo es darauf ankommt.
  assert.equal(vonDockerignoreAusgeschlossen("a/b/c.js", ["a/*/c.js"]), false);
  assert.equal(vonDockerignoreAusgeschlossen("a/b.js", ["*.xlsx"]), false);
});

// --- Das Gesamturteil --------------------------------------------------------

test("ein Dockerfile mit fehlender COPY-Zeile FAELLT DURCH", () => {
  // Der con-Autopilot starb am 04.09. an genau einer fehlenden Zeile (hash.js)
  // und antwortete 502, ohne dass im Bau-Protokoll ein Fehler stand.
  const w = welt({
    "Dockerfile.test": "FROM node:22\nCOPY workers/dienst ./workers/dienst\n",
    ".dockerignore": "node_modules\n",
    "workers/dienst/start.mjs": 'import { h } from "../../lib/hash.js";\n',
    "lib/hash.js": "export const h = 1;\n"
  });
  const b = pruefeDienst({ dockerfile: "Dockerfile.test", einstieg: "workers/dienst/start.mjs" }, w);
  assert.equal(b.ok, false);
  assert.deepEqual(b.fehlerhaft, ["lib/hash.js"]);
});

test("ein Dockerfile, das alles kopiert, besteht", () => {
  const w = welt({
    "Dockerfile.test": "FROM node:22\nCOPY workers/dienst ./workers/dienst\nCOPY lib ./lib\n",
    ".dockerignore": "node_modules\n",
    "workers/dienst/start.mjs": 'import { h } from "../../lib/hash.js";\n',
    "lib/hash.js": "export const h = 1;\n"
  });
  assert.equal(pruefeDienst({ dockerfile: "Dockerfile.test", einstieg: "workers/dienst/start.mjs" }, w).ok, true);
});

test("eine ausgesperrte Datei FAELLT DURCH, obwohl die COPY-Zeile da ist", () => {
  // Der heimtueckischere Fall: COPY steht im Dockerfile, aber Docker sieht die
  // Datei gar nicht. Der Bau bricht mit "failed to compute cache key" ab —
  // einer Meldung, die den Namen der Regel nirgends nennt.
  const w = welt({
    "Dockerfile.test": "FROM node:22\nCOPY workers/dienst ./workers/dienst\nCOPY lib ./lib\n",
    ".dockerignore": "node_modules\nlib\n",
    "workers/dienst/start.mjs": 'import { h } from "../../lib/hash.js";\n',
    "lib/hash.js": "export const h = 1;\n"
  });
  const b = pruefeDienst({ dockerfile: "Dockerfile.test", einstieg: "workers/dienst/start.mjs" }, w);
  assert.equal(b.ok, false);
  assert.deepEqual(b.ausgesperrt, ["lib/hash.js"]);
});

test("ein fehlendes Dockerfile ist ein Nein, kein Absturz", () => {
  const b = pruefeDienst({ dockerfile: "Dockerfile.gibtsnicht", einstieg: "x.mjs" }, welt({}));
  assert.equal(b.ok, false);
  assert.match(b.gruende[0], /Dockerfile fehlt/);
});

// --- Gegenprobe am echten Repo -----------------------------------------------

test("die beiden echten Dienste bestehen — Gegenprobe gegen ein GESUNDES Abbild", () => {
  // Bevor man einem Abbild Krankheit bescheinigt, misst man mit derselben
  // Methode gegen ein gesundes. Der con-Autopilot laeuft nachweislich.
  for (const dienst of [
    { dockerfile: "Dockerfile.con-autopilot", einstieg: "workers/con-autopilot/server.mjs" },
    { dockerfile: "Dockerfile.smejj-lora-loop", einstieg: "workers/smejj-lora-loop/worker.mjs" }
  ]) {
    const b = pruefeDienst(dienst);
    assert.equal(b.ok, true, `${dienst.dockerfile}: ${b.gruende.join("; ")}`);
    assert.ok(b.gesamt > 10, "ein Importbaum mit weniger als 10 Dateien deutet auf ein kaputtes Muster hin");
  }
});
