// smejj.com — Wächter-TÜV für die Deckungs-Autopiloten Nr. 66-70 (2026-08-30).
//
// Kaputte UND gesunde Probe je Wächter — plus die Anschluss-Beweise: Registry
// vollständig, Nummern eindeutig, Taktgeber betreibt alle fünf, Bereiche
// zugeordnet. Genau die Fehlerklasse "Wächter gebaut, aber nicht angeschlossen"
// soll hier scheitern, nicht erst live.
//
// Ausführen: node --test tests/deckungs-waechter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileZustellLog, laufEmailZustell } from "../control-server/src/autopilots/emailZustellAutopilot.js";
import { beurteileFristen, laufDsgvoFristen, DSGVO_FRISTEN_ABLAGE } from "../control-server/src/autopilots/dsgvoFristenAutopilot.js";
import { beurteileAiAct, laufAiAct, normalisiereSystemId } from "../control-server/src/autopilots/aiActAutopilot.js";
import { beurteileAbos, laufAboUmsatz } from "../control-server/src/autopilots/aboUmsatzAutopilot.js";
import { beurteileFlaggen, laufFlaggen, FLAGGEN_ABLAGE, VERALTET_TAGE } from "../control-server/src/autopilots/flaggenAutopilot.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon, zugeordneteKennungen } from "../control-server/src/admin/opsAutopilotenBereiche.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

// ---------------------------------------------------------------- Nr. 66 E-Mail
test("Nr. 66 E-Mail-Zustell-Wache: Serie und Quote rot, gesunder Verkehr grün, unkonfiguriert rot", async () => {
  assert.equal(beurteileZustellLog({ konfiguriert: false }).ok, false, "unkonfiguriertes SMTP ist rot");

  // Konfigurierte SMTP-Werte, damit der Lauf das PROTOKOLL bewertet (und nicht
  // die Konfiguration). Die Werte werden nie benutzt — der leser ist ein Stub.
  const SMTP_AN = { SMEJJ_SMTP_HOST: "mail.example.com", SMEJJ_SMTP_PORT: "465", SMEJJ_SMTP_USER: "u", SMEJJ_SMTP_PASS: "p", SMEJJ_SMTP_FROM: "smejj@example.com" };

  const serie = await laufEmailZustell({
    env: SMTP_AN,
    leser: async () => ({
      ok: true,
      eintraege: [
        { zugestellt: false, grund: "smtp_connect_failed:ETIMEDOUT" },
        { zugestellt: false, grund: "smtp_connect_failed:ETIMEDOUT" },
        { zugestellt: false, grund: "smtp_connect_failed:ETIMEDOUT" }
      ]
    })
  });
  assert.equal(serie.ok, false, "drei Fehlversuche in Serie müssen rot melden");
  assert.match(serie.meldung, /Serie/);

  // mailerConfig(env={}) ist unkonfiguriert — der Lauf muss das EGAL welchen
  // Protokoll-Inhalts rot melden, weil die Anmeldung-Kette dann tot ist.
  const unkonfiguriert = await laufEmailZustell({ env: {}, leser: async () => ({ ok: true, eintraege: [] }) });
  assert.equal(unkonfiguriert.ok, false, "ohne SMTP-Konfiguration ist der Lauf rot, nie grün");

  const gesund = beurteileZustellLog({
    konfiguriert: true,
    eintraege: [
      { zugestellt: true }, { zugestellt: true }, { zugestellt: true },
      { zugestellt: false, grund: "sporadisch" }, { zugestellt: true }, { zugestellt: true }
    ]
  });
  assert.equal(gesund.ok, true, "überwiegend zugestellt ist grün");
  const leer = beurteileZustellLog({ konfiguriert: true, eintraege: [] });
  assert.equal(leer.ok, true, "kein Verkehr ist kein Ausfall");
});

test("Nr. 66: unlesbares Protokoll ist rot — der Nachweis darf nicht fehlen", async () => {
  const rot = await laufEmailZustell({ env: { SMEJJ_SMTP_HOST: "x", SMEJJ_SMTP_PORT: "465", SMEJJ_SMTP_USER: "u", SMEJJ_SMTP_PASS: "p", SMEJJ_SMTP_FROM: "f@x.de" }, leser: async () => ({ ok: false, error: "speicher_nicht_eingerichtet" }) });
  assert.equal(rot.ok, false, "unlesbares Zustellprotokoll muss rot melden");
  assert.match(rot.meldung, /Zustellprotokoll/);
});

