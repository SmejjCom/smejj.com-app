// Der Waechter fuer die ausgelieferte Kopie unter public/assets/.
//
// Hintergrund (2026-08-22): Die App laedt jede Datei aus `/assets/…`, aber
// dieser Ordner wurde von Hand gepflegt. 26 von 205 Dateien waren veraltet —
// darunter zwei am selben Tag committete Fehlerbehebungen, die dadurch live
// nie ankamen. Das Fehlerbild ist STILL: nichts wird rot, keine Anfrage
// schlaegt fehl, die uebrigen Tests lesen die Quelle und sind zufrieden.
//
// Nach der Hausregel bekommt jeder Waechter eine KAPUTTE und eine GESUNDE
// Probe — ein Waechter, der nie angeschlagen hat, ist kein Waechter.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pruefe, AUSNAHMEN } from "../scripts/build/sync-assets.mjs";

const paket = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const skript = readFileSync(new URL("../scripts/build/sync-assets.mjs", import.meta.url), "utf8");

test("beide Befehle sind als npm-Skript erreichbar", () => {
  // Ein Waechter, den niemand aufrufen kann, wird nicht aufgerufen.
  assert.match(paket.scripts["build:assets"], /sync-assets\.mjs/);
  assert.match(paket.scripts["check:assets"], /sync-assets\.mjs --check/);
});

test("die Bruecken-Familie ist von der Kopie ausgenommen", () => {
  // assets/chat-bridge.js ist im Frontend-Repo das GEBUENDELTE Artefakt.
  // Wer dort die Quelle hinkopiert, crasht den Zeabur-Dienst mit
  // ERR_MODULE_NOT_FOUND — die relativen Importe zeigen ins Leere.
  // Das ist der einzige Fall, in dem "Quelle gewinnt" FALSCH waere.
  assert.ok(AUSNAHMEN["chat-bridge.js"], "chat-bridge.js muss ausgenommen sein");
  for (const [name, grund] of Object.entries(AUSNAHMEN)) {
    assert.match(name, /^chat-bridge/, `unerwartete Ausnahme: ${name}`);
    assert.ok(grund && grund.length > 10, `Ausnahme ${name} braucht eine Begruendung`);
  }
});

test("das Skript legt niemals eine neue Datei in assets an", () => {
  // Was ausgeliefert wird, ist eine Entscheidung (Seitengewicht,
  // Precache-Liste, oeffentliche Sichtbarkeit) — keine Ableitung aus dem
  // Dateisystem. Die Dateiliste kommt darum AUS assets, nicht aus public.
  assert.match(skript, /ausgelieferteDateien\(verzeichnis = ZIEL\)/,
    "die Liste muss aus dem ZIEL-Ordner stammen");
  assert.ok(!/readdir\(QUELLE/.test(skript),
    "public/ darf nicht durchsucht werden — sonst entstehen neue Auslieferungen");
});

test("GESUNDE Probe: eine synchrone Datei wird nicht gemeldet", async () => {
  // package.json liegt nicht in assets/ — wir brauchen eine Datei, die dort
  // existiert UND gleich ist. Wir stellen sie selbst her und raeumen auf.
  const name = "design-cyan-views.css";
  const quelle = new URL(`../public/${name}`, import.meta.url);
  const ziel = new URL(`../public/assets/${name}`, import.meta.url);
  const vorher = readFileSync(ziel);
  try {
    writeFileSync(ziel, readFileSync(quelle));
    const { abweichend } = await pruefe([name]);
    assert.deepEqual(abweichend, [], "gleiche Dateien duerfen nicht anschlagen");
  } finally {
    writeFileSync(ziel, vorher);
  }
});

test("KAPUTTE Probe: eine abweichende Datei schlaegt an", async () => {
  // Der eigentliche Selbsttest: wir verstellen die Auslieferung um EIN
  // Zeichen und erwarten, dass der Waechter das findet. Genau diese
  // Ein-Zeichen-Drift war der reale Fall (Marke b46 gegen b45).
  const name = "design-cyan-views.css";
  const ziel = new URL(`../public/assets/${name}`, import.meta.url);
  const vorher = readFileSync(ziel);
  try {
    writeFileSync(ziel, Buffer.concat([vorher, Buffer.from("\n/* Probe */\n")]));
    const { abweichend } = await pruefe([name]);
    assert.deepEqual(abweichend, [name], "die verstellte Datei muss gemeldet werden");
  } finally {
    writeFileSync(ziel, vorher);
  }
});

test("die Probe hat nichts hinterlassen", async () => {
  // Ein Test, der seine eigene Sauerei nicht wegraeumt, erzeugt genau die
  // Drift, die er verhindern soll.
  const { abweichend } = await pruefe(["design-cyan-views.css"]);
  assert.deepEqual(abweichend, []);
});
