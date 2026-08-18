// Favicon-Beschaffung: der Server holt das Icon, weil die Sicherheitsregel
// der Seite fremde Bildadressen sperrt. Diese Tests halten fest, was dabei
// NICHT passieren darf — ein Symbol ist keinen Sicherheitsverlust wert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  iconAdressen, istBildTyp, alsDatenWert, holeFavicon, MAX_ICON_BYTES
} from "../control-server/src/routes/faviconHolen.js";

function antwort({ ok = true, typ = "image/png", bytes = 100 } = {}) {
  return {
    ok,
    headers: { get: (n) => (n.toLowerCase() === "content-type" ? typ : null) },
    arrayBuffer: async () => new Uint8Array(bytes).buffer
  };
}

test("Icon-Adressen werden aus dem HTML gelesen und absolut gemacht", () => {
  const html = `<link rel="icon" href="/i.png"><link rel="apple-touch-icon" href="https://cdn.x.de/a.png">`;
  const liste = iconAdressen(html, "https://beispiel.de/unterseite/");
  assert.ok(liste.includes("https://beispiel.de/i.png"), "relative Adresse wird an der Seite aufgeloest");
  assert.ok(liste.includes("https://cdn.x.de/a.png"));
  assert.ok(liste.includes("https://beispiel.de/favicon.ico"), "der uebliche Ort ist immer letzter Kandidat");
});

// rel kann mehrere Werte tragen, und die Reihenfolge der Attribute im Tag ist
// beliebig — eine naive Suche nach 'rel="icon" href=' findet beides nicht.
test("shortcut icon und umgekehrte Attribut-Reihenfolge werden erkannt", () => {
  const html = `<link href="/a.ico" rel="shortcut icon">`;
  assert.ok(iconAdressen(html, "https://b.de/").includes("https://b.de/a.ico"));
});

test("nur Bildtypen werden akzeptiert", () => {
  assert.equal(istBildTyp("image/png"), true);
  assert.equal(istBildTyp("image/x-icon; charset=binary"), true);
  assert.equal(istBildTyp("text/html"), false, "HTML ist kein Icon — sonst landet eine Fehlerseite im Tab");
  assert.equal(istBildTyp(""), false);
});

test("der Datenwert traegt den richtigen Typ", () => {
  assert.match(alsDatenWert(new Uint8Array([1, 2, 3]), "image/png"), /^data:image\/png;base64,/);
});

// SSRF: die Zielpruefung der Route (blockt private Netze) wird hineingereicht
// und MUSS greifen. Ohne sie waere der Favicon-Weg ein offenes Tor ins
// interne Netz — genau daran, dass sie hineingereicht statt nachgebaut wird,
// haengt, dass hier keine zweite, schwaechere Regel entsteht.
test("blockierte Ziele werden uebersprungen, nicht geholt", async () => {
  let geholt = 0;
  const daten = await holeFavicon(
    `<link rel="icon" href="http://169.254.169.254/latest/meta-data/">`,
    "https://beispiel.de/",
    {
      fetchImpl: async () => { geholt += 1; return antwort(); },
      pruefeZiel: (u) => ({ ok: !/169\.254|localhost|127\./.test(u) })
    }
  );
  assert.equal(geholt, 1, "nur der erlaubte Rueckfall /favicon.ico darf geholt werden");
  assert.match(daten, /^data:image\/png/);
});

test("zu grosse Icons werden verworfen", async () => {
  const daten = await holeFavicon("", "https://beispiel.de/", {
    fetchImpl: async () => antwort({ bytes: MAX_ICON_BYTES + 1 })
  });
  assert.equal(daten, "", "ein Megabyte-Bild gehoert nicht in jede Chat-Antwort");
});

test("HTML statt Bild wird verworfen", async () => {
  const daten = await holeFavicon("", "https://beispiel.de/", {
    fetchImpl: async () => antwort({ typ: "text/html" })
  });
  assert.equal(daten, "");
});

// Ein fehlendes Icon darf NIE dazu fuehren, dass die Seite nicht angezeigt
// wird. Deshalb faengt holeFavicon alles ab und liefert "".
test("ein Fehler beim Holen wirft nicht, sondern liefert leer", async () => {
  const daten = await holeFavicon("", "https://beispiel.de/", {
    fetchImpl: async () => { throw new Error("timeout"); }
  });
  assert.equal(daten, "");
});

test("bereits eingebettete Icons werden direkt durchgereicht", async () => {
  let geholt = 0;
  const daten = await holeFavicon(
    `<link rel="icon" href="data:image/png;base64,AAAA">`,
    "https://beispiel.de/",
    { fetchImpl: async () => { geholt += 1; return antwort(); } }
  );
  assert.equal(daten, "data:image/png;base64,AAAA");
  assert.equal(geholt, 0, "kein Netzaufruf noetig");
});