// ---------------------------------------------------------------- Nr. 67 DSGVO
test("Nr. 67 DSGVO-Fristen-Wache: überschritten rot, kritisch Karte, ruhig grün", async () => {
  assert.equal(beurteileFristen([{ status: "offen", dringlichkeit: "ueberschritten", id: "g1" }]).ok, false);

  const kartenAblage = [];
  const karte = { schreib: async (d) => { kartenAblage[0] = d; return { ok: true }; }, liste: async () => ({ ok: true, datensaetze: [] }) };
  const kritisch = await laufDsgvoFristen({
    env: {},
    leser: async () => ({ ok: true, vorgaenge: [
      { id: "g2", status: "in_arbeit", dringlichkeit: "kritisch", restfristTage: 3, faelligAm: "2026-09-02" },
      { id: "g3", status: "offen", dringlichkeit: "bald", restfristTage: 8, faelligAm: "2026-09-07" }
    ] }),
    kartenAblage: karte
  });
  assert.equal(kritisch.ok, true, "kritisch ist noch kein Ausfall — grün mit Karte");
  assert.equal(kartenAblage[0].kritisch, 1, "die Karte zählt die kritische Frist");
  assert.equal(kartenAblage[0].dringendste.faelligAm, "2026-09-02", "die Karte nennt die dringendste Fälligkeit");

  const ueberschritten = await laufDsgvoFristen({
    env: {},
    leser: async () => ({ ok: true, vorgaenge: [{ id: "g4", status: "offen", dringlichkeit: "ueberschritten", restfristTage: -2, faelligAm: "2026-08-28" }] }),
    kartenAblage: karte
  });
  assert.equal(ueberschritten.ok, false, "überschrittene Frist muss rot melden");

  const ruhig = await laufDsgvoFristen({ env: {}, leser: async () => ({ ok: true, vorgaenge: [] }), kartenAblage: karte });
  assert.equal(ruhig.ok, true, "keine Vorgänge ist grün");

  const kaputt = await laufDsgvoFristen({ env: {}, leser: async () => ({ ok: false, error: "listing_http_403" }), kartenAblage: karte });
  assert.equal(kaputt.ok, false, "unlesbare Ablage muss rot melden");
});

