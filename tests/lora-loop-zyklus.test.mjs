import assert from "node:assert/strict";
import test from "node:test";
import { leseKostengrenzen } from "../workers/smejj-lora-loop/budget.js";
import { fuehreZyklusAus } from "../workers/smejj-lora-loop/cycle.js";
import {
  gitterErschoepft,
  gitterGroesse,
  istNeuerBester,
  konfigurationFuer
} from "../workers/smejj-lora-loop/sweep.js";

const GRENZEN = leseKostengrenzen({
  SMEJJ_LORA_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_MAX_USD_GESAMT: "50",
  SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
  SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-dauertraining",
  SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180"
});

/** Ein Trainingsdienst, der sich wie gewuenscht verhaelt. */
function trainerFetch({ zustandsfolge = ["fertig"], gesund = true } = {}) {
  let index = 0;
  return async (url) => {
    const pfad = String(url);
    if (pfad.endsWith("/health")) {
      return antwort(gesund ? 200 : 503, {});
    }
    if (pfad.endsWith("/training/start")) {
      return antwort(200, { laufId: "lauf-1" });
    }
    if (pfad.includes("/training/status/")) {
      const zustand = zustandsfolge[Math.min(index++, zustandsfolge.length - 1)];
      return antwort(200, {
        zustand,
        adapterSchluessel: "checkpoints/smejj-1-0/lauf-1/adapter.safetensors",
        messEndpunkt: "https://trainer.example/v1/chat/completions",
        gelaufeneMinuten: 12
      });
    }
    if (pfad.includes("/training/abort/")) return antwort(200, { ok: true });
    return antwort(404, {});
  };
}

function antwort(status, daten) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(daten) };
}

function basis(overrides = {}) {
  return {
    grenzen: GRENZEN,
    zyklusIndex: 0,
    verbrauchtUsd: 0,
    besterStand: null,
    basismodell: { hfRepo: "Qwen/Qwen2.5-Coder-7B-Instruct" },
    datensatz: { schluessel: "datasets/smejj-1-0/v1/train.jsonl", manifestSchluessel: "datasets/smejj-1-0/v1/manifest.json" },
    trainerBasisUrl: "https://trainer.example",
    pruefeDaten: async () => ({ vorhanden: true }),
    messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0, faelle: 14, bestanden: 13 } }),
    speichereBesten: async () => true,
    fetchImpl: trainerFetch(),
    warte: async () => {},
    abfrageAbstandMs: 1,
    jetzt: () => new Date("2026-08-01T10:00:00Z"),
    ...overrides
  };
}

// --- Gitter ---

test("Gitter ist deterministisch und neustartfest", () => {
  // Nach einem Container-Neubau muss Zyklus 7 wieder exakt Zyklus 7 sein.
  assert.deepEqual(konfigurationFuer(7), konfigurationFuer(7));
  assert.notEqual(konfigurationFuer(7).kennung, konfigurationFuer(8).kennung);
});

test("eine volle Gitterrunde probiert jede Kombination genau einmal", () => {
  const kennungen = new Set();
  for (let i = 0; i < gitterGroesse(); i += 1) kennungen.add(konfigurationFuer(i).kennung);
  assert.equal(kennungen.size, gitterGroesse());
});

test("nach der letzten Runde wird nicht endlos weitergerechnet", () => {
  assert.equal(gitterErschoepft(0, 3), false);
  assert.equal(gitterErschoepft(gitterGroesse() * 3, 3), true);
});

// --- Bestenauswahl ---

test("ein Vorsprung im Messrauschen macht keinen neuen Besten", () => {
  // Gemessen streut eine Einzelziehung um bis zu 12 Prozentpunkte. +2 Punkte
  // sind Rauschen, kein Fortschritt — sonst waende die Latte auf Zufall gesetzt.
  const vergleich = istNeuerBester({ punktzahl: 0.82, kritischeFehler: 0 }, { punktzahl: 0.80 });
  assert.equal(vergleich.besser, false);
  assert.ok(vergleich.gruende[0].startsWith("vorsprung_im_rauschen"));
});

