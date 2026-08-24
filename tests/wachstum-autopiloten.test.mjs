// smejj.com — Wächter-TÜV für die Wachstums-Autopiloten Nr. 55-60 und die
// Verdrahtung aller 17 neuen (2026-08-24).
//
// Kaputte UND gesunde Probe je Prüfer — plus die Anschluss-Beweise: Registry
// vollständig, Nummern eindeutig, Taktgeber betreibt alle 17. Genau die
// Fehlerklasse "Schutz gebaut, aber nicht angeschlossen" soll hier scheitern,
// nicht erst live.
//
// Ausführen: node --test tests/wachstum-autopiloten.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileTag, laufKostenWache } from "../control-server/src/autopilots/kostenWacheAutopilot.js";
import { perzentil, beurteileMessreihe, laufLastProbe } from "../control-server/src/autopilots/lastProbeAutopilot.js";
import { pruefeSeitenQuelle, laufAuffindbarkeitsWache } from "../control-server/src/autopilots/auffindbarkeitsWacheAutopilot.js";
import { berechneWillkommensLage, laufWillkommensWache } from "../control-server/src/autopilots/willkommensWacheAutopilot.js";
import { weiseVarianteZu, werteExperimentAus, laufExperimentMeister } from "../control-server/src/autopilots/experimentMeisterAutopilot.js";
import { baueTagesmappe, laufTagesmappe } from "../control-server/src/autopilots/tagesmappeAutopilot.js";
import { baueSchutzUndWachstumLaeufe, SCHUTZ_UND_WACHSTUM_IDS } from "../control-server/src/autopilots/schutzUndWachstumLaeufe.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { createRecordStore } from "../control-server/src/admin/recordStore.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

test("Nr. 55 Kosten-Wache: gerissenes Budget rot, Warnstufe ab 80 %, normaler Tag grün", () => {
  assert.equal(beurteileTag({ kostenUsd: 30 }, { budgetUsd: 25 }).stufe, "rot");
  assert.equal(beurteileTag({ kostenUsd: 21 }, { budgetUsd: 25 }).stufe, "warnung");
  assert.equal(beurteileTag({ kostenUsd: 2 }, { budgetUsd: 25 }).stufe, "ok");
  const rot = laufKostenWache({
    env: { SMEJJ_KOSTEN_TAGESBUDGET_USD: "10" },
    berichtLader: () => ({ tage: [{ tag: "x", kostenUsd: 12, anfragen: 5, modelle: [] }] })
  });
  assert.equal(rot.ok, false, "gerissenes Budget muss rot melden");
  const gruen = laufKostenWache({
    env: { SMEJJ_KOSTEN_TAGESBUDGET_USD: "10" },
    berichtLader: () => ({ tage: [{ tag: "x", kostenUsd: 1.2, anfragen: 5, modelle: [] }] })
  });
  assert.equal(gruen.ok, true, gruen.meldung);
});

test("Nr. 56 Last-Probe: Fehlerquote und träges p95 rot, gesunde Messreihe grün — samt Lauf", async () => {
  assert.equal(perzentil([1, 2, 3, 4], 0.95), 4);
  assert.equal(beurteileMessreihe({ dauern: Array(10).fill(100), fehler: 5 }).ok, false);
  assert.equal(beurteileMessreihe({ dauern: Array(20).fill(100), fehler: 0 }).ok, true);
  const gruen = await laufLastProbe({
    mitNetz: true,
    ablage: createRecordStore("test/last-gruen"),
    env: {},
    fetchImpl: async () => ({ ok: true })
  });
  assert.equal(gruen.ok, true, gruen.meldung);
  const rot = await laufLastProbe({
    mitNetz: true,
    ablage: createRecordStore("test/last-rot"),
    env: {},
    fetchImpl: async () => { throw new Error("tot"); }
  });
  assert.equal(rot.ok, false, "unerreichbare Ziele müssen rot melden");
});

test("Nr. 57 Auffindbarkeits-Wache: kaputte Seite rot, gesunde grün — samt Lauf gegen gestellte Antworten", async () => {
  assert.ok(pruefeSeitenQuelle("<html><body></body></html>").maengel.length >= 4);
  const gesundeSeite = "<html lang=\"de\"><head><title>smejj — dein KI-Begleiter</title>"
    + "<meta name=\"description\" content=\"Chat, Bilder, Recherche und mehr an einem Ort.\">"
    + "<meta property=\"og:title\" content=\"smejj\"></head><body><h1>smejj</h1></body></html>";
  assert.equal(pruefeSeitenQuelle(gesundeSeite).maengel.length, 0);
  const gruen = await laufAuffindbarkeitsWache({
    mitNetz: true,
    env: {},
    fetchImpl: async (url) => String(url).includes("robots")
      ? { ok: true, text: async () => "User-agent: *\nAllow: /" }
      : { ok: true, text: async () => gesundeSeite }
  });
  assert.equal(gruen.ok, true, gruen.meldung);
  const rot = await laufAuffindbarkeitsWache({
    mitNetz: true,
    env: {},
    fetchImpl: async () => ({ ok: true, text: async () => "<html><head><meta name=\"robots\" content=\"noindex\"></head><body></body></html>" })
  });
  assert.equal(rot.ok, false, "NOINDEX muss rot melden");
});

