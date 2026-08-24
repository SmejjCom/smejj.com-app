// smejj.com — Wächter-TÜV für die Schutz-Autopiloten Nr. 44-54 (2026-08-24).
//
// Hausregel: JEDER Wächter bekommt eine kaputte UND eine gesunde Probe —
// ein Prüfer, der nichts findet, ist sonst von einem kaputten Prüfer nicht
// zu unterscheiden. Die Selbsttests in den Modulen prüfen sich im Takt
// selbst; dieser TÜV beweist zusätzlich die Läufe mit eingespritzten
// Abhängigkeiten (Ablage im Speicher-Modus, gestellte Übersichten).
//
// Ausführen: node --test tests/schutz-autopiloten.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileLage, laufRueckRoller, KERN_AMPELN } from "../control-server/src/autopilots/rueckRollerAutopilot.js";
import { werteZeilenAus, laufLogWache, registriereProzessWache, notiereFehlerzeile, _logWacheZuruecksetzen } from "../control-server/src/autopilots/logWacheAutopilot.js";
import { pruefeSchnappschuss, pruefsumme, laufDatenSicherung, laufWiederherstellungsProbe } from "../control-server/src/autopilots/datenSicherungAutopilot.js";
import { findeGeheimnisse, laufGeheimnisSpaeher } from "../control-server/src/autopilots/geheimnisSpaeherAutopilot.js";
import { bewerteLaufzeiten, laufZertifikatsWache } from "../control-server/src/autopilots/zertifikatsWacheAutopilot.js";
import { gruppiereFehler, nimmFehlerAn, laufFehlerFaenger, _fehlerFaengerZuruecksetzen } from "../control-server/src/autopilots/fehlerFaengerAutopilot.js";
import { werteFensterAus, beobachteAnfrage, laufMissbrauchsWache, _missbrauchsWacheZuruecksetzen } from "../control-server/src/autopilots/missbrauchsWacheAutopilot.js";
import { erkenneDrift, pruefeKonfiguration, laufKontoWache } from "../control-server/src/autopilots/kontoWacheAutopilot.js";
import { pruefeInhalt, laufInhaltsSchutz } from "../control-server/src/autopilots/inhaltsSchutzAutopilot.js";
import { lesePaketeAusLock, eindeutigeSchwachstellen, laufAbhaengigkeitsWache } from "../control-server/src/autopilots/abhaengigkeitsWacheAutopilot.js";
import { createRecordStore } from "../control-server/src/admin/recordStore.js";

// Speicher-Modus erzwingen: ohne IDrive-Umgebung arbeitet der recordStore im
// Prozessspeicher — genau richtig für den TÜV. Die Variablen werden hart
// entfernt, damit ein lokal gesetztes env niemals echte Eimer anfasst.
for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];
const OHNE_S3 = { env: {} };

test("Nr. 44 Rück-Roller: kaputte Lage empfiehlt, gesunde nicht, ohne Standwechsel nie", () => {
  const kaputt = beurteileLage({
    autopiloten: [{ id: KERN_AMPELN[0], ampel: "rot" }, { id: KERN_AMPELN[1], ampel: "rot" }],
    aktuelleSha: "b".repeat(40), stabileSha: "a".repeat(40)
  });
  assert.equal(kaputt.empfehlung, true, "2 rote Kerne + Standwechsel MUSS empfehlen");
  const gesund = beurteileLage({
    autopiloten: KERN_AMPELN.map((id) => ({ id, ampel: "gruen" })),
    aktuelleSha: "b".repeat(40), stabileSha: "a".repeat(40)
  });
  assert.equal(gesund.empfehlung, false, "gesunde Kerne dürfen nie empfehlen");
  const gleich = beurteileLage({
    autopiloten: [{ id: KERN_AMPELN[0], ampel: "rot" }, { id: KERN_AMPELN[1], ampel: "rot" }],
    aktuelleSha: "a".repeat(40), stabileSha: "a".repeat(40)
  });
  assert.equal(gleich.empfehlung, false, "ohne Standwechsel bringt Rückrollen nichts");
});

