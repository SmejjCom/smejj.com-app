// Waechter fuer den gemeinsamen Anmeldezustand.
//
// DER BEFUND (Startphase live gemessen 2026-08-23): /api/auth/me lief ZWEIMAL —
// bei 750 ms (auth-gate.js) und bei 4316 ms (google-login.js), zusammen 1,9 s
// fuer dieselbe Antwort. Der In-Flight-Dedup in getJson greift nur bei
// GLEICHZEITIGEN Anfragen; bei 3,5 s Abstand fiel er nie zusammen.
//
// Ein Anmeldezustand mit Nachhall ist heikel — darum pruefen die Faelle unten
// besonders die Grenzen: kurze Frist, kein Merken von Fehlschlaegen,
// Verwerfen bei Zustandswechsel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FRIST_MS, erzeugeAuthMeSpeicher } from "../public/shared/auth-me-speicher.js";

const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

function uhrAttrappe(start = 1000) {
  let jetzt = start;
  return { uhr: () => jetzt, vor: (ms) => { jetzt += ms; } };
}

test("die Frist ist kuerzer als jede Bedienhandlung", () => {
  assert.ok(FRIST_MS <= 5000, "laenger waere bei einem Anmeldezustand nicht zu verantworten");
  assert.ok(FRIST_MS >= 3000, "kuerzer deckt die gemessenen 3,5 s Abstand nicht ab");
});

test("die zweite Frage bekommt die erste Antwort — EINE Anfrage statt zwei", async () => {
  const u = uhrAttrappe();
  const sp = erzeugeAuthMeSpeicher({ uhr: u.uhr });
  let anfragen = 0;
  const holen = async () => { anfragen += 1; return { authenticated: true, user: { email: "a@b.c" } }; };
  const eins = await sp.hole(holen);
  u.vor(3500);                       // der gemessene Abstand
  const zwei = await sp.hole(holen);
  assert.equal(anfragen, 1, "nur eine echte Anfrage");
  assert.deepEqual(zwei, eins);
});

test("nach der Frist wird frisch gefragt", async () => {
  const u = uhrAttrappe();
  const sp = erzeugeAuthMeSpeicher({ frist: 5000, uhr: u.uhr });
  let anfragen = 0;
  const holen = async () => { anfragen += 1; return { authenticated: true }; };
  await sp.hole(holen);
  u.vor(5001);
  await sp.hole(holen);
  assert.equal(anfragen, 2);
});

test("ein Fehlschlag wird NICHT gemerkt", async () => {
  // Sonst haette eine kurze Stoerung fuenf Sekunden Nachhall — und der Nutzer
  // saehe sich abgemeldet, obwohl er es nicht ist.
  const u = uhrAttrappe();
  const sp = erzeugeAuthMeSpeicher({ uhr: u.uhr });
  let anfragen = 0;
  const holen = async () => { anfragen += 1; return anfragen === 1 ? { ok: false } : { authenticated: true }; };
  const erste = await sp.hole(holen);
  assert.deepEqual(erste, { ok: false });
  assert.equal(sp.frisch, false, "der Fehlschlag darf nicht liegenbleiben");
  const zweite = await sp.hole(holen);
  assert.equal(anfragen, 2, "sofort neu gefragt");
  assert.deepEqual(zweite, { authenticated: true });
});

test("gleichzeitige Fragen teilen sich EINE Anfrage", async () => {
  const sp = erzeugeAuthMeSpeicher();
  let anfragen = 0;
  const holen = () => { anfragen += 1; return new Promise((r) => setTimeout(() => r({ authenticated: true }), 20)); };
  const [a, b, c] = await Promise.all([sp.hole(holen), sp.hole(holen), sp.hole(holen)]);
  assert.equal(anfragen, 1);
  assert.deepEqual(a, b); assert.deepEqual(b, c);
});

test("verwerfen wirkt sofort — fuer An- und Abmeldung", async () => {
  const u = uhrAttrappe();
  const sp = erzeugeAuthMeSpeicher({ uhr: u.uhr });
  let anfragen = 0;
  const holen = async () => { anfragen += 1; return { authenticated: true }; };
  await sp.hole(holen);
  assert.equal(sp.frisch, true);
  sp.verwerfen();
  assert.equal(sp.frisch, false);
  await sp.hole(holen);
  assert.equal(anfragen, 2);
});

test("beide Aufrufer haengen wirklich am Speicher", () => {
  // Gegenprobe zum Muster "gebaut, aber nicht angeschlossen": haengt einer
  // vorbei, fragt er weiter doppelt — und niemandem faellt es auf.
  const gate = lies("../public/auth-gate.js");
  const google = lies("../public/google-login.js");
  // Auf ".hole(" pruefen, nicht auf den Variablennamen: auth-gate.js nimmt den
  // Speicher als PARAMETER (damit Tests ihn ersetzen koennen) und nennt ihn
  // dort schlicht `speicher`. Ein Waechter, der den Namen festnagelt, meldet
  // nach dem naechsten Umbenennen gruen und schuetzt nichts mehr.
  assert.match(gate, /\bspeicher\.hole\(/, "auth-gate.js fragt am Speicher vorbei");
  assert.match(gate, /speicher = authMeSpeicher/, "und die Vorgabe ist der gemeinsame Speicher");
  assert.match(google, /authMeSpeicher\.hole\(/, "google-login.js fragt am Speicher vorbei");
  for (const [name, text] of [["auth-gate.js", gate], ["google-login.js", google]]) {
    assert.match(text, /auth-me-speicher\.js/, `${name} importiert den Speicher nicht`);
  }
});

test("http-json.js bleibt unangetastet — sein Grundsatz gilt weiter", () => {
  // Der "kein Stale-Cache"-Grundsatz dort schuetzt JEDEN anderen Aufruf. Der
  // neue Speicher gilt nur fuer /api/auth/me und nur fuer Sekunden.
  const httpJson = lies("../public/shared/http-json.js");
  assert.doesNotMatch(httpJson, /auth-me-speicher/, "http-json.js darf davon nichts wissen");
  assert.match(httpJson, /inflightGetJson/, "der vorhandene Dedup bleibt");
});
