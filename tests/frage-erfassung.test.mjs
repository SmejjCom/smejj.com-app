// smejj.com — Klient-Seite der Fragen-Erfassung: loest nur aus, entscheidet nichts, bricht nie.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Das Modul importiert /assets/... — in Node nicht aufloesbar. Deshalb wird es
// mit Stubs an Stelle der beiden Importe in einen Temp-Ordner kopiert (dasselbe
// Muster wie tests/chat-store-selbstheilung.test.mjs).
async function ladeModul() {
  const quelle = readFileSync(new URL("../public/ai/frage-erfassung.js", import.meta.url), "utf8");
  const ersetzt = quelle
    .replace('import { API_ORIGIN, CLIENT_ROUTES } from "/assets/config.js";',
      'const API_ORIGIN = "https://api.test"; const CLIENT_ROUTES = { api: { trainingCapture: "/api/training/capture" } };')
    .replace('import { bridgeAuthHeaders } from "/assets/ai/chat-stream.js";',
      'function bridgeAuthHeaders() { return { Authorization: "Bearer probe" }; }');
  assert.notEqual(ersetzt, quelle, "beide Importe muessen ersetzt worden sein");
  const ordner = mkdtempSync(join(tmpdir(), "smejj-frage-erfassung-"));
  const datei = join(ordner, "frage-erfassung.mjs");
  writeFileSync(datei, ersetzt);
  return import(pathToFileURL(datei).href);
}

function speicher(consent) {
  const werte = new Map();
  if (consent !== undefined) werte.set("smejj.privacy-consent.v1", JSON.stringify(consent));
  return { getItem: (k) => (werte.has(k) ? werte.get(k) : null) };
}

test("ohne lokales Ja wird nichts gesendet — auch nicht bei gesetzter, aber unbestaetigter Einwilligung", async () => {
  const m = await ladeModul();
  let aufrufe = 0;
  const fetchImpl = async () => { aufrufe += 1; return { ok: true }; };
  const body = { messages: [{ role: "user", content: "Wie heisst die Plattform?" }] };
  assert.deepEqual(await m.erfasseFrageFuersTraining(body, { fetchImpl, storage: speicher(undefined) }), { ausgeloest: false, grund: "keine_einwilligung_lokal" });
  assert.deepEqual(await m.erfasseFrageFuersTraining(body, { fetchImpl, storage: speicher({ training: true, serverConsentGranted: false }) }), { ausgeloest: false, grund: "keine_einwilligung_lokal" });
  assert.equal(aufrufe, 0);
});

test("mit bestaetigter Einwilligung geht genau die letzte Nutzerfrage an /api/training/capture", async () => {
  const m = await ladeModul();
  const gesendet = [];
  const fetchImpl = async (url, init) => { gesendet.push({ url, init }); return { ok: true }; };
  const body = { messages: [
    { role: "user", content: "alte Frage" },
    { role: "assistant", content: "Antwort" },
    { role: "user", content: "genauer:   Wie schreibt man   den Namen?  " }
  ] };
  const ergebnis = await m.erfasseFrageFuersTraining(body, { fetchImpl, storage: speicher({ training: true, serverConsentGranted: true }) });
  assert.deepEqual(ergebnis, { ausgeloest: true });
  assert.equal(gesendet.length, 1);
  assert.equal(gesendet[0].url, "https://api.test/api/training/capture");
  assert.equal(gesendet[0].init.method, "POST");
  assert.equal(gesendet[0].init.credentials, "include");
  assert.equal(gesendet[0].init.headers.Authorization, "Bearer probe");
  // Steuerwort und Mehrfach-Leerzeichen sind keine Frage; die Antwort wird NIE mitgeschickt.
  assert.deepEqual(JSON.parse(gesendet[0].init.body), { frage: "Wie schreibt man den Namen?" });
});

test("dieselbe Frage wird nicht doppelt erfasst (Neu generieren)", async () => {
  const m = await ladeModul();
  let aufrufe = 0;
  const fetchImpl = async () => { aufrufe += 1; return { ok: true }; };
  const body = { messages: [{ role: "user", content: "Was kostet smejj.com?" }] };
  const storage = speicher({ training: true, serverConsentGranted: true });
  await m.erfasseFrageFuersTraining(body, { fetchImpl, storage });
  const zweites = await m.erfasseFrageFuersTraining(body, { fetchImpl, storage });
  assert.equal(aufrufe, 1);
  assert.equal(zweites.grund, "schon_erfasst");
});

test("ein Netzfehler bleibt stumm und wirft nie", async () => {
  const m = await ladeModul();
  const fetchImpl = async () => { throw new Error("offline"); };
  const body = { messages: [{ role: "user", content: "Frage im Funkloch" }] };
  const ergebnis = await m.erfasseFrageFuersTraining(body, { fetchImpl, storage: speicher({ training: true, serverConsentGranted: true }) });
  assert.deepEqual(ergebnis, { ausgeloest: false, grund: "fehler_stumm" });
});

test("letzteFrage: ohne Nutzernachricht leer, Anhang-Objekte werden nicht zu Text", async () => {
  const m = await ladeModul();
  assert.equal(m.letzteFrage({ messages: [{ role: "assistant", content: "nur Antwort" }] }), "");
  assert.equal(m.letzteFrage({}), "");
  assert.equal(m.letzteFrage({ task: "genauer:  Was  kostet smejj.com? " }), "Was kostet smejj.com?");
  assert.equal(m.letzteFrage({ messages: [{ role: "user", text: "Feld text statt content" }] }), "Feld text statt content");
});

test("der Haken in chat-stream.js laedt das Modul dynamisch und wartet nicht darauf", () => {
  const quelle = readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");
  const stelle = quelle.indexOf('import("/assets/ai/frage-erfassung.js")');
  assert.ok(stelle > 0, "Haken fehlt");
  const zeile = quelle.slice(quelle.lastIndexOf("\n", stelle) + 1, quelle.indexOf("\n", stelle));
  assert.ok(!/await/.test(zeile), "der Haken darf den Sendepfad nicht aufhalten");
  assert.ok(/\.catch\(/.test(zeile), "der Haken muss stumm scheitern");
  assert.ok(quelle.indexOf("await versucheLokaleAntwort(body", stelle) > stelle, "Erfassung steht VOR der lokalen Antwort — auch lokal beantwortete Fragen zaehlen");
});
