// smejj.com — die Fortschrittszeile beim Malen spricht die Sprache der Anfrage
// (Betreiber 23.09.2026: "Mach 'Male dein Bild' auch in 15 Sprachen").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BILD_TEXTE, streamBilderLane } from "../public/chat-bridge-bilder.js";
import { BILD_SCHRITTE, bildSchritte, schrittSekunden } from "../public/chat-bridge-bildschritte.js";

const FELDER = ["titel", "etwa", "sek", "reserve", "fertig", "fehl", "startet"];

test("jede Sprache des Bildsatzes hat alle sieben Schritt-Texte, keine ist deutsch geblieben", () => {
  assert.deepEqual(Object.keys(BILD_SCHRITTE).sort(), Object.keys(BILD_TEXTE).sort());
  for (const [sprache, worte] of Object.entries(BILD_SCHRITTE)) {
    for (const feld of FELDER) assert.ok(String(worte[feld] || "").trim(), `${sprache}.${feld} fehlt`);
    assert.match(worte.sek, /\{n\}/, `${sprache}.sek braucht den Platzhalter`);
    if (sprache !== "de") assert.notEqual(worte.titel, "Male dein Bild", `${sprache} ist noch deutsch`);
  }
  assert.equal(schrittSekunden("fr", 20), "en cours … 20 s");
  assert.equal(bildSchritte("xx").titel, "Male dein Bild", "Unbekanntes faellt auf Deutsch");
});

test("die Bild-Strecke schreibt keinen festen deutschen Schritt-Text mehr", () => {
  const quelle = readFileSync(new URL("../public/chat-bridge-bilder.js", import.meta.url), "utf8");
  assert.doesNotMatch(quelle, /bilderSchritt\(res, "\w+", ["`]/, "der angezeigte Stand kommt immer aus bildSchritte(sprache)");
  assert.doesNotMatch(quelle, /text: "Male dein Bild"/);
});

test("franzoesische Anfrage: die Zeile ueber dem Bild steht auf Franzoesisch", async () => {
  const gesendet = [];
  const res = { writeHead: () => {}, setHeader: () => {}, write: (s) => gesendet.push(String(s)), end: () => {} };
  const deps = {
    corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 500, acceptLanguage: "fr-FR,fr;q=0.9",
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, bereit: false, ladezeitSek: 42 }) })
  };
  assert.equal(await streamBilderLane(res, {}, "Dessine une pomme rouge", deps), true);
  const schritte = gesendet.filter((s) => s.includes("smejj_schritt")).map((s) => JSON.parse(s.slice(6)).smejj_schritt);
  assert.ok(schritte.length >= 1);
  for (const schritt of schritte) {
    assert.equal(schritt.text, "Je peins ton image");
    assert.doesNotMatch(schritt.stand, /läuft|fertig|startet/);
  }
});