// ------------------------------------------------------------- Nr. 68 AI-Act
test("Nr. 68 EU-AI-Act-Wache: Drift rot, Schreibweisen gleich, sauber grün", async () => {
  assert.equal(normalisiereSystemId("glm-5.2"), normalisiereSystemId("glm-5-2"), "Punkt und Strich sind Schreibweise");

  const drift = await laufAiAct({
    env: {},
    jetztIso: "2026-08-30T00:00:00.000Z",
    modelle: () => ["glm-5-2", "ox-alpha"]
  });
  assert.equal(drift.ok, false, "ein aktives Modell ohne Verzeichnis-Eintrag muss rot melden");
  assert.match(drift.meldung, /ox-alpha/);

  const sauber = await laufAiAct({
    env: {},
    jetztIso: "2026-08-30T00:00:00.000Z",
    modelle: () => ["glm-5-2", "llama-4-70b", "kimi-k2-7"]
  });
  assert.equal(sauber.ok, true, `die echten Registry-Namen müssen genügen: ${sauber.meldung}`);

  const hochrisiko = beurteileAiAct({
    systeme: [{ id: "x", transparenzpflicht: true, protokolliert: true, risiko: "high" }],
    aktiveModelle: [],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  assert.equal(hochrisiko.ok, false, "high im Bestand ist rot");
});

// ---------------------------------------------------------------- Nr. 69 Abos
test("Nr. 69 Abo-Umsatz-Wache: past_due rot, Sturz rot, klein bleibt grün", async () => {
  const kartenAblage = [];
  const karte = { schreib: async (d) => { kartenAblage[0] = d; return { ok: true }; }, liste: async () => ({ ok: true, datensaetze: [] }) };
  const gut = { ok: true, abgeschnitten: false, zahlend: 12, handlungsbedarf: 0, testmodus: 1, total: 13 };

  const gesund = await laufAboUmsatz({ env: {}, leser: async () => gut, kartenAblage: karte });
  assert.equal(gesund.ok, true, "stabiles Bild ist grün");
  assert.match(gesund.meldung, /Testmodus/);

  const pastDue = await laufAboUmsatz({ env: {}, leser: async () => ({ ...gut, handlungsbedarf: 2 }), kartenAblage: karte });
  assert.equal(pastDue.ok, false, "past_due muss rot melden");

  const sturz = await laufAboUmsatz({
    env: {},
    leser: async () => ({ ...gut, zahlend: 6 }),
    kartenAblage: { schreib: async (d) => { kartenAblage[0] = d; return { ok: true }; }, liste: async () => ({ ok: true, datensaetze: [{ zahlend: 10 }] }) }
  });
  assert.equal(sturz.ok, false, "Sturz von 10 auf 6 Zahlende muss rot melden");

  const klein = await laufAboUmsatz({
    env: {},
    leser: async () => ({ ...gut, zahlend: 3 }),
    kartenAblage: { schreib: async () => ({ ok: true }), liste: async () => ({ ok: true, datensaetze: [{ zahlend: 4 }] }) }
  });
  assert.equal(klein.ok, true, "unter 5 Zahlenden ist kein Trend-Urteil erlaubt");

  const kaputt = await laufAboUmsatz({ env: {}, leser: async () => { throw new Error("verbindung tot"); }, kartenAblage: karte });
  assert.equal(kaputt.ok, false, "unlesbare Abo-Ablage muss rot melden");

  const abgeschnitten = await laufAboUmsatz({ env: {}, leser: async () => ({ ...gut, abgeschnitten: true }), kartenAblage: karte });
  assert.equal(abgeschnitten.ok, false, "abgeschnittenes Listing ist eine unvollständige Messung — rot");
});

// ---------------------------------------------------------------- Nr. 70 Flags
test("Nr. 70 Feature-Flags-Wache: vergessen wird Karte, off darf alt sein", async () => {
  const jetzt = Date.now();
  const TAG = 24 * 60 * 60 * 1000;
  const alt = new Date(jetzt - (VERALTET_TAGE + 10) * TAG).toISOString();

  const kartenAblage = [];
  const karte = { schreib: async (d) => { kartenAblage[0] = d; return { ok: true }; }, liste: async () => ({ ok: true, datensaetze: [] }) };

  const vergessen = await laufFlaggen({
    env: {},
    jetztMs: jetzt,
    leser: async () => ({ ok: true, flags: [
      { name: "neu-menue", status: "partial", updatedAt: alt },
      { name: "sprach-test", status: "on", updatedAt: alt },
      { name: "ruht", status: "off", updatedAt: alt }
    ] }),
    kartenAblage: karte
  });
  assert.equal(vergessen.ok, true, "vergessene Flags sind keine Störung — grün mit Karte");
  assert.equal(kartenAblage[0].veraltetAnzahl, 2, "off zählt nicht mit");
  assert.deepEqual(kartenAblage[0].veraltetNamen, ["neu-menue", "sprach-test"]);

  const ungueltig = await laufFlaggen({
    env: {},
    jetztMs: jetzt,
    leser: async () => ({ ok: true, flags: [{ name: "kaputt", status: "vielleicht", updatedAt: alt }] }),
    kartenAblage: karte
  });
  assert.equal(ungueltig.ok, false, "ungültiger Zustand ist rot (fail-closed)");

  const kaputt = await laufFlaggen({ env: {}, jetztMs: jetzt, leser: async () => ({ ok: false, error: "x" }), kartenAblage: karte });
  assert.equal(kaputt.ok, false, "unlesbare Flag-Ablage muss rot melden");

  const leer = beurteileFlaggen([], jetzt);
  assert.equal(leer.ok, true, "keine Flags ist grün mit der Zahl 0");
});

// ------------------------------------------------- Anschluss-Beweise (Verdrahtung)
test("Anschluss: alle fünf stehen in der Registry, mit eindeutigen Nummern 66-70", () => {
  const ids = ["email-zustell", "dsgvo-fristen", "ai-act-wache", "abo-umsatz-wache", "flaggen-wache"];
  for (const id of ids) {
    assert.ok(AUTOPILOTEN.some((a) => a.id === id), `${id} fehlt in der Registry`);
  }
  const nummern = AUTOPILOTEN.map((a) => a.nummer).filter(Boolean);
  assert.equal(new Set(nummern).size, nummern.length, "Nummern sind eindeutig");
  for (const n of ["66", "67", "68", "69", "70"]) assert.ok(nummern.includes(n), `Nummer ${n} fehlt`);
});

test("Anschluss: der Taktgeber betreibt alle fünf im Control-Server", () => {
  for (const id of ["email-zustell", "dsgvo-fristen", "ai-act-wache", "abo-umsatz-wache", "flaggen-wache"]) {
    assert.ok(IM_LAEUFER_BETRIEBEN.includes(id), `${id} läuft nicht im Autopilot-Läufer`);
  }
});

test("Anschluss: alle fünf haben einen Bereich — nichts landet unbemerkt im Fallback", () => {
  const zugeordnet = new Set(zugeordneteKennungen());
  for (const id of ["email-zustell", "dsgvo-fristen", "ai-act-wache", "abo-umsatz-wache", "flaggen-wache"]) {
    assert.ok(zugeordnet.has(id), `${id} fehlt in der Bereichs-Zuordnung`);
  }
  assert.equal(bereichVon("dsgvo-fristen"), "Sicherheit & Wachdienst");
  assert.equal(bereichVon("ai-act-wache"), "Sicherheit & Wachdienst");
  assert.equal(bereichVon("email-zustell"), "Betrieb & Auslieferung");
  assert.equal(bereichVon("abo-umsatz-wache"), "Betrieb & Auslieferung");
  assert.equal(bereichVon("flaggen-wache"), "Betrieb & Auslieferung");
});
