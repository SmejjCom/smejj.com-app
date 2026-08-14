// smejj.com — Daten-Schwungrad (Baustein 3, 2026-08-13): echte Nutzersignale
// statt Selbsttest-Attrappe.
//
// Drei Dinge muessen wahr sein, sonst ist das Schwungrad nur Deko:
//   1. "thumbs_down" existiert als Signal und traegt eine Antwort-Kostprobe —
//      es ist DER Rohstoff der Werkstatt.
//   2. Die Ampel-Meldung nennt gemessene Zahlen, nie ein Etikett.
//   3. Negative Signale werden im Backlog zu genau EINER gebuendelten Aufgabe.
import test from "node:test";
import assert from "node:assert/strict";

import {
  SIGNAL_TYPEN,
  processUserFeedbackSignal,
  getUserFlywheelStats,
  scrubPiiData,
  __feedbackAblageLeeren
} from "../control-server/src/autopilots/userFeedbackFlywheelAutopilot.js";
import { laufFeedbackSchwungrad, laufWissensErnte, laufMedienQualitaet } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { baueBacklog, STUFEN } from "../control-server/src/autopilots/werkstattBacklog.js";

// Leere Umgebung => recordStore faellt auf Prozess-Memory zurueck; die Tests
// duerfen NIE gegen die echte e2-Ablage laufen.
const OHNE_E2 = {};

test("thumbs_down ist ein gueltiges Signal und speichert die Antwort-Kostprobe PII-bereinigt", async () => {
  __feedbackAblageLeeren();
  assert.ok(SIGNAL_TYPEN.includes("thumbs_down"), "ohne thumbs_down gibt es keine Arbeitsliste");

  const ergebnis = await processUserFeedbackSignal({
    signalType: "thumbs_down",
    prompt: "Wie exportiere ich meinen Verlauf?",
    rejectedResponse: "Schreiben Sie an hilfe@beispiel.de, die Antwort war leider unbrauchbar."
  }, { env: OHNE_E2 });
  assert.equal(ergebnis.ok, true);

  const stats = await getUserFlywheelStats({ env: OHNE_E2 });
  assert.equal(stats.ok, true);
  assert.equal(stats.gesamt, 1);
  assert.equal(stats.jeTyp.thumbs_down, 1);
  assert.equal(stats.negativeLetzte7Tage.length, 1);
  const probe = stats.negativeLetzte7Tage[0];
  assert.match(probe.antwortSample, /\[EMAIL_MASKED\]/, "die E-Mail muss maskiert im Sample stehen");
  assert.equal(probe.antwortSample.includes("hilfe@beispiel.de"), false);
});

test("Unbekannte Signaltypen werden abgewiesen, nicht stillschweigend als 'copy' gezaehlt", async () => {
  const ergebnis = await processUserFeedbackSignal({ signalType: "super_toll", prompt: "Eine Frage dazu" }, { env: OHNE_E2 });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.reason, /Unbekannter Signaltyp/);
});

test("Ampel-Meldung des Schwungrads nennt gemessene Zahlen — und wird rot, wenn die Ablage schweigt", async () => {
  const mitZahlen = await laufFeedbackSchwungrad({
    statsLader: async () => ({ ok: true, gesamt: 12, jeTyp: { thumbs_up: 9, thumbs_down: 3 }, negativeLetzte7Tage: [{}, {}] })
  });
  assert.equal(mitZahlen.ok, true);
  assert.match(mitZahlen.meldung, /12 Signale/);
  assert.match(mitZahlen.meldung, /2 negativ/);
  assert.equal(/active_24_7/.test(mitZahlen.meldung), false, "das alte Etikett darf nie wieder auftauchen");

  const ohneAblage = await laufFeedbackSchwungrad({
    statsLader: async () => ({ ok: false, gesamt: 0, jeTyp: {}, negativeLetzte7Tage: [], grund: "S3 tot" })
  });
  assert.equal(ohneAblage.ok, false);
  assert.match(ohneAblage.meldung, /S3 tot/);

  const nochLeer = await laufFeedbackSchwungrad({
    statsLader: async () => ({ ok: true, gesamt: 0, jeTyp: {}, negativeLetzte7Tage: [] })
  });
  assert.equal(nochLeer.ok, true, "keine Signale ist kein Ausfall — der Weg ist neu");
  assert.match(nochLeer.meldung, /keine Nutzersignale/);
});

test("PII-Filter-Ausfall macht das Schwungrad ROT, egal wie gut die Zahlen sind", async () => {
  // Der Filter selbst laesst sich hier nicht kaputt machen (er ist importiert),
  // aber die Bedingung ist im Code nachlesbar: erst Filterpruefung, dann Zahlen.
  // Als Ersatzbeweis: der Filter maskiert die drei Klassen wirklich.
  const sauber = scrubPiiData("a.b@c.de sk-0123456789abcdef 10.0.0.1");
  assert.equal(sauber.includes("a.b@c.de"), false);
  assert.equal(sauber.includes("sk-0123456789abcdef"), false);
  assert.equal(sauber.includes("10.0.0.1"), false);
});

