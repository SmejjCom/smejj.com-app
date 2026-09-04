// smejj.com — Wächter-TÜV für die Trainings-Reife-Wache (Nr. 65,
// Betreiber-Freigabe 2026-08-26). Kaputte UND gesunde Probe — die Hausregel.
//
// Ausführen: node --test tests/trainings-reife.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  beurteileReife, fuehreSelbsttestAus, laufTrainingsReife,
  reifeZiel, TRAININGS_REIFE_ABLAGE
} from "../control-server/src/autopilots/trainingsReifeAutopilot.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon } from "../control-server/src/admin/opsAutopilotenBereiche.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

test("Nr. 65: die Stufen-Mathematik stimmt in beide Richtungen", () => {
  assert.equal(beurteileReife([{ name: "X", lesbar: false }]).ok, false, "unlesbare Ablage MUSS rot sein");
  const leer = beurteileReife([{ name: "X", lesbar: true, anzahl: 0 }], 100);
  assert.equal(leer.ok, true, "leerer Bestand ist ein Anfang, kein Ausfall");
  assert.equal(leer.stufe, 0, "leerer Bestand ist Stufe 0");
  assert.equal(beurteileReife([{ name: "X", lesbar: true, anzahl: 49 }], 100).stufe, 1, "unter der Hälfte = Stufe 1");
  assert.equal(beurteileReife([{ name: "X", lesbar: true, anzahl: 50 }], 100).stufe, 2, "ab der Hälfte = Stufe 2");
  assert.equal(beurteileReife([{ name: "X", lesbar: true, anzahl: 100 }], 100).stufe, 3, "Ziel erreicht = Stufe 3");
  assert.equal(beurteileReife([{ name: "X", lesbar: true, anzahl: 150 }], 100).stufe, 3, "über dem Ziel bleibt Stufe 3");
  const unsinn = beurteileReife([], 0);
  assert.equal(unsinn.ok, false, "ein Ziel von 0 wäre eine Gruen-Garantie und wird abgewiesen");
});

test("Nr. 65: der Lauf misst echte Ablagen, legt die Karte ab und startet NICHTS", async () => {
  const geschrieben = [];
  const gesund = await laufTrainingsReife({
    env: { SMEJJ_TRAINING_CAPTURE_ENABLED: "NO" },
    storeFabrik: (praefix) => praefix === TRAININGS_REIFE_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [] }), schreib: async (d) => { geschrieben.push(d); return d; } }
      : { liste: async () => ({ ok: true, datensaetze: [{ id: "a" }, { id: "b" }] }) }
  });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /Stufe [0-3]\/3/, "die Meldung nennt die Stufe mit Zahl");
  assert.match(gesund.meldung, /Capture aus \(fail-closed, gewollt/);
  assert.match(gesund.meldung, /Betreiber-Freigabe/, "GPU bleibt ausdrücklich hinter der Freigabe");
  assert.equal(geschrieben.length, 1, "genau EINE Entscheidungskarte wurde abgelegt");
  assert.equal(geschrieben[0].id, "letzte-karte", "die Karte wird überschrieben, die Ablage wächst nicht");
  assert.equal(typeof geschrieben[0].gesamt, "number");

  const kaputt = await laufTrainingsReife({
    env: {},
    storeFabrik: () => ({ liste: async () => { throw new Error("Ablage weg"); } })
  });
  assert.equal(kaputt.ok, false, "unlesbare Ablagen MÜSSEN rot melden");
});

test("Nr. 65 ANSCHLUSS-BEWEIS: registriert, betrieben, heartbeat, zugeordnet", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "trainings-reife");
  assert.ok(eintrag, "Registry-Eintrag fehlt");
  assert.equal(eintrag.nummer, "65");
  assert.equal(eintrag.messung, "heartbeat", "Nr. 65 muss MESSEN, nicht geplant sein");
  assert.match(eintrag.ort, /Autopilot-Läufer/);
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("trainings-reife"), "die Selbstheilung muss sie wiederbeleben können");
  assert.equal(bereichVon("trainings-reife"), "Modelle & Wissen", "auf der Seite bei den Modellen zuhause");
  const nummern = AUTOPILOTEN.map((a) => String(a.nummer));
  assert.equal(nummern.filter((n) => n === "65").length, 1, "keine doppelte Nummer (Lehre von Nr. 40)");
});