test("Nr. 58 Willkommens-Wache: Zahlen stimmen exakt; unlesbarer Index ist rot, lesbarer grün", async () => {
  const TAG = 86_400_000;
  const jetztMs = 100 * TAG;
  const lage = berechneWillkommensLage([
    { createdAt: new Date(jetztMs - TAG).toISOString() },
    { createdAt: new Date(jetztMs - 30 * TAG).toISOString(), lastSeenAt: new Date(jetztMs - 2 * TAG).toISOString() }
  ], { jetztMs });
  assert.equal(lage.neue7Tage, 1);
  assert.equal(lage.wiederkehrer, 1);
  const rot = await laufWillkommensWache({ indexLader: async () => ({ ok: false, error: "index_not_built" }) });
  assert.equal(rot.ok, false, "fehlender Index muss rot melden");
  const gruen = await laufWillkommensWache({ indexLader: async () => ({ ok: true, entries: [] }) });
  assert.equal(gruen.ok, true, gruen.meldung);
});

test("Nr. 59 Experiment-Meister: deterministische Zuteilung, Zu-früh-Bremse, Gleichstand dem Amtsinhaber", async () => {
  assert.equal(weiseVarianteZu("n1", "e1"), weiseVarianteZu("n1", "e1"));
  assert.equal(werteExperimentAus({ a: { n: 5, erfolge: 5 }, b: { n: 5, erfolge: 0 } }).urteil, "zu-frueh");
  assert.equal(werteExperimentAus({ a: { n: 100, erfolge: 50 }, b: { n: 100, erfolge: 50 } }).urteil, "a-bleibt");
  assert.equal(werteExperimentAus({ a: { n: 100, erfolge: 40 }, b: { n: 100, erfolge: 70 } }).urteil, "b-gewinnt");
  const ablage = createRecordStore("test/experimente");
  const leer = await laufExperimentMeister({ ablage });
  assert.equal(leer.ok, true, leer.meldung);
  await ablage.schreib({ id: "e1", name: "knopf", status: "aktiv", createdAt: "2026-08-24T00:00:00Z", a: { n: 100, erfolge: 40 }, b: { n: 100, erfolge: 70 } }, { env: {} });
  const aktiv = await laufExperimentMeister({ ablage });
  assert.equal(aktiv.ok, true);
  assert.match(aktiv.meldung, /b-gewinnt/);
});

test("Nr. 60 Tagesmappe: stumme Quellen werden benannt, gesunde Mappe ist vollständig, der Lauf besteht", async () => {
  const kaputt = await baueTagesmappe({
    uebersicht: () => { throw new Error("weg"); },
    ticketLader: async () => { throw new Error("weg"); },
    storeFabrik: () => ({ liste: async () => { throw new Error("weg"); } })
  });
  assert.ok(kaputt.stummeQuellen.length >= 3, "kaputte Quellen MÜSSEN als stumm benannt sein");
  const gesund = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [{ id: "x", name: "X", ampel: "rot", letzterLauf: { meldung: "kaputt" } }] }),
    ticketLader: async () => [{ id: "T1", status: "offen", betreff: "Hilfe" }],
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }) })
  });
  assert.equal(gesund.stummeQuellen.length, 0);
  assert.equal(gesund.roteAmpeln.length, 1);
  assert.equal(gesund.wartenAufDich.length, 1);
});

test("ANSCHLUSS-BEWEIS: alle 17 in Registry, Taktgeber und Selbstheilung — Nummern 44-60 eindeutig", () => {
  const registryIds = new Set(AUTOPILOTEN.map((a) => a.id));
  for (const id of SCHUTZ_UND_WACHSTUM_IDS) {
    assert.ok(registryIds.has(id), `${id} fehlt in der Registry (opsAutopilotenListe.js)`);
    assert.ok(IM_LAEUFER_BETRIEBEN.includes(id), `${id} fehlt in IM_LAEUFER_BETRIEBEN — die Selbstheilung könnte ihn nicht wiederbeleben`);
  }
  const laeufe = baueSchutzUndWachstumLaeufe({ dateien: [], mitNetz: false });
  assert.equal(laeufe.length, SCHUTZ_UND_WACHSTUM_IDS.length, "der Taktgeber muss ALLE betreiben");
  assert.deepEqual([...laeufe.map(([id]) => id)].sort(), [...SCHUTZ_UND_WACHSTUM_IDS].sort());

  const nummern = AUTOPILOTEN.map((a) => a.nummer);
  assert.equal(new Set(nummern).size, nummern.length, "Autopilot-Nummern müssen eindeutig sein");
  const neue = AUTOPILOTEN.filter((a) => SCHUTZ_UND_WACHSTUM_IDS.includes(a.id)).map((a) => Number(a.nummer)).sort((x, y) => x - y);
  // 44-60 vom 24.08. plus Nr. 62 (Modell-Katalog-Wache, gleicher Tag);
  // Nr. 61 (Test-Waechter) laeuft auf dem Mac, nicht im Laeufer.
  assert.deepEqual(neue, [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 62]);
  assert.ok(AUTOPILOTEN.length >= 62, `die Registry muss mindestens 62 Autopiloten führen, hat ${AUTOPILOTEN.length}`);
});