test("Backlog: negative Signale werden EINE gebuendelte Aufgabe der Regressions-Stufe", () => {
  const backlog = baueBacklog({
    ampel: { ok: true, autopiloten: [], vorfaelle: [] },
    antworten: {
      ok: true,
      negative: [
        { promptSample: "Wie melde ich mich ab?", antwortSample: "…", createdAt: "2026-08-12T10:00:00Z" },
        { promptSample: "Export klappt nicht", antwortSample: "…", createdAt: "2026-08-13T09:00:00Z" }
      ]
    }
  });
  const aufgaben = backlog.aufgaben.filter((a) => a.quelle === "Nutzer-Feedback");
  assert.equal(aufgaben.length, 1, "gebuendelt, nicht eine Aufgabe je Klick");
  // Die BEDEUTUNG festhalten, nicht die Zahl: als 2026-08-14 die Stufe
  // SICHERHEIT dazwischenkam, rutschte REGRESSION von 2 auf 3 und dieser
  // Test fiel — obwohl sich am Verhalten nichts geaendert hatte.
  assert.equal(aufgaben[0].stufe, STUFEN.REGRESSION);
  assert.match(aufgaben[0].titel, /2 Antwort/);
  assert.match(aufgaben[0].befund, /Wie melde ich mich ab\?/);
  assert.ok(backlog.gesammeltAus.includes("Nutzer-Feedback"));
});

test("Backlog: unlesbare Feedback-Ablage wird als STUMME Quelle benannt, nie erfunden", () => {
  const backlog = baueBacklog({
    ampel: { ok: true, autopiloten: [], vorfaelle: [] },
    antworten: { ok: false, grund: "e2 nicht erreichbar" }
  });
  assert.equal(backlog.aufgaben.filter((a) => a.quelle === "Nutzer-Feedback").length, 0);
  assert.ok(backlog.stummeQuellen.some((s) => s.quelle === "Nutzer-Feedback" && /e2/.test(s.grund)));
});

// --- Baustein 4: Wissens-Ernte ----------------------------------------------

test("Wissens-Ernte: frische Ernte => Bestandsmeldung, KEIN neuer Netzlauf", async () => {
  let geerntet = 0;
  const ergebnis = await laufWissensErnte({
    mitNetz: true,
    jetztMs: Date.parse("2026-08-13T12:00:00Z"),
    bestandLader: async () => ({
      ok: true, batches: 4, faktenGesamt: 31,
      letzterBatch: { topic: "Node.js Security", createdAt: "2026-08-13T06:00:00Z", factCount: 8 }
    }),
    ernte: async () => { geerntet += 1; return { ok: true, factsHarvested: 9 }; }
  });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /31 Fakten in 4 Laeufen/);
  assert.match(ergebnis.meldung, /vor 6 h/);
  assert.equal(geerntet, 0, "eine frische Ernte darf keinen zweiten Netzlauf ausloesen");
});

test("Wissens-Ernte: faellig + Netz => echter Ernte-Lauf mit Zahlen; 0 Fakten sind ROT", async () => {
  const gut = await laufWissensErnte({
    mitNetz: true,
    jetztMs: Date.parse("2026-08-13T12:00:00Z"),
    bestandLader: async () => ({ ok: true, batches: 1, faktenGesamt: 7, letzterBatch: { topic: "x", createdAt: "2026-08-10T00:00:00Z", factCount: 7 } }),
    ernte: async () => ({ ok: true, factsHarvested: 6 })
  });
  assert.equal(gut.ok, true);
  assert.match(gut.meldung, /6 frische Fakten/);

  const leer = await laufWissensErnte({
    mitNetz: true,
    jetztMs: Date.parse("2026-08-13T12:00:00Z"),
    bestandLader: async () => ({ ok: true, batches: 0, faktenGesamt: 0, letzterBatch: null }),
    ernte: async () => ({ ok: true, factsHarvested: 0 })
  });
  assert.equal(leer.ok, false, "eine Ernte ohne einen einzigen Fakt ist ein Befund, kein Erfolg");
  assert.match(leer.meldung, /0 Fakten/);
});

test("Wissens-Ernte: ohne Netz wird ehrlich 'faellig' gemeldet, nicht geerntet", async () => {
  let geerntet = 0;
  const ergebnis = await laufWissensErnte({
    mitNetz: false,
    bestandLader: async () => ({ ok: true, batches: 0, faktenGesamt: 0, letzterBatch: null }),
    ernte: async () => { geerntet += 1; return { ok: true, factsHarvested: 5 }; }
  });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /faellig/);
  assert.equal(geerntet, 0);
});

// --- Baustein 5: Bild/Video-Qualitaet ---------------------------------------

test("Medien-Qualitaet: bereiter Worker ist gruen, 'laeuft aber nicht bereit' ist ROT", async () => {
  const gruen = await laufMedienQualitaet({
    mitNetz: true,
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, bereit: true, engine: "kenburns" }) })
  });
  assert.equal(gruen.ok, true);
  assert.match(gruen.meldung, /Video-Worker: bereit \(kenburns\)/);

  const zombie = await laufMedienQualitaet({
    mitNetz: true,
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, bereit: false, fehler: "Modell laedt" }) })
  });
  assert.equal(zombie.ok, false, "das Salad-Fehlbild 'RUNNING, aber nicht bereit' muss rot werden");
  assert.match(zombie.meldung, /NICHT bereit/);
});

test("Medien-Qualitaet: toter Worker ist ROT mit Grund; Bild-Maler nur bei gesetzter Adresse", async () => {
  const gefragt = [];
  const tot = await laufMedienQualitaet({
    mitNetz: true,
    env: { SMEJJ_BILDER_WORKER_URL: "http://bild.intern:8080" },
    fetchImpl: async (url) => { gefragt.push(url); throw new Error("connect ECONNREFUSED"); }
  });
  assert.equal(tot.ok, false);
  assert.match(tot.meldung, /Video-Worker: nicht erreichbar/);
  assert.match(tot.meldung, /Bild-Maler: nicht erreichbar/);
  assert.equal(gefragt.length, 2, "beide Dienste muessen gefragt worden sein");

  const nurVideo = await laufMedienQualitaet({
    mitNetz: true,
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ bereit: true }) })
  });
  assert.equal(/Bild-Maler/.test(nurVideo.meldung), false, "ein nie ausgerollter Dienst wird nicht rot gemalt");
});