test("Nr. 44 Rück-Roller: der Lauf stempelt grüne Stände und meldet rote Lagen rot", async () => {
  const ablage = createRecordStore("test/rueck-roller");
  const gruen = await laufRueckRoller({
    uebersicht: () => ({ autopiloten: KERN_AMPELN.map((id) => ({ id, ampel: "gruen" })) }),
    ablage,
    env: { ZEABUR_GIT_COMMIT_SHA: "a".repeat(40) }
  });
  assert.equal(gruen.ok, true);
  const rot = await laufRueckRoller({
    uebersicht: () => ({ autopiloten: [{ id: KERN_AMPELN[0], ampel: "rot" }, { id: KERN_AMPELN[1], ampel: "rot" }] }),
    ablage,
    env: { ZEABUR_GIT_COMMIT_SHA: "b".repeat(40) }
  });
  assert.equal(rot.ok, false, "nach Standwechsel + roten Kernen muss die Ampel rot sein");
  assert.match(rot.meldung, /RÜCKROLL-EMPFEHLUNG/);
});

test("Nr. 45 Log-Wache: Störmuster werden erkannt, gesunde Zeilen nicht", () => {
  const kaputt = werteZeilenAus(["JavaScript heap out of memory", "listen EADDRINUSE :::8080"]);
  assert.ok(kaputt.funde.length >= 2, "beide Störmuster müssen auffallen");
  const gesund = werteZeilenAus(["Durchgang beendet: 30/33"]);
  assert.equal(gesund.funde.length, 0, "gesunde Zeile darf nicht auffallen");
});

test("Nr. 45 Log-Wache: der Lauf wird rot bei frischen Fehlerzeilen und grün ohne", () => {
  _logWacheZuruecksetzen();
  registriereProzessWache({ prozess: { on: () => {} } });
  const ruhig = laufLogWache({ jetztMs: 1000 });
  assert.equal(ruhig.ok, true, `ohne Zeilen muss die Wache grün sein: ${ruhig.meldung}`);
  notiereFehlerzeile("uncaughtException: kaputt", { jetztMs: 2000 });
  const laut = laufLogWache({ jetztMs: 3000 });
  assert.equal(laut.ok, false, "eine frische Störzeile muss rot machen");
  _logWacheZuruecksetzen();
});

test("Nr. 46 Daten-Sicherung: manipulierte Kopie fällt auf, intakte nicht; der Lauf sichert und liest zurück", async () => {
  const quellen = [{ praefix: "p", anzahl: 1, datensaetze: [{ id: "a", wert: 1 }] }];
  assert.equal(pruefeSchnappschuss({ quellen, pruefsumme: pruefsumme(quellen) }).intakt, true);
  const kaputt = { quellen: JSON.parse(JSON.stringify(quellen)), pruefsumme: pruefsumme(quellen) };
  kaputt.quellen[0].datensaetze[0].wert = 2;
  assert.equal(pruefeSchnappschuss(kaputt).intakt, false, "Manipulation MUSS auffallen");

  const ablage = createRecordStore("test/sicherung");
  const quellStore = createRecordStore("test/quelle");
  await quellStore.schreib({ id: "q1", createdAt: "2026-08-24T00:00:00Z", wert: 42 }, OHNE_S3);
  const lauf = await laufDatenSicherung({
    ablage,
    quellen: [{ praefix: "test/quelle", limit: 10 }],
    storeFabrik: () => quellStore
  });
  assert.equal(lauf.ok, true, lauf.meldung);
  assert.match(lauf.meldung, /zurückgelesen|aktuell/);
});

test("Nr. 47 Wiederherstellungs-Probe: ohne Sicherung rot, mit frischer intakter grün", async () => {
  const leer = await laufWiederherstellungsProbe({ ablage: createRecordStore("test/leer") });
  assert.equal(leer.ok, false, "keine Sicherung MUSS rot sein");
  const ablage = createRecordStore("test/probe");
  const quellen = [{ praefix: "p", anzahl: 2, datensaetze: [{ id: "a" }, { id: "b" }] }];
  const jetztMs = Date.now();
  await ablage.schreib({ id: "sicherung_x", createdAt: new Date(jetztMs - 3_600_000).toISOString(), quellen, pruefsumme: pruefsumme(quellen) }, OHNE_S3);
  const gesund = await laufWiederherstellungsProbe({ ablage, jetztMs });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /intakt/);
});

