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
import { readFileSync } from "node:fs";
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
  // in server.js bliebe jede Absage weiterhin ein 500, und alle Pruefungen
  // oben waeren gruen fuer nichts.
  const server = readFileSync(fileURLToPath(new URL("../src/server.js", import.meta.url)), "utf8");
  assert.match(server, /fehlerAntwort\(res, error\)/, "der oberste catch nutzt fehlerAntwort");
  assert.doesNotMatch(server, /json\(res, 500, \{ error: error\.message/, "das pauschale 500 ist weg");
  assert.match(server, /reject\(zuGrossFehler\(\)\)/, "auch der zweite Body-Leser wirft den Fehler mit Status");
  assert.doesNotMatch(server, /new Error\("Request too large"\)/, "kein nackter Fehler mehr");
});
