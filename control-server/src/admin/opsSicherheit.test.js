// smejj.com — Unit-Tests fuer die Sicherheitslage.
//
// Kern: das Modul ist eine Linse, kein zweiter Speicher. Es darf nichts
// behaupten, was es nicht aus Audit-Log und Verzeichnis gelesen hat.
//
// Ausfuehren: node --test control-server/src/admin/opsSicherheit.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { sicherheitsUebersicht } from "./opsSicherheit.js";

const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const STUNDE = 60 * 60 * 1000;

function eintrag(action, felder = {}) {
  return {
    at: new Date(JETZT - STUNDE).toISOString(),
    action,
    target: "u_ziel",
    actor: { email: "chefin@example.de" },
    reason: "Begruendung steht im Audit-Log",
    ...felder
  };
}

const LEERER_INDEX = async () => ({ ok: true, entries: [] });

test("nur sicherheitsrelevante Aktionen werden gezeigt", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT, leseIndex: LEERER_INDEX,
    leseAudit: async () => ({ ok: true, entries: [
      eintrag("impersonation.break_glass"),
      eintrag("flag.geaendert"),
      eintrag("ankuendigung.erstellt"),
      eintrag("user.delete")
    ] })
  });
  assert.equal(e.ereignisse.gesamtImZeitraum, 2, "Flags und Ankuendigungen sind kein Sicherheitsereignis");
  assert.equal(e.ereignisse.davonHoch, 2);
});

test("hohes Gewicht steht oben", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT, leseIndex: LEERER_INDEX,
    leseAudit: async () => ({ ok: true, entries: [
      eintrag("user.verify"), eintrag("user.verify"), eintrag("impersonation.break_glass")
    ] })
  });
  assert.equal(e.ereignisse.nachAktion[0].aktion, "impersonation.break_glass",
    "ein Break-Glass steht ueber zwei Bestaetigungen, auch wenn es seltener ist");
});

test("der Grund bleibt im Audit-Log — hier stehen nur Kopfdaten", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT, leseIndex: LEERER_INDEX,
    leseAudit: async () => ({ ok: true, entries: [
      eintrag("user.delete", { reason: "Vertrauliche Begruendung mit Kundennamen" })
    ] })
  });
  const text = JSON.stringify(e);
  assert.equal(text.includes("Kundennamen"), false, "der Grund wird nicht dupliziert");
  assert.deepEqual(Object.keys(e.ereignisse.letzte[0]).sort(), ["akteur", "aktion", "am", "gewicht", "ziel"]);
});

test("ein unlesbares Audit-Log wird benannt, nicht als Ruhe ausgelegt", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT, leseIndex: LEERER_INDEX,
    leseAudit: async () => ({ ok: false, error: "audit_unreadable" })
  });
  assert.equal(e.ok, true, "die Ansicht bleibt bedienbar");
  assert.equal(e.ereignisse.erreichbar, false);
  assert.equal(e.ereignisse.grund, "audit_unreadable");
  assert.equal(e.ereignisse.gesamtImZeitraum, undefined, "keine erfundene Null");
});

test("eine geworfene Ausnahme kippt die Ansicht nicht", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT,
    leseAudit: async () => { throw new Error("Netz weg"); },
    leseIndex: async () => { throw new Error("Index weg"); }
  });
  assert.equal(e.ok, true);
  assert.equal(e.ereignisse.erreichbar, false);
  assert.equal(e.konten.erreichbar, false);
});

test("gesperrte und blockierte Konten werden gezaehlt und benannt", async () => {
  const e = await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT,
    leseAudit: async () => ({ ok: true, entries: [] }),
    leseIndex: async () => ({ ok: true, entries: [
      { email: "a@example.de", status: "active", loginLockedUntil: new Date(JETZT + STUNDE).toISOString(), activeSessions: 0, emailVerified: true },
      { email: "b@example.de", status: "blocked", loginLockedUntil: null, activeSessions: 2, emailVerified: true },
      { email: "c@example.de", status: "active", loginLockedUntil: new Date(JETZT - STUNDE).toISOString(), activeSessions: 1, emailVerified: true }
    ] })
  });
  assert.equal(e.konten.anmeldungGesperrt, 1, "eine abgelaufene Sperre ist keine Sperre");
  assert.equal(e.konten.blockiert, 1);
  assert.equal(e.konten.offeneSitzungen, 3);
  assert.equal(e.konten.auffaellige.length, 2);
});

test("der Zeitraum ist begrenzt und wird mitgeteilt", async () => {
  let gefragt = null;
  await sicherheitsUebersicht({
    env: {}, jetztMs: JETZT, leseIndex: LEERER_INDEX,
    tage: 999,
    leseAudit: async (p) => { gefragt = p; return { ok: true, entries: [] }; }
  });
  assert.equal(gefragt.from >= "2026-04-29", true, "hoechstens 90 Tage zurueck");
});
