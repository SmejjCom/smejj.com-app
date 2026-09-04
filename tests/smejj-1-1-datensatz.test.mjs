// smejj.com — Der gebaute Datensatz smejj-1-1.
//
// Betreiber-Entscheidung 2026-09-04: "Eigene Paare bauen". Gemessen am selben
// Tag: 1 erfasste Nutzerfrage bei einem Besuch am Tag — auf dem Sammelweg
// kommen die geforderten 3.000 Paare nie zusammen.
//
// Geprueft wird die EIGENSCHAFT des Datensatzes, nicht seine Groesse: dass er
// deterministisch ist, dass die Pruefsuite draussen bleibt, und dass Abwehr
// und Gegenprobe beide vorkommen. Die Lehre vom 03.09.: con-1.1.0 wurde
// verworfen, weil es fast nur auf Fakten trainiert wurde — es verriet danach
// ein Geheimnis und folgte einer Prompt-Injection.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { erzeugeErgaenzung, abwehrPaare, gegenprobePaare, ehrlichkeitsPaare, formPaare } from "../scripts/training/smejj-1-1-generator.mjs";
import { baue, leseSuiten, MENGEN, STARTWERT } from "../scripts/training/smejj-1-1-datensatz-bauen.mjs";
import { teile, PAARE_JE_TEIL } from "../scripts/training/smejj-1-1-hochladen.mjs";
import { wuerfel, erzeuge } from "../workers/con-autopilot/daten/generator.mjs";

test("derselbe Startwert ergibt denselben Datensatz", () => {
  const a = erzeugeErgaenzung({ startwert: 4711 });
  const b = erzeugeErgaenzung({ startwert: 4711 });
  const c = erzeugeErgaenzung({ startwert: 4712 });
  assert.deepEqual(a, b, "ohne Determinismus ist kein Trainingslauf nachvollziehbar");
  assert.notDeepEqual(a, c, "ein anderer Startwert muss auch etwas anderes ergeben");
});

test("bei jedem Abwehr-Paar IST die Antwort eine Verweigerung", () => {
  const paare = abwehrPaare(wuerfel(7), 400);
  const verweigert = /\b(nein|nicht|kein|keine|lehne|ab)\b/i;
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.match(antwort, verweigert, `Abwehr ohne Verweigerung: ${antwort.slice(0, 60)}`);
  }
});

test("die Gegenprobe verweigert NICHT — sonst entsteht Ueberverweigerung", () => {
  // Ein Modell, das bei jedem Wort "Schluessel" abblockt, ist genauso
  // unbrauchbar wie eines, das alles ausplaudert.
  const paare = gegenprobePaare(wuerfel(9), 200);
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.ok(!/^(nein|das mache ich nicht|das kann ich nicht tun)/i.test(antwort.trim()),
      `harmlose Frage wurde verweigert: ${antwort.slice(0, 60)}`);
    assert.ok(antwort.length > 40, "eine Gegenprobe muss wirklich antworten, nicht abwimmeln");
  }
});

test("Ehrlichkeits-Paare sagen 'weiss ich nicht' UND erfinden nichts", () => {
  const paare = ehrlichkeitsPaare(wuerfel(11), 200);
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.match(antwort, /(kann ich nicht|weiss ich nicht|keine Angabe|nicht sagen|muss ich passen)/i);
    assert.ok(!/\b\d{4,}\b/.test(antwort), `erfundene Zahl in einer Nichtwissen-Antwort: ${antwort.slice(0, 70)}`);
  }
});

test("die Antworten sind vielfaeltig genug fuer die Varianten-Bremse", () => {
  // Erste Fassung der Ehrlichkeits-Paare hatte je Bauart EINE Antwort: von
  // 1.200 erzeugten ueberlebten 74. Die Bremse laesst 40 Varianten je Antwort.
  const paare = ehrlichkeitsPaare(wuerfel(13), 600);
  const antworten = new Set(paare.map((p) => p.messages.at(-1).content));
  assert.ok(antworten.size >= 60, `nur ${antworten.size} verschiedene Antworten — die Duplikat-Bremse frisst den Rest`);
});

test("keine Antwort besteht nur aus Zeichen ohne Buchstaben", () => {
  // Die Daten-Pipeline verwirft solche Antworten als "spam" (403 Paare am
  // 04.09., reine Zahlenlisten aus der Sortier-Aufgabe).
  for (const p of formPaare(wuerfel(17), 300)) {
    assert.match(p.messages.at(-1).content, /\p{L}/u, "Antwort ohne Buchstaben faellt in den Spam-Filter");
  }
});

test("kein Fall der Pruefsuite steht im Datensatz", async () => {
  const suiten = await leseSuiten();
  const roh = [...erzeuge({ startwert: STARTWERT, ...MENGEN }), ...erzeugeErgaenzung({ startwert: STARTWERT })];
  const { paare, manifest } = baue(roh, suiten);
  const normalisiere = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const drin = new Set(paare.map((p) => normalisiere(p.messages.find((m) => m.role === "user")?.content)));
  for (const s of suiten) {
    for (const fall of s.cases || []) {
      assert.ok(!drin.has(normalisiere(fall.prompt)),
        `Suitenfall ${fall.id} steht im Training — die Messung wuerde sich selbst messen`);
    }
  }
  assert.ok(manifest.paare >= 3000, `nur ${manifest.paare} Paare — der Plan verlangt mindestens 3.000`);
  // Verweigern muss so stark vertreten sein wie Rechnen, sonst wird es
  // wegtrainiert (con-1.1.0, verworfen 03.09.).
  const k = manifest.kategorien;
  assert.ok(k.sicherheit >= k.reasoning * 0.5,
    `Sicherheit ${k.sicherheit} gegen Rechnen ${k.reasoning} — zu wenig Abwehr im Datensatz`);
  assert.ok(k.ehrlichkeit >= 300, `nur ${k.ehrlichkeit} Ehrlichkeits-Paare`);
});

test("die Teile sind einzeln klein genug fuer den 30-s-Deckel des Signierers", () => {
  // s3Signer.js#requestTimeoutSignal deckelt JEDES Zeitbudget bei 30 s. 3,8 MB
  // brauchen auf der Leitung des Betreibers (1,5 Mbit/s) rund 20 s netto und
  // liefen zweimal in die Zeitueberschreitung.
  const zeilen = Array.from({ length: 3200 }, (_, i) => JSON.stringify({ n: i })).join("\n");
  const stuecke = teile(zeilen);
  assert.equal(stuecke.length, 3, "3.200 Zeilen ergeben drei Teile");
  for (const s of stuecke) {
    assert.ok(s.split("\n").filter(Boolean).length <= PAARE_JE_TEIL);
    assert.ok(s.endsWith("\n"), "JSONL endet mit Zeilenumbruch");
  }
  assert.equal(stuecke.join("").split("\n").filter(Boolean).length, 3200, "kein Paar geht beim Teilen verloren");
});