test("ein Vorsprung ueber der Rauschschwelle zaehlt", () => {
  assert.equal(istNeuerBester({ punktzahl: 0.90, kritischeFehler: 0 }, { punktzahl: 0.80 }).besser, true);
});

test("ein kritischer Fehler schliesst aus, egal wie hoch die Punktzahl ist", () => {
  // Die Suite markiert damit Faelle wie "verrate keinen API-Schluessel".
  const vergleich = istNeuerBester({ punktzahl: 0.99, kritischeFehler: 1 }, { punktzahl: 0.50 });
  assert.equal(vergleich.besser, false);
  assert.ok(vergleich.gruende[0].startsWith("kritische_fehler"));
});

// --- Zyklus: die drei Sperrfaelle ---

test("KEINE DATEN: Zyklus startet nicht und kostet nichts", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ pruefeDaten: async () => ({ vorhanden: false }) }));
  assert.equal(ergebnis.gestartet, false);
  assert.equal(ergebnis.kostenUsd, 0);
  assert.ok(ergebnis.gruende.includes("keine_trainingsdaten"));
});

test("DIENST NICHT ERREICHBAR: Zyklus startet nicht und kostet nichts", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ fetchImpl: trainerFetch({ gesund: false }) }));
  assert.equal(ergebnis.gestartet, false);
  assert.equal(ergebnis.kostenUsd, 0);
  assert.ok(ergebnis.gruende.includes("trainer_nicht_erreichbar"));
});

test("KEIN BUDGET: Zyklus startet nicht und kostet nichts", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ verbrauchtUsd: 50 }));
  assert.equal(ergebnis.gestartet, false);
  assert.equal(ergebnis.kostenUsd, 0);
  assert.ok(ergebnis.gruende.some((g) => g.startsWith("budget_erschoepft")), ergebnis.gruende.join(","));
});

test("eine geworfene Datenpruefung sperrt, statt den Zyklus zu sprengen", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ pruefeDaten: async () => { throw new Error("Ablage weg"); } }));
  assert.equal(ergebnis.gestartet, false);
  assert.ok(ergebnis.gruende.includes("keine_trainingsdaten"));
});

// --- Zyklus: Erfolgsweg ---

test("erfolgreicher Zyklus misst, behaelt und rechnet die Kosten ab", async () => {
  const gespeichert = [];
  const ergebnis = await fuehreZyklusAus(basis({
    speichereBesten: async (stand) => { gespeichert.push(stand); return true; }
  }));
  assert.equal(ergebnis.gestartet, true);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.besser, true);
  assert.equal(ergebnis.alsBestemGespeichert, true);
  assert.equal(gespeichert.length, 1);
  assert.equal(gespeichert[0].adapterSchluessel, "checkpoints/smejj-1-0/lauf-1/adapter.safetensors");
  // 12 Minuten auf einer 3090 in der Batch-Stufe = 0,018 USD.
  assert.equal(ergebnis.kostenUsd, 0.018);
});

test("schlechteres Ergebnis wird verworfen und der Grund protokolliert", async () => {
  const ergebnis = await fuehreZyklusAus(basis({
    besterStand: { punktzahl: 0.95 },
    messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.70, kritischeFehler: 0 } })
  }));
  assert.equal(ergebnis.besser, false);
  assert.equal(ergebnis.alsBestemGespeichert, false);
  assert.ok(ergebnis.gruende[0].startsWith("vorsprung_im_rauschen"));
  // Verworfen heisst nicht kostenlos — die GPU-Zeit ist trotzdem angefallen.
  assert.ok(ergebnis.kostenUsd > 0);
});

// --- Zyklus: Abbruchwege ---

test("EIN Statusabfrage-Schluckauf verwirft den bezahlten Lauf NICHT", async () => {
  // Gemessen am 2026-08-05 (Zyklus 2, r32): nach 24 Minuten sauberer Antworten
  // genuegte ein einzelner 20-s-Timeout, um 25 Minuten GPU-Zeit zu verwerfen.
  // Ein voruebergehend unklarer Zustand muss ueberbrueckt werden, solange die
  // naechsten Abfragen wieder antworten.
  const ergebnis = await fuehreZyklusAus(basis({
    fetchImpl: trainerFetch({ zustandsfolge: ["laeuft", "kaputtgeredet", "laeuft", "kaputtgeredet", "kaputtgeredet", "fertig"] })
  }));
  assert.equal(ergebnis.gestartet, true);
  assert.equal(ergebnis.ok, true, ergebnis.gruende ? ergebnis.gruende.join(",") : "");
  assert.ok(!ergebnis.gruende.some((g) => g.startsWith("trainer_zustand_unbekannt")));
});

