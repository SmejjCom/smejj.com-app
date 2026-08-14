// smejj.com — Der Anschluss der Brücke an die AI Evolution Engine.
//
// Zwei Zusagen stehen hier auf dem Prüfstand, und beide sind der Grund, warum
// der Anschluss so und nicht anders gebaut ist:
//
//   1. DER ANTWORTTEXT VERLÄSST DIE BRÜCKE NICHT. Gemeldet werden Art, Note,
//      Fehlerklassen und die kurzen Belege des Prüfers — nie der Inhalt.
//   2. DIE MESSUNG HÄLT NIEMANDEN AUF. Ohne Schlüssel meldet sie still gar
//      nichts, und ein toter Control-Server darf keine Antwort kosten.
import test from "node:test";
import assert from "node:assert/strict";

import { meldeAktion, meldeAntwort, codeAusAntwort, evolutionMelderStatus } from "../public/chat-bridge-evolution.js";
import { messeMedienAusgabe } from "../public/chat-bridge-bilder.js";
import { pruefeEvolutionToken, handleEvolutionAktion } from "../control-server/src/routes/autopilotRoutes.js";
import { evolutionUebersicht, _leereFuerTest } from "../control-server/src/evolution/aiEvolutionEngine.js";

const TOKEN = "evolutions-schluessel-fuer-den-test";
const ENV_AN = { SMEJJ_EVOLUTION_TOKEN: TOKEN, SMEJJ_CONTROL_ORIGIN: "https://control.example" };

function faengt() {
  const gesendet = [];
  return {
    gesendet,
    fetchImpl: async (url, optionen) => { gesendet.push({ url, optionen }); return { ok: true }; }
  };
}

test("Brücke: der Antworttext wird NICHT mitgeschickt", () => {
  const geheim = "Der Kunde heisst Alan Best und wohnt in Castro Valley. Diese Antwort bricht ab bei";
  const netz = faengt();
  meldeAktion({ art: "text", prompt: "wer ist der Kunde?", ergebnis: geheim }, { env: ENV_AN, fetchImpl: netz.fetchImpl });
  assert.equal(netz.gesendet.length, 1);
  const koerper = netz.gesendet[0].optionen.body;
  assert.ok(!koerper.includes("Castro Valley"), "der Antworttext darf die Brücke nicht verlassen");
  assert.ok(!koerper.includes("Alan Best"));
  const gemeldet = JSON.parse(koerper);
  assert.equal(gemeldet.art, "text");
  assert.ok(Number.isFinite(gemeldet.punkte));
  assert.ok(gemeldet.funde.some((f) => f.klasse === "abbruch"), "der Abbruch muss als Klasse gemeldet werden");
  // Kein Beleg trägt Inhalt: der Prüfer belegt "abbruch" mit den letzten 60
  // Zeichen der Antwort — genau deshalb wird der Beleg vor dem Senden ersetzt.
  for (const f of gemeldet.funde) assert.ok(!f.beleg.includes("endet mit"), "Belege duerfen keinen Antworttext tragen");
});

test("Brücke: ohne Schlüssel wird still nichts gemeldet — aber trotzdem geurteilt", () => {
  const netz = faengt();
  const bewertung = meldeAktion({ art: "text", ergebnis: "Ein vollständiger Satz." }, { env: {}, fetchImpl: netz.fetchImpl });
  assert.equal(netz.gesendet.length, 0);
  assert.equal(bewertung.gemessen, true, "das Urteil entsteht auch ohne Melde-Weg");
  assert.equal(evolutionMelderStatus({}).aktiv, false);
  assert.ok(evolutionMelderStatus({}).grund.includes("SMEJJ_EVOLUTION_TOKEN"));
});

test("Brücke: ein toter Control-Server kostet keine Antwort", () => {
  const kaputt = async () => { throw new Error("ECONNREFUSED"); };
  // Kein await, kein throw — der Aufruf muss synchron zurückkommen.
  const bewertung = meldeAktion({ art: "text", ergebnis: "Eine gesunde Antwort." }, { env: ENV_AN, fetchImpl: kaputt });
  assert.equal(bewertung.gemessen, true);
});

test("Bilder-Spur: ein data:video wird als Video mit flüchtiger Adresse erkannt", () => {
  const gemeldet = [];
  const inhalt = `Hier ist dein Video:\n\n![Video](data:video/mp4;base64,${"A".repeat(4000)}) (mit Ton)`;
  messeMedienAusgabe(inhalt, { melder: (e) => { gemeldet.push(e); return null; } });
  assert.equal(gemeldet.length, 1);
  assert.equal(gemeldet[0].art, "video");
  assert.equal(gemeldet[0].ergebnis.hatTon, true);
  assert.equal(gemeldet[0].ergebnis.bytes, 3000);
});

test("Bilder-Spur: der SVG-Notnagel fällt auf", () => {
  const gemeldet = [];
  messeMedienAusgabe(`Hier ist dein Bild:\n\n![Bild](data:image/svg+xml;base64,${"A".repeat(800)})`,
    { melder: (e) => { gemeldet.push(e); return null; } });
  assert.equal(gemeldet[0].art, "bild");
  assert.equal(gemeldet[0].ergebnis.format, "svg+xml");
});

test("Bilder-Spur: eine Absage ohne Medium zählt als Textantwort", () => {
  const gemeldet = [];
  messeMedienAusgabe("Die Video-Erzeugung ist gerade fehlgeschlagen — bitte versuch es gleich noch einmal.",
    { melder: (e) => { gemeldet.push(e); return null; } });
  assert.equal(gemeldet[0].art, "text");
});

