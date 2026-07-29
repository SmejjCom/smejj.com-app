// smejj.com — Unit-Tests fuer den Taktgeber des Zustellprotokoll-Aufraeumens.
//
// Der wichtigste Test ist der langweiligste: OHNE SPEICHER STARTET NICHTS.
// Ein Taktgeber, der jeden Tag in einen nicht eingerichteten Speicher greift,
// erzeugt eine Warnung pro Tag und bringt niemandem etwas.
//
// Ausfuehren: node --test control-server/src/auth/mailLogJanitor.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { starteMailLogAufraeumen } from "./mailLogJanitor.js";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_BUCKET: "eimer",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim"
});

/** Sammelt Zeitgeber statt sie laufen zu lassen — der Test steuert die Uhr. */
function uhr() {
  const geplant = { timeouts: [], intervalle: [] };
  return {
    geplant,
    setTimeoutImpl(fn, ms) { geplant.timeouts.push({ fn, ms }); return { unref() { this.unrefed = true; } }; },
    setIntervalImpl(fn, ms) { geplant.intervalle.push({ fn, ms }); return { unref() { this.unrefed = true; } }; },
    clearIntervalImpl() {},
    clearTimeoutImpl() {}
  };
}

function sammler() {
  const zeilen = [];
  return { zeilen, log: (t) => zeilen.push(["log", t]), warn: (t) => zeilen.push(["warn", t]) };
}

test("OHNE OBJEKTSPEICHER STARTET KEIN TAKTGEBER", () => {
  const u = uhr();
  let gerufen = 0;
  const griff = starteMailLogAufraeumen({
    env: {}, ...u, aufraeumen: async () => { gerufen += 1; return { ok: true }; }, protokoll: sammler()
  });
  assert.equal(griff.laeuft, false);
  assert.equal(u.geplant.timeouts.length, 0, "es wird nicht einmal ein erster Lauf geplant");
  assert.equal(gerufen, 0);
});

test("ein unvollstaendiger Speicher zaehlt als kein Speicher", () => {
  const u = uhr();
  const griff = starteMailLogAufraeumen({
    env: { IDRIVE_E2_ENDPOINT: "https://beispiel.example" }, ...u, protokoll: sammler()
  });
  assert.equal(griff.laeuft, false, "ohne Eimer geht nichts");
});

test("der erste Lauf kommt verzoegert, danach taeglich", async () => {
  const u = uhr();
  let gerufen = 0;
  const p = sammler();
  starteMailLogAufraeumen({
    env: ENV, ...u, protokoll: p,
    aufraeumen: async () => { gerufen += 1; return { ok: true, geloescht: 0, gefunden: 0, grenzeTag: "2026/04/30" }; }
  });

  assert.equal(u.geplant.timeouts.length, 1);
  assert.equal(u.geplant.timeouts[0].ms, 5 * 60 * 1000, "nicht sofort beim Start");
  assert.equal(gerufen, 0, "vor Ablauf der Verzoegerung passiert nichts");

  await u.geplant.timeouts[0].fn();
  assert.equal(gerufen, 1);
  assert.equal(u.geplant.intervalle.length, 1);
  assert.equal(u.geplant.intervalle[0].ms, 24 * 60 * 60 * 1000);

  await u.geplant.intervalle[0].fn();
  assert.equal(gerufen, 2);
});

test("AUCH DIE NULL WIRD GEMELDET", async () => {
  // Sonst ist "es laeuft und es gibt nichts zu tun" nicht von "es laeuft gar
  // nicht" zu unterscheiden — und genau das war der Fehler davor.
  const u = uhr();
  const p = sammler();
  starteMailLogAufraeumen({
    env: ENV, ...u, protokoll: p,
    aufraeumen: async () => ({ ok: true, geloescht: 0, gefunden: 0, grenzeTag: "2026/04/30" })
  });
  await u.geplant.timeouts[0].fn();
  assert.equal(p.zeilen.length, 1);
  assert.equal(p.zeilen[0][0], "log");
  assert.equal(p.zeilen[0][1].includes("0 von 0"), true);
  assert.equal(p.zeilen[0][1].includes("90 Tage"), true);
});

test("ein Fehlschlag wird gemeldet, kippt aber nichts", async () => {
  const u = uhr();
  const p = sammler();
  starteMailLogAufraeumen({
    env: ENV, ...u, protokoll: p,
    aufraeumen: async () => ({ ok: false, error: "listing_http_503" })
  });
  await u.geplant.timeouts[0].fn();
  assert.equal(p.zeilen[0][0], "warn");
  assert.equal(p.zeilen[0][1].includes("listing_http_503"), true);
  assert.equal(u.geplant.intervalle.length, 1, "der Takt laeuft trotzdem weiter");
});

test("EINE GEWORFENE AUSNAHME REISST DEN SERVER NICHT MIT", async () => {
  const u = uhr();
  const p = sammler();
  starteMailLogAufraeumen({
    env: ENV, ...u, protokoll: p,
    aufraeumen: async () => { throw new Error("IDrive weg"); }
  });
  await u.geplant.timeouts[0].fn();
  assert.equal(p.zeilen[0][0], "warn");
  assert.equal(p.zeilen[0][1].includes("IDrive weg"), true);
});

test("ein unvollstaendiger Durchgang sagt, dass er weitermacht", async () => {
  const u = uhr();
  const p = sammler();
  starteMailLogAufraeumen({
    env: ENV, ...u, protokoll: p,
    aufraeumen: async () => ({ ok: true, geloescht: 500, gefunden: 1200, grenzeTag: "2026/04/30", unvollstaendig: true })
  });
  await u.geplant.timeouts[0].fn();
  assert.equal(p.zeilen[0][1].includes("500 von 1200"), true);
  assert.equal(p.zeilen[0][1].includes("naechste Lauf"), true);
});

test("stop() haelt beide Zeitgeber an", async () => {
  const u = uhr();
  let geleert = 0;
  const griff = starteMailLogAufraeumen({
    env: ENV,
    setTimeoutImpl: u.setTimeoutImpl, setIntervalImpl: u.setIntervalImpl,
    clearTimeoutImpl: () => { geleert += 1; }, clearIntervalImpl: () => { geleert += 1; },
    aufraeumen: async () => ({ ok: true, geloescht: 0, gefunden: 0, grenzeTag: "x" }),
    protokoll: sammler()
  });
  await u.geplant.timeouts[0].fn();
  griff.stop();
  assert.equal(geleert, 2);
});
