// smejj.com — Nutzungszaehler (job_konto_glas_20260726, Schritt 2).
// Lokal-first: Zaehlt Nachrichten/Sprachsekunden/Coding-Laeufe pro Monat,
// setzt sich beim Monatswechsel zurueck und darf NIE etwas blockieren.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const store = new Map();
const storage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const { readUsage, recordUsage, usageSummary, currentPeriod } = await import("../public/usage-meter.js");

test("zaehlt Nachrichten und Coding-Laeufe im aktuellen Monat", () => {
  store.clear();
  const now = new Date(2026, 6, 26);
  recordUsage("messages", 1, storage, now);
  recordUsage("messages", 1, storage, now);
  recordUsage("codingTasks", 1, storage, now);
  const usage = readUsage(storage, now);
  assert.equal(usage.messages, 2);
  assert.equal(usage.codingTasks, 1);
  assert.equal(usage.period, "2026-07");
});

test("Monatswechsel setzt alle Zaehler automatisch zurueck", () => {
  store.clear();
  recordUsage("messages", 5, storage, new Date(2026, 6, 31));
  const august = readUsage(storage, new Date(2026, 7, 1));
  assert.equal(august.messages, 0);
  assert.equal(august.period, "2026-08");
});

test("fail-safe: kaputter Speicher und unbekannte Zaehler blockieren nichts", () => {
  store.clear();
  store.set("smejj.usage.v1", "kein json {");
  assert.equal(readUsage(storage).messages, 0);
  recordUsage("gibtEsNicht", 1, storage);
  recordUsage("messages", -3, storage);
  assert.equal(readUsage(storage).messages, 0);
  const kaputt = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); } };
  assert.equal(recordUsage("messages", 1, kaputt).messages, 0);
});

test("usageSummary rundet Sprachsekunden auf Minuten", () => {
  store.clear();
  const now = new Date(2026, 6, 26);
  recordUsage("voiceSeconds", 150, storage, now);
  assert.equal(usageSummary(storage, now).voiceMinutes, 3);
  assert.equal(currentPeriod(now), "2026-07");
});

test("Zaehlpunkte verdrahtet OHNE Start-Lock-Dateien anzufassen", () => {
  // Eingehaengt ueber profile-dock.js (lock-frei, Muster auth-gate.js).
  const dock = fs.readFileSync("public/profile-dock.js", "utf8");
  assert.match(dock, /initUsageCapture\(\)/);
  // Beobachter-Vertraege: Start-Log-Eintraege und Coding-Statuszeile.
  const meter = fs.readFileSync("public/usage-meter.js", "utf8");
  assert.match(meter, /#startLog/);
  assert.match(meter, /Job wird eingeplant\./);
  // Der Wortlaut existiert weiterhin in der (eingefrorenen) Coding-Quelle —
  // aendert er sich dort je mit Freigabe, schlaegt dieser Test Alarm.
  const coding = fs.readFileSync("public/autonomous-coding.js", "utf8");
  assert.match(coding, /setNotice\("Job wird eingeplant\."\)/);
  // Eingefrorene Dateien bleiben unangetastet (kein recordUsage darin).
  assert.doesNotMatch(coding, /recordUsage/);
  assert.doesNotMatch(fs.readFileSync("public/ai/chatClient.js", "utf8"), /recordUsage/);
  const konto = fs.readFileSync("public/account-privacy.js", "utf8");
  assert.match(konto, /usageSummary/);
  assert.match(konto, /usageMessages/);
});