test("Control: der Melde-Eingang ist ohne Schlüssel dicht", () => {
  assert.equal(pruefeEvolutionToken({ headers: {} }, {}).status, 503, "ohne gesetzten Schlüssel: gar nichts");
  assert.equal(pruefeEvolutionToken({ headers: {} }, { SMEJJ_EVOLUTION_TOKEN: TOKEN }).status, 401);
  assert.equal(pruefeEvolutionToken({ headers: { "x-smejj-evolution-token": TOKEN } }, { SMEJJ_EVOLUTION_TOKEN: TOKEN }).ok, true);
});

test("Control: ein gemeldetes Urteil landet in der Übersicht", async () => {
  _leereFuerTest();
  const antwort = await schicke({
    art: "bild", gemessen: true, punkte: 40,
    funde: [{ klasse: "fluechtige-url", beleg: "data:… — sprengt die Verlaufsgrenze" }],
    quelle: "bruecke-bilder", betrifft: "bilder-malen"
  });
  assert.equal(antwort.status, 202);
  assert.equal(antwort.body.ok, true);
  const u = evolutionUebersicht({});
  assert.equal(u.aktionen, 1);
  assert.equal(u.arten[0].art, "bild");
  assert.equal(u.arten[0].note, 40);
});

test("Control: überlange Belege werden gekappt, nicht übernommen", async () => {
  _leereFuerTest();
  const antwort = await schicke({
    art: "text", gemessen: true, punkte: 50,
    funde: Array.from({ length: 50 }, () => ({ klasse: "abbruch", beleg: "x".repeat(5000) }))
  });
  assert.equal(antwort.status, 202);
  // Höchstens 10 Funde, jeder Beleg auf 160 Zeichen — ein Melder darf die
  // Aufgabenliste nicht fluten.
  assert.ok(antwort.body.aufgaben <= 10);
});

/** Kleine Bühne: ein Request/Response-Paar ohne echten Server.
 *  readRawBody hört auf "data"/"end" — deshalb ein winziger Ereignis-Sender
 *  statt eines Streams. */
async function schicke(nutzlast) {
  const zuhoerer = new Map();
  const req = {
    headers: { "x-smejj-evolution-token": TOKEN, "content-type": "application/json" },
    method: "POST",
    on(ereignis, rueckruf) {
      zuhoerer.set(ereignis, rueckruf);
      if (ereignis === "end") {
        // Erst wenn beide Zuhörer stehen: Daten senden, dann Ende melden.
        queueMicrotask(() => {
          zuhoerer.get("data")?.(JSON.stringify(nutzlast));
          rueckruf();
        });
      }
      return this;
    }
  };
  let status = 0;
  let body = null;
  const res = {
    headersSent: false,
    setHeader() {},
    writeHead(code) { status = code; return this; },
    end(text) { body = text ? JSON.parse(text) : null; }
  };
  await handleEvolutionAktion(req, res, { env: { SMEJJ_EVOLUTION_TOKEN: TOKEN } });
  return { status, body };
}

// ── Zweite Linse: Code in Chat-Antworten (2026-08-14) ───────────────────────
//
// Der Textprüfer sieht eine Antwort, die sauber endet und Substanz hat. Dass
// der Codeblock darin mitten in einer Funktion abbricht, kann er nicht sehen.

test("Antwort-Melder: Code mit Sprachmarke wird als zweite Aktion gemessen", () => {
  const netz = faengt();
  const antwort = "Hier ist die Lösung:\n\n```js\nexport function summe(a, b) {\n  return a + b;\n}\n```\n\nDas war's.";
  const r = meldeAntwort({ prompt: "addiere zwei Zahlen", antwort }, { env: ENV_AN, fetchImpl: netz.fetchImpl });
  assert.equal(r.codestuecke, 1);
  assert.equal(netz.gesendet.length, 2, "einmal als Text, einmal als Code");
  const arten = netz.gesendet.map((g) => JSON.parse(g.optionen.body).art).sort();
  assert.deepEqual(arten, ["code", "text"]);
});

test("Antwort-Melder: ein abgeschnittener Codeblock faellt auf, die Antwort selbst nicht", () => {
  const netz = faengt();
  // Der Text endet sauber mit Punkt — nur der Code ist unvollständig.
  const antwort = "Bitte sehr.\n\n```js\nfunction f(a) {\n  if (a) {\n    return 1;\n```\n\nFertig.";
  meldeAntwort({ antwort }, { env: ENV_AN, fetchImpl: netz.fetchImpl });
  const gemeldet = netz.gesendet.map((g) => JSON.parse(g.optionen.body));
  const text = gemeldet.find((g) => g.art === "text");
  const code = gemeldet.find((g) => g.art === "code");
  assert.equal(text.funde.length, 0, "die Antwort selbst ist in Ordnung");
  assert.ok(code.funde.some((f) => f.klasse === "unbalanciert"), "der Code ist es nicht");
});

test("Antwort-Melder: Fliesstext in Backticks ist kein Code", () => {
  assert.equal(codeAusAntwort("```\nnur eine Ausgabe ohne Sprachmarke, aber lang genug für die Schwelle\n```").length, 0);
  assert.equal(codeAusAntwort("```js\nlet a = 1;\n```").length, 0, "Einzeiler sind Beispiele, keine Programme");
});