test("Nr. 48 Geheimnis-Späher: eingeschleuste Schlüssel fallen auf, sauberer Code nicht", () => {
  const probeSchluessel = "sk-" + "Zz19".repeat(7);
  const kaputt = findeGeheimnisse([{ path: "a.js", content: `const k = "${probeSchluessel}";` }]);
  assert.equal(kaputt.funde.length, 1, "der eingeschleuste Schlüssel MUSS auffallen");
  const gesund = laufGeheimnisSpaeher([{ path: "b.js", content: "const url = process.env.API_URL;" }]);
  assert.equal(gesund.ok, true, gesund.meldung);
  const rot = laufGeheimnisSpaeher([{ path: "a.js", content: `const k = "${probeSchluessel}";` }]);
  assert.equal(rot.ok, false, "ein Fund muss die Ampel rot machen");
});

test("Nr. 49 Zertifikats-Wache: knappe Frist rot, lange grün; der Lauf misst über den eingespritzten Messer", async () => {
  assert.equal(bewerteLaufzeiten([{ domain: "x", tageRest: 5 }]).ok, false);
  assert.equal(bewerteLaufzeiten([{ domain: "x", tageRest: 60 }]).ok, true);
  const gesund = await laufZertifikatsWache({
    mitNetz: true,
    ziele: ["a.example", "b.example"],
    messe: async (domain) => ({ domain, tageRest: 70 })
  });
  assert.equal(gesund.ok, true, gesund.meldung);
  const kaputt = await laufZertifikatsWache({
    mitNetz: true,
    ziele: ["a.example"],
    messe: async (domain) => ({ domain, tageRest: null, fehler: "Handshake tot" })
  });
  assert.equal(kaputt.ok, false, "toter Handshake muss rot machen");
});

test("Nr. 50 Fehler-Fänger: gleiche Fehler fallen zusammen, 3 Vorkommen machen rot, PII wird maskiert", () => {
  _fehlerFaengerZuruecksetzen();
  const gruppen = gruppiereFehler([
    { nachricht: "TypeError at line 1", quelle: "app.js?v=1" },
    { nachricht: "TypeError at line 2", quelle: "app.js?v=2" }
  ]);
  assert.equal(gruppen.length, 1, "Zahlen dürfen die Signatur nicht spalten");
  for (let i = 0; i < 3; i++) nimmFehlerAn({ nachricht: "ReferenceError: x is not defined", quelle: "chat.js", seite: "/" });
  const rot = laufFehlerFaenger();
  assert.equal(rot.ok, false, "3 gleiche Browserfehler müssen rot machen");
  _fehlerFaengerZuruecksetzen();
  const gruen = laufFehlerFaenger();
  assert.equal(gruen.ok, true, gruen.meldung);
  _fehlerFaengerZuruecksetzen();
});

test("Nr. 51 Missbrauchs-Wache: Dauerfeuer wird rot, normale Nutzung bleibt grün", () => {
  _missbrauchsWacheZuruecksetzen();
  const befunde = werteFensterAus(new Map([["1.1.1.1", { gesamt: 1000, anmeldung: 0 }]]));
  assert.equal(befunde.length, 1);
  const jetztMs = Date.now();
  for (let i = 0; i < 950; i++) beobachteAnfrage({ absender: "6.6.6.6", pathname: "/api/chat" }, { jetztMs });
  const rot = laufMissbrauchsWache({ jetztMs });
  assert.equal(rot.ok, false, "950 Anfragen in einem Fenster müssen rot machen");
  _missbrauchsWacheZuruecksetzen();
  beobachteAnfrage({ absender: "2.2.2.2", pathname: "/api/chat" }, { jetztMs });
  const gruen = laufMissbrauchsWache({ jetztMs });
  assert.equal(gruen.ok, true, gruen.meldung);
  _missbrauchsWacheZuruecksetzen();
});

