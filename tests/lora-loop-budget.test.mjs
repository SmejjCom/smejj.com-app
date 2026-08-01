import assert from "node:assert/strict";
import test from "node:test";
import {
  darfZyklusStarten,
  geschaetzteZykluskostenUsd,
  leseKostengrenzen,
  monatskostenUsd,
  mussNotausAusloesen,
  pruefeFreigabe,
  reichweiteTage,
  tatsaechlicheKostenUsd
} from "../workers/smejj-lora-loop/budget.js";

/** Vollstaendig freigegebene Umgebung — Ausgangspunkt fuer die Negativfaelle. */
function env(overrides = {}) {
  return {
    SMEJJ_LORA_GPU_KLASSE: "rtx3090",
    SMEJJ_LORA_MAX_USD_GESAMT: "50",
    SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
    SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-dauertraining",
    SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
    SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180",
    ...overrides
  };
}

function start(overrides = {}, torOverrides = {}) {
  return darfZyklusStarten({
    grenzen: leseKostengrenzen(env(overrides)),
    verbrauchtUsd: 0,
    zyklenBisher: 0,
    datenVorhanden: true,
    trainerErreichbar: true,
    ...torOverrides
  });
}

test("gemessene Preise: RTX 3090 kostet 180 USD im Monat bei Dauerbetrieb", () => {
  assert.equal(monatskostenUsd("rtx3090"), 180);
  assert.equal(monatskostenUsd("rtx4090"), 216);
  assert.equal(monatskostenUsd("rtx5090"), 324);
});

test("Guthaben 83,91 USD reicht auf einer RTX 3090 rund 14 Tage", () => {
  // Die Zahl, die dem Betreiber vor dem Start vorgerechnet werden muss.
  assert.equal(reichweiteTage("rtx3090", 83.91), 14);
});

test("vollstaendig freigegebene Umgebung darf starten", () => {
  const tor = start();
  assert.equal(tor.darfStarten, true, tor.gruende.join(","));
});

// --- Die drei vom Auftrag ausdruecklich geforderten Negativfaelle ---

test("KEIN BUDGET: ohne Kostendeckel startet nichts", () => {
  const tor = start({ SMEJJ_LORA_MAX_USD_GESAMT: "" });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.some((g) => g.includes("SMEJJ_LORA_MAX_USD_GESAMT")), tor.gruende.join(","));
});

test("KEINE DATEN: ohne Trainingsdaten wird keine GPU gemietet", () => {
  const tor = start({}, { datenVorhanden: false });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.includes("keine_trainingsdaten"));
});

test("DIENST NICHT ERREICHBAR: kein Start, keine Kosten", () => {
  const tor = start({}, { trainerErreichbar: false });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.includes("trainer_nicht_erreichbar"));
});

// --- Freigabe-Tor (Rote Liste) ---

test("ohne schriftliche Freigabe startet nichts, auch mit gesetztem Deckel", () => {
  const tor = start({ SMEJJ_LORA_FREIGABE_ID: "" });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.some((g) => g.includes("freigabe_fehlt")), tor.gruende.join(","));
});

test("Freigabe fuer eine 3090 deckt keine 5090", () => {
  // 180 vs 324 USD/Monat — fast das Doppelte. Muss auffallen.
  const tor = start({ SMEJJ_LORA_GPU_KLASSE: "rtx5090" });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.some((g) => g.includes("freigabe_gpu_klasse_abweichend")), tor.gruende.join(","));
});

test("Freigabebetrag muss die echten Monatskosten decken", () => {
  const freigabe = pruefeFreigabe(leseKostengrenzen(env({
    SMEJJ_LORA_GPU_KLASSE: "rtx4090",
    SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx4090",
    SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180"
  })));
  assert.equal(freigabe.freigegeben, false);
  assert.ok(freigabe.gruende.some((g) => g.includes("freigabe_monatsbetrag_zu_klein")));
});

test("unbekannte GPU-Klasse sperrt statt mit Preis 0 zu rechnen", () => {
  const tor = start({ SMEJJ_LORA_GPU_KLASSE: "rtx9090", SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx9090" });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.some((g) => g.includes("unbekannte_klasse")), tor.gruende.join(","));
});

// --- Deckel ---

test("ein Zyklus muss vollstaendig ins Restbudget passen", () => {
  // 45 Minuten auf einer 3090 = 0,1875 USD. Bei 49,9 von 50 USD verbraucht
  // bleiben 0,1 USD — zu wenig. Ein angefangener, am Deckel abgebrochener
  // Lauf kostet dasselbe und liefert keine Messung.
  const tor = start({}, { verbrauchtUsd: 49.9 });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.some((g) => g.startsWith("budget_erschoepft")), tor.gruende.join(","));
});

test("Zykluskosten und tatsaechliche Kosten rechnen mit dem gemessenen Preis", () => {
  const grenzen = leseKostengrenzen(env());
  assert.equal(geschaetzteZykluskostenUsd(grenzen), 0.1875);
  assert.equal(tatsaechlicheKostenUsd(grenzen, 60), 0.25);
  assert.equal(tatsaechlicheKostenUsd(grenzen, 0), 0);
});

// --- Notaus ---

test("Notaus sperrt sofort, unabhaengig von allem anderen", () => {
  const tor = start({ SMEJJ_LORA_NOTAUS: "YES" });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.includes("notaus_aktiv"));
});

test("Notaus greift auch waehrend eines laufenden Zyklus", () => {
  const grenzen = leseKostengrenzen(env());
  assert.equal(mussNotausAusloesen({ grenzen, verbrauchtUsd: 1, laufendeMinuten: 5 }).notaus, false);
  // Laufzeit ueberschritten
  const zuLang = mussNotausAusloesen({ grenzen, verbrauchtUsd: 1, laufendeMinuten: 46 });
  assert.equal(zuLang.notaus, true);
  assert.ok(zuLang.gruende.some((g) => g.startsWith("zykluslaufzeit_ueberschritten")));
  // Deckel gerissen
  const deckel = mussNotausAusloesen({ grenzen, verbrauchtUsd: 50, laufendeMinuten: 5 });
  assert.equal(deckel.notaus, true);
  assert.ok(deckel.gruende.some((g) => g.startsWith("gesamtdeckel_erreicht")));
});

test("leere Umgebung ist vollstaendig gesperrt (sicher deploybar im Aus-Zustand)", () => {
  const tor = darfZyklusStarten({ grenzen: leseKostengrenzen({}) });
  assert.equal(tor.darfStarten, false);
  assert.ok(tor.gruende.length >= 4, tor.gruende.join(","));
});
