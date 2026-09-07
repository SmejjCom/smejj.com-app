// Waechter: Client und Server muessen Medienauftraege GLEICH erkennen.
//
// Befund 2026-09-07 (A-bis-Z-Pruefung): public/medien-absicht.js behauptete im
// Kommentar, seine Muster seien "bewusst dieselben wie in
// chat-bridge-bilder.js" — waren sie aber nicht. Dem Browser fehlten zwoelf
// Verben (zeig/zeige/zeigen, bau/bauen, kannst/kann, moechte/möchte, will,
// produce, zeichen/zeichene). Folge: "Zeige mir ein Video von einer Katze"
// galt im Browser nicht als Medienauftrag; bei gewaehltem Katalog-Modell
// antwortete der Client mit Text und die Bruecke sah den Auftrag nie.
//
// Zwei Kopien eines Musters laufen immer auseinander — ausser ein Waechter
// haelt sie zusammen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wurzel = fileURLToPath(new URL("../", import.meta.url));
const client = readFileSync(wurzel + "public/medien-absicht.js", "utf8");
const server = readFileSync(wurzel + "public/chat-bridge-bilder.js", "utf8");

/**
 * Zieht die Wortliste aus einem benannten Verb-/Motiv-Ausdruck.
 * Bewusst ohne verschachtelte Maskierung: die Zeile wird gesucht, dann der
 * Inhalt der ersten runden Klammer genommen.
 */
export function woerter(quelle, name) {
  const zeile = quelle.split("\n").find((z) => z.includes(`const ${name} = /`));
  if (!zeile) return new Set();
  const auf = zeile.indexOf("(");
  const zu = zeile.lastIndexOf(")");
  if (auf < 0 || zu <= auf) return new Set();
  return new Set(zeile.slice(auf + 1, zu).split("|").map((w) => w.trim()).filter(Boolean));
}

test("der Client kennt JEDES Verb, das der Server kennt", () => {
  const imClient = woerter(client, "MEDIEN_VERB");
  const bilder = woerter(server, "BILDER_VERB");
  const video = woerter(server, "VIDEO_VERB");
  assert.ok(imClient.size > 10, `MEDIEN_VERB nicht gefunden oder zu klein (${imClient.size})`);
  assert.ok(bilder.size > 10, `BILDER_VERB nicht gefunden (${bilder.size})`);
  assert.ok(video.size > 10, `VIDEO_VERB nicht gefunden (${video.size})`);
  const fehlend = [...bilder, ...video].filter((w) => !imClient.has(w));
  assert.deepEqual(fehlend, [], `dem Browser fehlen Verben, die der Server kennt: ${fehlend.join(", ")}`);
});

test("die Motivwoerter laufen ebenfalls im Gleichschritt", () => {
  const bildClient = woerter(client, "BILD_MOTIV");
  const bildServer = woerter(server, "BILDER_MOTIV");
  assert.ok(bildServer.size > 5, "BILDER_MOTIV nicht gefunden");
  const fehlend = [...bildServer].filter((w) => !bildClient.has(w));
  assert.deepEqual(fehlend, [], `dem Browser fehlen Motivwoerter: ${fehlend.join(", ")}`);
});

test("KAPUTTE PROBE: der Waechter erkennt eine Luecke wirklich", () => {
  const schmal = 'const MEDIEN_VERB = /(male|malen)/i;';
  const breit = 'const BILDER_VERB = /(male|malen|zeige|bau|kannst|will|create)/i;';
  const fehlend = [...woerter(breit, "BILDER_VERB")].filter((w) => !woerter(schmal, "MEDIEN_VERB").has(w));
  assert.ok(fehlend.length > 0, "der Waechter wuerde eine echte Luecke nicht bemerken");
  // Gesunde Probe: gleiche Listen ergeben keine Luecke.
  const gleich = 'const BILDER_VERB = /(male|malen)/i;';
  assert.deepEqual([...woerter(gleich, "BILDER_VERB")].filter((w) => !woerter(schmal, "MEDIEN_VERB").has(w)), []);
});