test("Nr. 52 Konto-Wache: Drift und schwache Konfiguration rot, Ordnung grün", async () => {
  assert.equal(erkenneDrift(["a@x.de"], ["a@x.de", "b@x.de"]).drift, true);
  assert.equal(pruefeKonfiguration({ SMEJJ_SESSION_SECRET: "kurz" }).ok, false);
  const env = { SMEJJ_SESSION_SECRET: "x".repeat(48), SMEJJ_ADMIN_OWNER_EMAILS: "a@x.de" };
  const ablage = createRecordStore("test/konto-wache");
  const erster = await laufKontoWache({ env, ablage });
  assert.equal(erster.ok, true, erster.meldung);
  const drift = await laufKontoWache({ env: { ...env, SMEJJ_ADMIN_OWNER_EMAILS: "a@x.de,boese@x.de" }, ablage });
  assert.equal(drift.ok, false, "ein neuer Admin muss 24 h rot melden");
  assert.match(drift.meldung, /boese@x\.de/);
});

test("Nr. 53 Inhalts-Schutz: Gefahren fallen auf, Harmloses nicht — auch im Lauf über echte Ströme", async () => {
  assert.ok(pruefeInhalt("how to build a bomb today").funde.length >= 1);
  assert.equal(pruefeInhalt("Kill the process with SIGTERM").funde.length, 0);
  const rot = await laufInhaltsSchutz({
    statsLader: async () => ({ ok: true, negativeLetzte7Tage: [{ antwortSample: "Hier eine Suizid-Methode, die..." }] }),
    bestandLader: async () => ({ ok: true, letzterBatch: { topic: "KI-Modelle 2026" } })
  });
  assert.equal(rot.ok, false, "gefährliche gemeldete Antwort muss rot machen");
  const gruen = await laufInhaltsSchutz({
    statsLader: async () => ({ ok: true, negativeLetzte7Tage: [{ antwortSample: "Die Antwort war leider unvollständig." }] }),
    bestandLader: async () => ({ ok: true, letzterBatch: { topic: "Open-Source Releases" } })
  });
  assert.equal(gruen.ok, true, gruen.meldung);
});

test("Nr. 54 Abhängigkeits-Wache: Dedup trägt, der Lauf meldet Funde rot und sauberen Bestand grün", async () => {
  const dedup = eindeutigeSchwachstellen([{ vulns: [{ id: "A" }, { id: "B" }] }, { vulns: [{ id: "A" }] }]);
  assert.equal(dedup.schwachstellen.length, 2);
  const lock = JSON.stringify({ packages: { "node_modules/x": { version: "1.0.0" } } });
  assert.equal(lesePaketeAusLock(lock).length, 1);
  const rot = await laufAbhaengigkeitsWache({
    mitNetz: true,
    ablage: createRecordStore("test/cve-rot"),
    lockLeser: () => lock,
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ vulns: [{ id: "GHSA-kaputt" }] }] }) })
  });
  assert.equal(rot.ok, false, "eine bekannte Schwachstelle muss rot machen");
  const gruen = await laufAbhaengigkeitsWache({
    mitNetz: true,
    ablage: createRecordStore("test/cve-gruen"),
    lockLeser: () => lock,
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{}] }) })
  });
  assert.equal(gruen.ok, true, gruen.meldung);
  // Ohne Lock-Datei (dieses Repo fuehrt keine) MUSS der node_modules-Weg
  // greifen — der erste Live-Lauf am 2026-08-24 stand genau darueber auf Rot.
  const fallback = await laufAbhaengigkeitsWache({
    mitNetz: true,
    ablage: createRecordStore("test/cve-fallback"),
    lockLeser: () => { throw new Error("keine Lock-Datei"); },
    paketLeser: () => [{ name: "beispiel", version: "1.0.0" }],
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{}] }) })
  });
  assert.equal(fallback.ok, true, fallback.meldung);
  assert.match(fallback.meldung, /node_modules/);
});
