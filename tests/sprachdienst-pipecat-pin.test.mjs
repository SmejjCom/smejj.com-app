// smejj.com — haelt die pipecat-ai-Entscheidung des Sprachdienstes fest.
//
// WARUM ES DAS GIBT (2026-08-14): Der CVE-Waechter meldet Nacht fuer Nacht
// "pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)" und empfiehlt "Version
// anheben". Beides haelt der Messung nicht stand:
//
//   1. Es ist EINE Luecke, nicht zwei. osv fuehrt CVE-2025-62373 unter zwei
//      IDs (GHSA-c2jg-5cp7-6wc7 und PYSEC-2026-458); der Waechter zaehlt
//      Eintraege, nicht Befunde.
//   2. Anheben verschlechtert. Gemessen an api.osv.dev: 0.0.67 -> 1 Befund,
//      0.0.94/0.0.95/0.0.96 -> 2 Befunde. Keine Fassung ist sauber.
//
// Die Fassung bleibt also stehen — aber nur, weil die verwundbare Stelle hier
// nicht verdrahtet ist: CVE-2025-62373 ist ausschliesslich ueber den
// LivekitFrameSerializer erreichbar, der Dienst benutzt den Protobuf-
// Serialisierer. Genau das darf keine Behauptung bleiben. Diese Pruefung macht
// aus der Begruendung eine Zusage, die bricht, wenn jemand sie verletzt:
// entweder durch stilles Anheben der Fassung (dann fehlt die Messung) oder
// durch Verdrahten der verwundbaren Oberflaeche.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIENST = path.join(REPO, "workers", "smejj-voice");
const ANFORDERUNGEN = readFileSync(path.join(DIENST, "requirements.txt"), "utf8");

/** Die gepinnte pipecat-ai-Fassung aus der requirements.txt. */
function gepinnteFassung(inhalt) {
  const treffer = inhalt.match(/^pipecat-ai(?:\[[^\]]*\])?==([^\s#]+)/m);
  assert.ok(treffer, "requirements.txt pinnt kein pipecat-ai");
  return treffer[1];
}

/** Alle Python-Quelldateien des Sprachdienstes, mit Pfad und Inhalt. */
function pythonQuellen(ordner = path.join(DIENST, "src")) {
  const dateien = [];
  for (const eintrag of readdirSync(ordner)) {
    const voll = path.join(ordner, eintrag);
    if (statSync(voll).isDirectory()) dateien.push(...pythonQuellen(voll));
    else if (eintrag.endsWith(".py")) {
      dateien.push({ pfad: path.relative(REPO, voll), inhalt: readFileSync(voll, "utf8") });
    }
  }
  return dateien;
}

test("die gepinnte Fassung traegt eine datierte, gemessene Begruendung", () => {
  const fassung = gepinnteFassung(ANFORDERUNGEN);

  assert.match(ANFORDERUNGEN, /#\s*ENTSCHEIDUNG\s+\d{4}-\d{2}-\d{2}/,
    "kein datierter Entscheidungsblock — ohne Datum weiss niemand, wie alt die Messung ist");
  assert.match(ANFORDERUNGEN, /api\.osv\.dev/,
    "die Begruendung nennt keine Quelle; 'ist schon in Ordnung' ist keine Messung");

  // Die gepinnte Fassung MUSS in der Messtabelle stehen. Wer sie anhebt, ohne
  // neu zu messen, faellt hier auf — genau das war die Falle der letzten
  // Naechte: die Standardempfehlung "Version anheben" ohne Nachmessen.
  const zeileZurFassung = new RegExp(`^#\\s*${fassung.replace(/\./g, "\\.")}\\s*->`, "m");
  assert.match(ANFORDERUNGEN, zeileZurFassung,
    `Fassung ${fassung} steht in keiner Messzeile — erst messen, dann anheben`);
});

test("die Messtabelle deckt auch die Nachfolgefassungen ab", () => {
  // Ohne Vergleichswerte ist "bewusst nicht angehoben" eine Meinung. Mit ihnen
  // ist es eine Rechnung: 1 Befund gegen 2.
  for (const nachfolger of ["0.0.94", "0.0.95", "0.0.96"]) {
    const zeile = new RegExp(`^#\\s*${nachfolger.replace(/\./g, "\\.")}\\s*->`, "m");
    assert.match(ANFORDERUNGEN, zeile,
      `Nachfolgefassung ${nachfolger} ist nicht gemessen — der Vergleich fehlt`);
  }
  assert.match(ANFORDERUNGEN, /CVE-2025-62373/,
    "der Befund der gepinnten Fassung ist nicht benannt");
});

test("die verwundbare pipecat-Oberflaeche ist nirgends verdrahtet", () => {
  // Jede Zeile hier gehoert zu einem gemessenen Befund:
  //   livekit        -> CVE-2025-62373 (Pickle-RCE, betrifft 0.0.67)
  //   pipecat.runner -> CVE-2026-44716 (Pfad-Ausbruch im /files-Endpunkt)
  //   Telefonie      -> CVE-2026-54695 (unauthentifizierte Anrufsteuerung)
  const verboten = [
    { name: "LivekitFrameSerializer / pipecat.serializers.livekit", muster: /livekit/i },
    { name: "pipecat.runner (Entwickler-Server mit /files)", muster: /\b(?:from|import)\s+pipecat\.runner\b/ },
    { name: "Telefonie-Serialisierer", muster: /pipecat\.serializers\.(?:twilio|telnyx|exotel|plivo)\b/ }
  ];

  const quellen = pythonQuellen();
  assert.ok(quellen.length > 0, "keine Python-Quellen gefunden — die Pruefung waere blind");

  for (const { pfad, inhalt } of quellen) {
    for (const { name, muster } of verboten) {
      assert.doesNotMatch(inhalt, muster,
        `${pfad} beruehrt ${name}. Damit traegt die Begruendung fuer pipecat-ai==0.0.67 nicht mehr.`);
    }
  }
});

test("der genutzte Serialisierer ist der unverwundbare Protobuf-Weg", () => {
  const quellen = pythonQuellen();
  const nutztProtobuf = quellen.some((q) => /pipecat\.serializers\.protobuf/.test(q.inhalt));
  assert.ok(nutztProtobuf,
    "kein ProtobufFrameSerializer mehr im Quelltext — wurde der Transportweg getauscht?");
});
