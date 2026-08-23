// Waechter: ein Fehler bringt seinen HTTP-Status selbst mit.
//
// DER SCHADEN, DEN ES ABSTELLT (gemessen 2026-08-23 am Konto des Betreibers):
// Der Body-Leser warf ein nacktes `new Error("Request too large")`. Der
// oberste Handler in src/server.js machte daraus ein 500 — also bekam der
// Client fuer eine Absage, die ER verursacht hat, einen SERVERFEHLER.
//
// Das Frontend behandelte (voellig richtig) nur 4xx als "der Server nimmt
// diesen Chat nicht". Sechs zu grosse Chats fielen deshalb durch jede
// Pruefung: weder gerettet noch gemeldet, wochenlang. Ein 500 heisst "unser
// Fehler, versuch es spaeter" — und genau das hat die App getan.
//
// 413 sagt die Wahrheit: die Anfrage ist zu gross, Wiederholen hilft nicht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import {
  httpFehler, zuGrossFehler, fehlerAntwort, readRawBody
} from "../control-server/src/http/respond.js";
import { SECURITY_LIMITS } from "../src/shared/securityPolicy.js";

/** Nimmt auf, womit geantwortet wurde — ohne echten Socket. */
function antwortAttrappe() {
  return {
    kopf: null, status: 0, rumpf: "",
    setHeader() {},
    writeHead(status, kopf) { this.status = status; this.kopf = kopf; },
    end(text) { this.rumpf = text; }
  };
}

test("zuGrossFehler traegt 413 und eine lesbare Kennung", () => {
  const f = zuGrossFehler();
  assert.equal(f.status, 413);
  assert.equal(f.code, "request_zu_gross");
  assert.equal(f.message, "Request too large");
  assert.ok(f instanceof Error, "muss ein echter Error bleiben — er wird geworfen");
});

test("fehlerAntwort nimmt den Status, den der Fehler mitbringt", () => {
  const res = antwortAttrappe();
  fehlerAntwort(res, zuGrossFehler());
  assert.equal(res.status, 413);
  const rumpf = JSON.parse(res.rumpf);
  assert.equal(rumpf.code, "request_zu_gross");
  assert.equal(rumpf.error, "Request too large");
});

test("ohne eigenen Status bleibt es bei 500 — echte Serverfehler heissen weiter 500", () => {
  const res = antwortAttrappe();
  fehlerAntwort(res, new Error("Datenbank weg"));
  assert.equal(res.status, 500);
  assert.equal(JSON.parse(res.rumpf).error, "Datenbank weg");
});

test("unsinnige Statuswerte werden nicht durchgereicht", () => {
  // Sonst koennte ein Fehler aus einer fremden Bibliothek eine 200-Antwort
  // erzwingen und ein Scheitern wie Erfolg aussehen lassen.
  for (const unsinn of [0, 42, 200, 399, 600, 999, "kaputt", null, undefined, NaN]) {
    const res = antwortAttrappe();
    const f = new Error("x");
    f.status = unsinn;
    fehlerAntwort(res, f);
    assert.equal(res.status, 500, `status=${String(unsinn)} darf nicht durchkommen`);
  }
});

test("gueltige Fehlerstatus kommen durch", () => {
  for (const status of [400, 401, 403, 404, 413, 429, 503]) {
    const res = antwortAttrappe();
    fehlerAntwort(res, httpFehler(status, "probe"));
    assert.equal(res.status, status);
  }
});

test("fehlerAntwort haelt auch einen kaputten Fehler aus", () => {
  // Hier kommt man nur im Fehlerfall an — diese Funktion darf selbst keinen
  // neuen ausloesen.
  const res = antwortAttrappe();
  fehlerAntwort(res, null);
  assert.equal(res.status, 500);
  assert.equal(JSON.parse(res.rumpf).error, "Internal error");
});

test("der Body-Leser wirft 413, sobald die Grenze faellt", async () => {
  const req = new EventEmitter();
  const lauf = readRawBody(req);
  // Ein Happen ueber der Grenze — genau der Fall der zu grossen Chats.
  req.emit("data", "x".repeat(SECURITY_LIMITS.maxJsonBodyBytes + 1));
  const fehler = await lauf.then(() => null, (e) => e);
  assert.ok(fehler, "es muss abgelehnt werden");
  assert.equal(fehler.status, 413);
  assert.equal(fehler.code, "request_zu_gross");
});

test("ein Rumpf unter der Grenze kommt unveraendert durch", async () => {
  const req = new EventEmitter();
  const lauf = readRawBody(req);
  req.emit("data", '{"chat":');
  req.emit("data", '{"id":"x"}}');
  req.emit("end");
  assert.equal(await lauf, '{"chat":{"id":"x"}}');
});

test("der oberste Handler ist wirklich angeschlossen", () => {
  // Gegenprobe zum Muster "gebaut, aber nicht verdrahtet": ohne diese Zeile
  // bliebe jede Absage weiterhin ein 500, und alle Pruefungen oben waeren
  // gruen fuer nichts.
  const server = readFileSync(fileURLToPath(new URL("../src/server.js", import.meta.url)), "utf8");
  assert.match(server, /fehlerAntwort\(res, error\)/, "der oberste catch nutzt fehlerAntwort");
  assert.doesNotMatch(server, /json\(res, 500, \{ error: error\.message/, "das pauschale 500 ist weg");
});

test("KEIN Body-Leser wirft mehr einen nackten Fehler", () => {
  // Diese Pruefung SUCHT ihre Dateien, statt sie fest zu kennen: der
  // Auth-Body-Leser stand am 2026-08-23 im Arbeitszweig noch in server.js,
  // im Bauzweig war er laengst nach server-session-helpers.js ausgelagert.
  // Ein Test, der eine Datei festnagelt, meldet nach so einem Umzug gruen
  // und schuetzt nichts mehr — dieselbe Falle wie beim Modellmenue-Waechter.
  //
  // Gesucht wird die STELLE, die abweist (`reject(` plus die Grenze), nicht
  // jede Datei, die das Wort kennt: securityPolicy.js definiert die Zahl nur.
  const wurzeln = ["../src/", "../control-server/src/http/"];
  const treffer = [];
  for (const wurzel of wurzeln) {
    const ordner = fileURLToPath(new URL(wurzel, import.meta.url));
    for (const name of readdirSync(ordner)) {
      if (!name.endsWith(".js")) continue;
      const text = readFileSync(ordner + name, "utf8");
      if (/maxJsonBodyBytes\) reject\(/.test(text)) treffer.push({ name, text });
    }
  }
  assert.ok(treffer.length >= 2, `mindestens zwei Body-Leser erwartet, gefunden: ${treffer.length}`);
  for (const { name, text } of treffer) {
    assert.match(text, /maxJsonBodyBytes\) reject\(zuGrossFehler\(\)\)/,
      `${name} muss den Fehler MIT Status werfen`);
    // Nur die Wurfstelle prueft hier, nicht der Fliesstext: respond.js
    // ERKLAERT den alten nackten Fehler in einem Kommentar, und das soll es
    // auch — die Begruendung ist der halbe Wert der Aenderung.
    assert.doesNotMatch(text, /reject\(new Error\("Request too large"\)\)/,
      `${name} wirft noch nackt`);
  }
});
