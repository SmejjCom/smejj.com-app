// smejj.com — 24/7 Synthetic User & E2E Watchdog (Autopilot Nr. 29).
//
// Bis 2026-08-12 war dieses Modul innen eine Attrappe: der Chat-Schritt
// wuerfelte eine Antwortzeit mit Math.random() und prueft, ob ein selbst
// gebauter String laenger als 10 Zeichen ist — er konnte per Konstruktion
// nicht fehlschlagen. Diese Tests halten fest, dass jeder Schritt jetzt
// WIRKLICH scheitern kann, wenn die Kette kaputt ist. Ein Waechter, der nie
// Alarm schlaegt, ist schlimmer als keiner.
import test from "node:test";
import assert from "node:assert/strict";

import {
  runSyntheticAuthCheck,
  runSyntheticChatCheck
} from "../control-server/src/autopilots/syntheticUserWatchdogAutopilot.js";
import { pruefeStartseite, holeMitPolster } from "../control-server/src/autopilots/nutzerreiseWaechter.js";

const SECRET = "pruef-geheimnis-mindestens-lang-genug";

test("Anmeldung: gueltiges Token wird angenommen", () => {
  const r = runSyntheticAuthCheck({ env: { SMEJJ_SESSION_SECRET: SECRET } });
  assert.equal(r.passed, true);
  assert.equal(r.step, "auth_token_validation");
});

test("Anmeldung: ohne Geheimnis ist der Weg NICHT pruefbar — und sagt das", () => {
  const r = runSyntheticAuthCheck({ env: {} });
  assert.equal(r.passed, false, "fehlende Konfiguration darf nicht als bestanden durchgehen");
  assert.match(r.error, /SMEJJ_SESSION_SECRET/);
});

test("Chat: HTTP-Fehler der Bruecke ist ein Ausfall", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => "" });
  const r = await runSyntheticChatCheck("Test", { env: { SMEJJ_SESSION_SECRET: SECRET }, fetchImpl });
  assert.equal(r.passed, false);
  assert.match(r.error, /503/);
});

test("Chat: ein LEERER 200er ist ein Ausfall, kein Erfolg", async () => {
  // Genau dieser Fall unterscheidet Messung von Ritual: die Bruecke antwortet
  // formal richtig, liefert aber nichts. Ein Waechter muss das merken.
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "data: [DONE]\n\n" });
  const r = await runSyntheticChatCheck("Test", { env: { SMEJJ_SESSION_SECRET: SECRET }, fetchImpl });
  assert.equal(r.passed, false);
  assert.match(r.error, /leer/);
});

test("Chat: echte Antwort besteht und traegt eine gemessene Zeit", async () => {
  const fetchImpl = async (url, optionen) => {
    assert.match(String(url), /\/api\/agent$/, "es muss der Nutzerweg sein");
    assert.match(String(optionen.headers.Authorization), /^Bearer /, "ohne Anmeldung kein echter Nutzerweg");
    return { ok: true, status: 200, text: async () => "data: {\"choices\":[{\"delta\":{\"content\":\"bereit und einsatzfaehig\"}}]}" };
  };
  const r = await runSyntheticChatCheck("Test", { env: { SMEJJ_SESSION_SECRET: SECRET }, fetchImpl });
  assert.equal(r.passed, true);
  assert.ok(r.ttftMs >= 1, "die Antwortzeit muss gemessen sein");
});

test("Chat: keine erfundene Antwortzeit mehr — ohne Netz kein Erfolg", async () => {
  const fetchImpl = async () => { throw new Error("kein Netz"); };
  const r = await runSyntheticChatCheck("Test", { env: { SMEJJ_SESSION_SECRET: SECRET }, fetchImpl });
  assert.equal(r.passed, false);
  assert.match(r.error, /kein Netz/);
});

// ------------------------------------------------- Netz-Polster (2026-08-30)
// 50 Rot-Phasen à genau ein Takt, alle "fetch failed": einzelne Netzstöße des
// Containers. Genau EIN Wiederholungsversuch bei Verbindungsfehlern — nie bei
// HTTP-Antworten, nie bei Zeitlimits.

test("Polster: ein einzelner Verbindungsstoß wird weggefiltert", async () => {
  let abrufe = 0;
  const fetchImpl = async () => {
    abrufe += 1;
    if (abrufe === 1) throw new Error("fetch failed");
    return { ok: true, text: async () => `<html>${"<p>smejj</p>".repeat(1200)}</html>` };
  };
  const r = await pruefeStartseite({ fetchImpl });
  assert.equal(r.passed, true, "zweiter Versuch erfolgreich — der Stoß ist kein Ausfall");
  assert.equal(abrufe, 2);
});

test("Polster: zwei Fehlversuche in Serie bleiben ROT mit Versuchzahl", async () => {
  const fetchImpl = async () => { throw new Error("fetch failed"); };
  const r = await pruefeStartseite({ fetchImpl });
  assert.equal(r.passed, false, "ein Doppelschlag 1 s auseinander ist ein echter Befund");
  assert.match(r.error, /2 Versuche/);
});

test("Polster: HTTP-Antworten werden nie wiederholt — auch 500 nicht", async () => {
  let abrufe = 0;
  const fetchImpl = async () => { abrufe += 1; return { ok: false, status: 500, text: async () => "" }; };
  const r = await pruefeStartseite({ fetchImpl });
  assert.equal(r.passed, false, "HTTP 500 bleibt P0");
  assert.equal(abrufe, 1, "eine Server-Antwort ist eine Antwort, kein Netzstoß");
  assert.match(r.error, /HTTP 500/);
});

test("Polster: Zeitlimit wird nicht wiederholt — Trägheit soll sichtbar bleiben", async () => {
  let abrufe = 0;
  const fetchImpl = async () => {
    abrufe += 1;
    const fehler = new Error("The operation was aborted due to timeout");
    fehler.name = "TimeoutError";
    throw fehler;
  };
  await assert.rejects(() => holeMitPolster("https://smejj.com/", { fetchImpl, timeoutMs: 15_000 }), /timeout/);
  assert.equal(abrufe, 1, "Zeitlimit ist kein Verbindungsstoß — genau ein Versuch");
});
