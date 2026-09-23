// smejj.com — Video-Zeile und Fehlermeldungen der Bild-/Video-Spur in 15 Sprachen
// (Betreiber 23.09.2026: "Uebersetze die Video-Zeile und Fehlermeldungen auch in 15 Sprachen").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BILD_TEXTE, erkenneBildAuftrag, streamBilderLane, videoHinweis } from "../public/chat-bridge-bilder.js";
import { BILD_FEHLER, VIDEO_TEXTE, bildFehler, videoTexte } from "../public/chat-bridge-medientexte.js";

const SPRACHEN = Object.keys(BILD_TEXTE).sort();

test("jede der 15 Sprachen hat alle Video- und Fehlertexte, keine ist deutsch geblieben", () => {
  assert.deepEqual(Object.keys(VIDEO_TEXTE).sort(), SPRACHEN);
  assert.deepEqual(Object.keys(BILD_FEHLER).sort(), SPRACHEN);
  const vFelder = Object.keys(VIDEO_TEXTE.de);
  const fFelder = Object.keys(BILD_FEHLER.de);
  for (const s of SPRACHEN) {
    for (const f of vFelder) assert.ok(String(VIDEO_TEXTE[s][f] || "").trim(), `${s}.${f}`);
    for (const f of fFelder) assert.ok(String(BILD_FEHLER[s][f] || "").trim(), `${s}.${f}`);
    assert.match(VIDEO_TEXTE[s].ersatz, /\{motiv\}/, `${s}.ersatz braucht {motiv}`);
    assert.match(BILD_FEHLER[s].startet, /\{seit\}/, `${s}.startet braucht {seit}`);
    assert.match(BILD_FEHLER[s].seit, /\{n\}/, `${s}.seit braucht {n}`);
    if (s !== "de") {
      assert.notEqual(VIDEO_TEXTE[s].titel, VIDEO_TEXTE.de.titel, `${s} Video-Titel deutsch`);
      assert.notEqual(BILD_FEHLER[s].malenFehl, BILD_FEHLER.de.malenFehl, `${s} Fehlertext deutsch`);
    }
  }
  assert.equal(videoTexte("xx").titel, "Erzeuge dein Video");
  assert.equal(bildFehler("xx").malenFehl, BILD_FEHLER.de.malenFehl);
});

test("der Ersatzvorschlag wird in JEDER Sprache wieder als Mal-Auftrag erkannt", () => {
  for (const s of SPRACHEN) {
    const vorschlag = VIDEO_TEXTE[s].ersatz.match(/[*"“「]+([^*"”」]+)[*"”」]+/)[1].replace("{motiv}", s === "zh" || s === "ja" ? "猫" : "einer Katze");
    assert.equal(erkenneBildAuftrag(vorschlag), vorschlag, `${s}: ${vorschlag}`);
  }
});

test("die Bild-/Video-Strecke enthaelt keine festen deutschen Nutzertexte mehr", () => {
  const quelle = readFileSync(new URL("../public/chat-bridge-bilder.js", import.meta.url), "utf8");
  for (const alt of ["Hier ist dein Video", "Erzeuge dein Video", "Das Malen ist gerade", "Die Video-Erzeugung ist", "Gerade werden schon mehrere", "Der Bild-Dienst startet", "Die eigene Video-Engine"]) {
    assert.ok(!quelle.includes(`"${alt}`) && !quelle.includes(`\`${alt}`), `fest im Code: ${alt}`);
  }
});

test("videoHinweis spricht die Sprache — Deutsch bleibt wortgleich", () => {
  assert.match(videoHinweis("kenburns", false), /die Kamera fährt, das Motiv selbst bleibt ruhig/);
  assert.match(videoHinweis("parallax", true, "fr"), /premier plan.*Raconté par la voix de smejj 1\.0\./);
  assert.equal(videoHinweis("animatediff", false, "ja"), "");
});

function stromProbe() {
  const gesendet = [];
  return { gesendet, res: { writeHead: () => {}, setHeader: () => {}, write: (s) => gesendet.push(String(s)), end: () => {} } };
}

test("franzoesisch: waermt der Maler auf, kommt die Absage auf Franzoesisch mit Ladezeit", async () => {
  const { gesendet, res } = stromProbe();
  const deps = {
    corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 500, acceptLanguage: "fr-FR",
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, bereit: false, ladezeitSek: 42 }) })
  };
  assert.equal(await streamBilderLane(res, {}, "Dessine une pomme rouge", deps), true);
  const text = gesendet.join("");
  assert.match(text, /Le service d'images démarre \(depuis 42 s\)/);
  assert.doesNotMatch(text, /startet gerade|laedt sein Modell/);
});

test("franzoesisch: ist die Video-Engine weg, stehen Zeile, Hinweis und Vorschlag auf Franzoesisch", async () => {
  const { gesendet, res } = stromProbe();
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 500, acceptLanguage: "fr-FR" };
  assert.equal(await streamBilderLane(res, {}, "Make a video of a cat", deps), true);
  const text = gesendet.join("");
  const schritte = gesendet.filter((s) => s.includes("smejj_schritt")).map((s) => JSON.parse(s.slice(6)).smejj_schritt);
  assert.ok(schritte.every((s) => s.text === "Je crée ta vidéo"));
  assert.ok(schritte.some((s) => s.stand === "Moteur vidéo injoignable"));
  assert.match(text, /Notre moteur vidéo est injoignable/);
  assert.match(text, /Dessine une image de/);
  assert.doesNotMatch(text, /Video-Engine|Zeichne ein Bild/);
});

test("die Sekunden-Einheit der Video-Zeile folgt der Sprache wie in der Mal-Zeile", () => {
  const quelle = readFileSync(new URL("../public/chat-bridge-bilder.js", import.meta.url), "utf8");
  assert.match(quelle, /\$\{phase\} … \$\{Math\.round\(\(Date\.now\(\) - beginn\) \/ 1000\)\}\$\{einheit\}/);
  assert.doesNotMatch(quelle, /\$\{phase\} … [^`]*\} s`/);
});
