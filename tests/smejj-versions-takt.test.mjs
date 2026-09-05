// smejj.com — Wächter-TÜV für den smejj-Versions-Takt (Nr. 83, Betreiber-Auftrag
// 2026-09-05). Kaputte UND gesunde Probe — die Hausregel.
// Ausführen: node --test tests/smejj-versions-takt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  fuehreSelbsttestAus, laufSmejjVersionsTakt, SMEJJ_BEWERTUNGEN_ABLAGE, SMEJJ_VERSIONEN_ABLAGE, REGISTER_ID
} from "../control-server/src/autopilots/smejjVersionsTaktAutopilot.js";
import { leseSmejjRegister, setzeSmejjRegister, SMEJJ_MODELL_ID } from "../control-server/src/llm/smejjAlias.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon } from "../control-server/src/admin/opsAutopilotenBereiche.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

const LAUFZEIT = { SMEJJ_1_ENABLED: "YES", SMEJJ_LLM_SMEJJ1_BASE_URL: "https://smejj1.test/v1", SMEJJ_LLM_SMEJJ1_API_KEY: "k1" };

function speicher({ register = null, bewertungen = [], kaputt = null } = {}) {
  const geschrieben = { register: [], bewertungen: [] };
  const fabrik = (praefix) => {
    if (kaputt === praefix) return { lies: async () => { throw new Error("Ablage weg"); }, liste: async () => { throw new Error("Ablage weg"); }, schreib: async () => { throw new Error("Ablage weg"); } };
    if (praefix === SMEJJ_VERSIONEN_ABLAGE) return {
      lies: async (id) => (id === REGISTER_ID ? (geschrieben.register.at(-1) || register) : null),
      schreib: async (d) => { geschrieben.register.push(d); return d; }
    };
    if (praefix === SMEJJ_BEWERTUNGEN_ABLAGE) return {
      liste: async () => ({ ok: true, datensaetze: bewertungen.map((b) => geschrieben.bewertungen.find((g) => g.id === b.id) || b), total: bewertungen.length }),
      schreib: async (d) => { geschrieben.bewertungen.push(d); return d; }
    };
    return { lies: async () => null, liste: async () => ({ ok: true, datensaetze: [] }), schreib: async (d) => d };
  };
  return { fabrik, geschrieben };
}

const bewertung = (id, extra = {}) => ({ id, art: "smejj-bewertung", createdAt: `2026-09-05T${id.slice(-2)}:00:00Z`, status: "neu", version: "smejj-1-1", jobId: id, kandidatNote: 0.61, basisNote: 0.5, kritisch: 0, faelle: 14, referenzNote: 100, adapterPrefix: "con/versions/smejj-1-1/adapter", ...extra });

test("Nr. 83: Selbsttest beurteilt kaputte und gesunde Proben richtig", () => {
  const p = fuehreSelbsttestAus();
  assert.equal(p.bestanden, true, p.fehler.join("; "));
  assert.equal(p.geprueft, 9);
});

test("Nr. 83: erste bestandene Bewertung wird stable, Alias bleibt AUS unter der Referenz, Register wird geschrieben und dem Router gegeben", async () => {
  const { fabrik, geschrieben } = speicher({ bewertungen: [bewertung("job-10")] });
  try {
    const e = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({}), jetztMs: Date.parse("2026-09-05T12:00:00Z") });
    assert.equal(e.ok, true, e.meldung);
    assert.match(e.meldung, /stable smejj-1-1 \(61\.0 %, 0 kritisch\)/);
    assert.match(e.meldung, /Alias smejj AUS — Note 61\.0 % unter Referenz 100 %/);
    assert.match(e.meldung, /1 neue Bewertung\(en\): smejj-1-1 → stable/);
    assert.match(e.meldung, /Register geschrieben/);
    assert.equal(geschrieben.register.length, 1);
    assert.equal(geschrieben.register[0].id, REGISTER_ID);
    assert.equal(geschrieben.register[0].stable, "smejj-1-1");
    assert.equal(geschrieben.register[0].live, false);
    assert.equal(geschrieben.bewertungen[0].status, "befoerdert", "die Bewertung wird als entschieden markiert");
    assert.equal(leseSmejjRegister()?.stable, "smejj-1-1", "der Router bekommt den Stand im Speicher");
  } finally { setzeSmejjRegister(null); }
});