test("Nr. 65: der Selbsttest fällt durch, wenn die Mathematik kippt", () => {
  const probe = fuehreSelbsttestAus({ env: {} });
  assert.equal(probe.bestanden, true, `Selbsttest muss grün sein: ${probe.fehler.join("; ")}`);
});

// ---- Befund 2026-09-04: die erfassten Nutzerfragen wurden nie gezaehlt ----
test("Nr. 65 zaehlt die erfassten Fragen aus training/fragen/ mit", async () => {
  const { zaehleFragen, FRAGEN_PRAEFIX, laufTrainingsReife: lauf } = await import("../control-server/src/autopilots/trainingsReifeAutopilot.js");
  assert.equal(FRAGEN_PRAEFIX, "training/fragen/");
  const env = {
    IDRIVE_E2_TRAINING_ENDPOINT: "https://s3.us-west-2.idrivee2.com", IDRIVE_E2_TRAINING_REGION: "us-west-2",
    IDRIVE_E2_TRAINING_BUCKET: "smejj-app", IDRIVE_E2_TRAINING_ACCESS_KEY: "training-access-key", IDRIVE_E2_TRAINING_SECRET_KEY: "training-secret-key-value",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/fragen/,training/consents/"
  };
  const seite = (keys, weiter = false) => ({
    response: { ok: true, status: 200 },
    body: `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("")}<IsTruncated>${weiter}</IsTruncated>${weiter ? "<NextContinuationToken>tok</NextContinuationToken>" : ""}</ListBucketResult>`
  });
  const z = await zaehleFragen({ env, listImpl: async ({ continuationToken }) => continuationToken
    ? seite(["training/fragen/2026/09/04/c.json"])
    : seite(["training/fragen/2026/09/04/a.json", "training/fragen/2026/09/04/b.json", "training/fragen/2026/09/04/"], true) });
  assert.equal(z.lesbar, true);
  assert.equal(z.anzahl, 3, "beide Seiten zaehlen, Ordner-Schluessel ohne .json nicht");

  const ohne = await zaehleFragen({ env: {}, listImpl: async () => seite([]) });
  assert.equal(ohne.lesbar, false, "ohne Trainings-Speicher ist nicht zaehlbar");

  // Im Lauf: die Fragen erhoehen den Bestand und stehen in der Meldung.
  const karten = [];
  const e = await lauf({
    env: { SMEJJ_TRAINING_REIFE_ZIEL_GESAMT: "10" },
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }), schreib: async (d) => { karten.push(d); return d; } }),
    quellen: [{ praefix: "self-improvement/dpo-dataset", name: "DPO-Paare", limit: 10 }],
    fragenZaehler: async () => ({ lesbar: true, anzahl: 7 })
  });
  assert.equal(e.ok, true, e.meldung);
  assert.match(e.meldung, /7 erfasste Fragen/);
  assert.match(e.meldung, /Stufe 2\/3/, "7 von 10 ist Stufe 2 — vorher waere es Stufe 0 geblieben");
  assert.equal(karten.at(-1).gesamt, 7);

  // Fehlender Speicher darf die Wache nicht rot machen (Nr. 74 ist dafuer da).
  const f = await lauf({
    env: {},
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }), schreib: async () => ({}) }),
    quellen: [{ praefix: "self-improvement/dpo-dataset", name: "DPO-Paare", limit: 10 }],
    fragenZaehler: async () => ({ lesbar: false, grund: "IDRIVE_E2_TRAINING_ENDPOINT fehlt" })
  });
  assert.equal(f.ok, true);
  assert.match(f.meldung, /nicht zaehlbar/);
});
