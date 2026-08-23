// Waechter fuer die Stille-Wache — und dafuer, dass BEIDE Stromfamilien sie haben.
//
// DER BEFUND (live gemessen 2026-08-23): eine von fuenf Chat-Anfragen stand
// nach 55 s noch auf "smejj denkt nach …". Keine Meldung, kein Abbruch.
// chat-stream.js hatte die Wache seit dem 17.08. — chatClient.js (Cline/BYOK)
// nicht, und der Chat stand auf "Cline · Auto". Dasselbe Muster wie beim
// Stopp-Knopf, der auch nur bei einer Familie griff.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STILLE_GRENZE_MS, starteStilleWache, stilleText } from "../public/ai/strom-stillstand.js";

const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** Eine Uhr, die nur vorgeht, wenn der Test sie vorstellt. */
function uhrAttrappe() {
  let naechste = 1;
  const offen = new Map();
  return {
    verzoegern: (fn, ms) => { const id = naechste++; offen.set(id, { fn, ms }); return id; },
    abbrechen: (id) => offen.delete(id),
    stelleVor(ms) { for (const [id, w] of [...offen]) if (w.ms <= ms) { offen.delete(id); w.fn(); } },
    offeneWecker: () => offen.size
  };
}

test("die Grenze ist grosszuegig — ein langsames Modell wird nicht abgewuergt", () => {
  // Gemessen: triviale Fragen brauchen 6-8,6 s. Die Bruecke taktet lange
  // Arbeiten alle 10 s. 90 s lassen dafuer reichlich Luft.
  assert.equal(STILLE_GRENZE_MS, 90_000);
});

test("schweigt der Strom, wird gemeldet UND abgebrochen", () => {
  // Beides ist noetig: ohne cancel() wartet reader.read() weiter und die
  // Schleife des Aufrufers kommt nie zurueck — der Chat haengt trotz Meldung.
  const uhr = uhrAttrappe();
  let gemeldet = 0, abgebrochen = 0;
  const leser = { cancel: () => { abgebrochen += 1; } };
  const wache = starteStilleWache(leser, () => { gemeldet += 1; }, uhr);
  assert.equal(wache.hatZugeschlagen, false);
  uhr.stelleVor(90_000);
  assert.equal(gemeldet, 1);
  assert.equal(abgebrochen, 1);
  assert.equal(wache.hatZugeschlagen, true);
});

test("jedes Lebenszeichen stellt die Uhr zurueck", () => {
  // Sonst raesse die Wache mitten in eine lange, gesunde Antwort hinein.
  const uhr = uhrAttrappe();
  let gemeldet = 0;
  const wache = starteStilleWache({ cancel() {} }, () => { gemeldet += 1; }, uhr);
  for (let i = 0; i < 5; i++) { uhr.stelleVor(89_000); wache.lebenszeichen(); }
  assert.equal(gemeldet, 0, "fuenf Runden knapp unter der Grenze sind kein Stillstand");
  uhr.stelleVor(90_000);
  assert.equal(gemeldet, 1);
});

test("beenden raeumt die Uhr ab", () => {
  const uhr = uhrAttrappe();
  let gemeldet = 0;
  starteStilleWache({ cancel() {} }, () => { gemeldet += 1; }, uhr).beenden();
  assert.equal(uhr.offeneWecker(), 0, "sonst sammeln sich bei vielen Antworten offene Zeitgeber");
  uhr.stelleVor(90_000);
  assert.equal(gemeldet, 0);
});

test("ein Fehler in der Meldung verhindert den Abbruch NICHT", () => {
  // Der Abbruch ist der eigentliche Dienst. Waere er von der Meldung
  // abhaengig, haengt der Chat genau dann, wenn die Oberflaeche klemmt.
  const uhr = uhrAttrappe();
  let abgebrochen = 0;
  starteStilleWache({ cancel: () => { abgebrochen += 1; } }, () => { throw new Error("Oberflaeche weg"); }, uhr);
  uhr.stelleVor(90_000);
  assert.equal(abgebrochen, 1);
});

test("ein Leser ohne cancel bringt nichts zum Absturz", () => {
  const uhr = uhrAttrappe();
  let gemeldet = 0;
  starteStilleWache(null, () => { gemeldet += 1; }, uhr);
  uhr.stelleVor(90_000);
  assert.equal(gemeldet, 1);
});

test("angefangener Text bleibt stehen — ihn wegzuwerfen waere ein zweiter Verlust", () => {
  const text = stilleText("Die Hauptstadt von Italien ist");
  assert.ok(text.startsWith("Die Hauptstadt von Italien ist"));
  assert.match(text, /Abgebrochen/);
  assert.match(text, /erneut versuchen/);
});

test("ohne Text sagt die Meldung, was passiert ist", () => {
  const text = stilleText("");
  assert.match(text, /90 Sekunden lang nicht mehr gemeldet/);
  assert.doesNotMatch(text, /undefined|null|\[object/);
});

test("beide Stromfamilien sind bewacht — das ist der Kern", () => {
  // GEGENPROBE zum Muster "nur eine Familie geschuetzt": chat-stream.js hatte
  // die Wache, chatClient.js nicht, und genau dort ist es passiert. Dieser
  // Fall schlaegt an, sobald eine der beiden Dateien sie wieder verliert.
  for (const datei of ["../public/ai/chat-stream.js", "../public/ai/chatClient.js"]) {
    const text = lies(datei);
    assert.match(text, /starteStilleWache\(/, `${datei} bewacht seinen Strom nicht`);
    assert.match(text, /lebenszeichen\(\)/, `${datei} stellt die Uhr nicht zurueck`);
  }
});

test("beide Familien melden aus DERSELBEN Quelle", () => {
  // Frueher stand der Satz fest verdrahtet in chat-stream.js. Zwei Kopien
  // desselben Textes laufen frueher oder spaeter auseinander — dann klingt
  // derselbe Vorfall je nach Modellwahl anders. Jetzt kommt er aus
  // stilleText(), und niemand darf ihn wieder abschreiben.
  for (const datei of ["../public/ai/chat-stream.js", "../public/ai/chatClient.js"]) {
    const text = lies(datei);
    assert.match(text, /stilleText\(/, `${datei} baut die Meldung selbst`);
    assert.doesNotMatch(text, /Sekunden lang nicht mehr gemeldet\./, `${datei} hat den Satz abgeschrieben`);
  }
});