test("Nr. 83: kritische Fehler lehnen ab, bessere Version uebernimmt, Live folgt der Referenz — ein Takt, zwei Entscheidungen in Zeitfolge", async () => {
  const { fabrik, geschrieben } = speicher({
    register: null,
    bewertungen: [
      bewertung("job-12", { version: "smejj-1-2", kandidatNote: 0.9, kritisch: 2, referenzNote: 90 }),
      bewertung("job-11", { version: "smejj-1-1", kandidatNote: 0.61 }),
      bewertung("job-13", { version: "smejj-1-3", kandidatNote: 0.95, kritisch: 0, referenzNote: 90 })
    ]
  });
  try {
    const e = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({}) });
    assert.equal(e.ok, true, e.meldung);
    assert.match(e.meldung, /smejj-1-1 → stable/);
    assert.match(e.meldung, /smejj-1-2 abgelehnt \(kritische_fehler:2\)/);
    assert.match(e.meldung, /smejj-1-3 → stable \(95\.0 %, \+34\.0\)/);
    assert.match(e.meldung, /Alias smejj LIVE — Alias smejj → smejj-1-3/);
    const reg = geschrieben.register.at(-1);
    assert.equal(reg.stable, "smejj-1-3"); assert.equal(reg.live, true);
    assert.deepEqual(reg.versionen.map((v) => `${v.version}:${v.status}`), ["smejj-1-1:ersetzt", "smejj-1-2:abgelehnt", "smejj-1-3:stable"]);
    assert.equal(geschrieben.bewertungen.length, 3, "jede Bewertung ist entschieden");
    // Zweiter Takt ohne neue Bewertungen: nichts aendert sich, Register bleibt.
    const zweiter = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({}) });
    assert.match(zweiter.meldung, /0 neue Bewertung\(en\)/);
    assert.match(zweiter.meldung, /Register unveraendert/);
  } finally { setzeSmejjRegister(null); }
});

test("Nr. 83: rote Laufzeit nimmt dem Alias das Live (Rueckweg), gruene Laufzeit gibt es zurueck", async () => {
  const { fabrik, geschrieben } = speicher({ bewertungen: [bewertung("job-13", { version: "smejj-1-3", kandidatNote: 0.95, referenzNote: 90 })] });
  try {
    const an = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({}) });
    assert.match(an.meldung, /Alias smejj LIVE/);
    const rot = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({ [SMEJJ_MODELL_ID]: { available: false, reason: "HTTP 502" } }) });
    assert.match(rot.meldung, /Alias smejj AUS — Laufzeit smejj-1 rot: HTTP 502/);
    assert.equal(geschrieben.register.at(-1).live, false);
    assert.equal(geschrieben.register.at(-1).stable, "smejj-1-3", "stable bleibt, nur das Live geht");
    const gruen = await laufSmejjVersionsTakt({ env: LAUFZEIT, storeFabrik: fabrik, gesundheit: () => ({ [SMEJJ_MODELL_ID]: { available: true } }) });
    assert.match(gruen.meldung, /Alias smejj LIVE/);
    assert.match(geschrieben.register.at(-1).liveGrund, /wieder gruen/);
  } finally { setzeSmejjRegister(null); }
});

test("Nr. 83: ohne Laufzeit-Konfiguration bleibt der Alias sichtbar AUS mit Grund — und unlesbare Ablagen sind rot", async () => {
  const { fabrik } = speicher({ bewertungen: [bewertung("job-13", { version: "smejj-1-3", kandidatNote: 0.95, referenzNote: 90 })] });
  try {
    const e = await laufSmejjVersionsTakt({ env: {}, storeFabrik: fabrik, gesundheit: () => ({}) });
    assert.equal(e.ok, true);
    assert.match(e.meldung, /Alias smejj AUS — SMEJJ_1_ENABLED nicht gesetzt/);
    const kaputt = await laufSmejjVersionsTakt({ env: {}, storeFabrik: speicher({ kaputt: SMEJJ_VERSIONEN_ABLAGE }).fabrik, gesundheit: () => ({}) });
    assert.equal(kaputt.ok, false); assert.match(kaputt.meldung, /Versionsregister nicht lesbar/);
    const kaputt2 = await laufSmejjVersionsTakt({ env: {}, storeFabrik: speicher({ kaputt: SMEJJ_BEWERTUNGEN_ABLAGE }).fabrik, gesundheit: () => ({}) });
    assert.equal(kaputt2.ok, false); assert.match(kaputt2.meldung, /Bewertungs-Ablage nicht lesbar/);
  } finally { setzeSmejjRegister(null); }
});

test("Nr. 83 ist registriert, laeuft im Laeufer und steht im Bereich 'Modelle & Wissen'", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "smejj-versions-takt");
  assert.ok(eintrag, "Registry-Eintrag fehlt");
  assert.equal(eintrag.nummer, "83");
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("smejj-versions-takt"));
  assert.equal(bereichVon("smejj-versions-takt"), "Modelle & Wissen");
  assert.equal(AUTOPILOTEN.filter((a) => a.nummer === "83").length, 1, "Nummer 83 genau einmal");
  assert.ok(AUTOPILOTEN.find((a) => a.id === "model-lifecycle"), "Nr. 18 bleibt unveraendert im Register");
});