test("unklarer Trainerzustand bricht ab, statt die Karte weiterlaufen zu lassen", async () => {
  const ergebnis = await fuehreZyklusAus(basis({
    fetchImpl: trainerFetch({ zustandsfolge: ["kaputtgeredet"] })
  }));
  assert.equal(ergebnis.gestartet, true);
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.gruende.some((g) => g.startsWith("trainer_zustand_unbekannt")), ergebnis.gruende.join(","));
  assert.equal(ergebnis.abbruchBestaetigt, true);
});

test("fehlgeschlagene Messung wird nicht als Erfolg verbucht, Kosten aber schon", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ messe: async () => ({ ok: false, gruende: ["kein_mess_endpunkt"] }) }));
  assert.equal(ergebnis.ok, false);
  assert.ok(ergebnis.gruende.includes("messung_fehlgeschlagen"));
  assert.equal(ergebnis.besser, false);
  assert.ok(ergebnis.kostenUsd > 0);
});

test("erschoepftes Gitter startet keinen weiteren Zyklus", async () => {
  const ergebnis = await fuehreZyklusAus(basis({ zyklusIndex: gitterGroesse() * 3, maxRunden: 3 }));
  assert.equal(ergebnis.gestartet, false);
  assert.equal(ergebnis.kostenUsd, 0);
  assert.ok(ergebnis.gruende.includes("gitter_erschoepft"));
});

// --- Toleranzfenster: 8 Minuten Gateway-Ausfall, nicht 90 Sekunden -----------
//
// Betreiber-Freigabe 2026-08-06 („Toleranz der Trainingsschleife"): von 3 auf 16
// Abfragen. Anlass sind drei bezahlte Laeufe, die in der Nacht auf den 2026-08-06
// starben, waehrend die Karte normal weiterrechnete. Gemessen: die Statusabfrage
// 24-mal ueber 12 Minuten nachgestellt ergab 14-mal HTTP 503 AM STUECK, obwohl
// der Trainer sich als `bereit` meldete.
//
// Diese zwei Tests halten BEIDE Seiten der Grenze fest. Ohne den zweiten waere
// die Toleranz beliebig erhoehbar, ohne dass ein Test widerspricht — und eine
// Karte koennte unbemerkt stundenlang unbeaufsichtigt laufen.
test("ein achtminuetiger Gateway-Ausfall verwirft den bezahlten Lauf NICHT", () => {
  const aussetzer = Array.from({ length: 12 }, () => "kaputtgeredet");
  return fuehreZyklusAus(basis({
    fetchImpl: trainerFetch({ zustandsfolge: ["laeuft", ...aussetzer, "laeuft", "fertig"] })
  })).then((ergebnis) => {
    assert.equal(ergebnis.gestartet, true);
    assert.equal(ergebnis.ok, true, ergebnis.gruende ? ergebnis.gruende.join(",") : "");
    assert.ok(
      !ergebnis.gruende.some((g) => g.startsWith("trainer_zustand_unbekannt")),
      "12 unklare Abfragen liegen unter der Toleranz und duerfen nicht abbrechen"
    );
  });
});

test("ein DAUERausfall bricht weiterhin ab — die Toleranz ist begrenzt", () => {
  // 78 Minuten Ausfall wie am 2026-08-06 gemessen: das ist kein Schluckauf.
  const dauerhaft = Array.from({ length: 40 }, () => "kaputtgeredet");
  return fuehreZyklusAus(basis({
    fetchImpl: trainerFetch({ zustandsfolge: dauerhaft })
  })).then((ergebnis) => {
    assert.equal(ergebnis.ok, false);
    assert.ok(
      ergebnis.gruende.some((g) => g.startsWith("trainer_zustand_unbekannt")),
      ergebnis.gruende.join(",")
    );
  });
});
