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
import { TRAININGS_REIFE_ABLAGE } from "../control-server/src/autopilots/trainingsReifeAutopilot.js";
import { DSGVO_FRISTEN_ABLAGE } from "../control-server/src/autopilots/dsgvoFristenAutopilot.js";
import { FLAGGEN_ABLAGE } from "../control-server/src/autopilots/flaggenAutopilot.js";
import { MODELL_EVOLUTION_ABLAGE } from "../control-server/src/autopilots/modellEvolutionAutopilot.js";
import { baueSchutzUndWachstumLaeufe, SCHUTZ_UND_WACHSTUM_IDS } from "../control-server/src/autopilots/schutzUndWachstumLaeufe.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { createRecordStore } from "../control-server/src/admin/recordStore.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

test("Nr. 55 Kosten-Wache: gerissenes Budget rot, Warnstufe ab 80 %, normaler Tag grün", async () => {
  assert.equal(beurteileTag({ kostenUsd: 30 }, { budgetUsd: 25 }).stufe, "rot");
  assert.equal(beurteileTag({ kostenUsd: 21 }, { budgetUsd: 25 }).stufe, "warnung");
  assert.equal(beurteileTag({ kostenUsd: 2 }, { budgetUsd: 25 }).stufe, "ok");
  const rot = await laufKostenWache({
    env: { SMEJJ_KOSTEN_TAGESBUDGET_USD: "10" },
    ablage: createRecordStore("test/kosten-rot"),
    berichtLader: () => ({ tage: [{ tag: "x", kostenUsd: 12, anfragen: 5, modelle: [] }] })
  });
  assert.equal(rot.ok, false, "gerissenes Budget muss rot melden");
  const gruen = await laufKostenWache({
    env: { SMEJJ_KOSTEN_TAGESBUDGET_USD: "10" },
    ablage: createRecordStore("test/kosten-gruen"),
    berichtLader: () => ({ tage: [{ tag: "x", kostenUsd: 1.2, anfragen: 5, modelle: [] }] })
  });
  assert.equal(gruen.ok, true, gruen.meldung);
  assert.match(gruen.meldung, /Brücken-Verbrauch nicht enthalten/);
});

// WARUM (2026-09-15): nach jedem Neustart meldete die Wache "0.00 USD" als
// Tagesverbrauch. Kaputte Probe: ohne Ablage-Basis wäre der Neustart genullt;
// gesunde Probe: Basis vor dem Neustart + seit Start = echter Tageswert.
test("Nr. 55 Kosten-Wache: Tagesstand überlebt einen Neustart, unlesbare Ablage heißt Untergrenze", async () => {
  const env = { SMEJJ_KOSTEN_TAGESBUDGET_USD: "10" };
  const heute = "2026-09-15";
  const start1 = Date.parse(`${heute}T00:00:00Z`);
  const ablage = createRecordStore("test/kosten-neustart");
  const lader = (kosten, anfragen) => () => ({ tage: kosten ? [{ tag: heute, kostenUsd: kosten, anfragen, modelle: [] }] : [] });

  // Prozess 1 zählt 7 USD und legt ab.
  const vorher = await laufKostenWache({ env, ablage, prozessStartMs: start1, jetztMs: start1 + 3_600_000, berichtLader: lader(7, 40) });
  assert.equal(vorher.ok, true, vorher.meldung);
  assert.match(vorher.meldung, /7\.00 von 10 USD/);
  // Letzte Ablage kurz vor dem Neustart.
  const letzteAblage = start1 + 7_200_000;
  await laufKostenWache({ env, ablage, prozessStartMs: start1, jetztMs: letzteAblage, berichtLader: lader(7.5, 42) });

  // Neustart: Token-Messer leer bis auf 1 USD — der Tag steht trotzdem bei 8,50 → Warnung.
  const start2 = letzteAblage;
  const nachher = await laufKostenWache({ env, ablage, prozessStartMs: start2, jetztMs: start2 + 600_000, berichtLader: lader(1, 3) });
  assert.equal(nachher.ok, false, `8,50 von 10 USD muss warnen: ${nachher.meldung}`);
  assert.match(nachher.meldung, /8\.50 von 10 USD/);
  assert.match(nachher.meldung, /davon 7\.50 USD vor dem letzten Neustart/);
  assert.doesNotMatch(nachher.meldung, /Untergrenze/, "lückenloser Neustart ist genau");

  // Zweiter Lauf im selben neuen Prozess: Basis bleibt, nicht doppelt gezählt.
  const weiter = await laufKostenWache({ env, ablage, prozessStartMs: start2, jetztMs: start2 + 1_200_000, berichtLader: lader(1.2, 4) });
  assert.match(weiter.meldung, /8\.70 von 10 USD/);

  // Kaputte Probe: Ablage nicht lesbar → nur seit Neustart, ehrlich als Untergrenze.
  const kaputt = {
    lies: async () => { throw new Error("e2 weg"); },
    liste: async () => ({ ok: false }),
    schreib: async () => { throw new Error("darf nicht schreiben"); }
  };
  const blind = await laufKostenWache({ env, ablage: kaputt, prozessStartMs: start2, jetztMs: start2 + 600_000, berichtLader: lader(1, 3) });
  assert.equal(blind.ok, true, blind.meldung);
  assert.match(blind.meldung, /1\.00 von 10 USD/);
  assert.match(blind.meldung, /Untergrenze: Tagesstand-Ablage nicht lesbar/);

  // Lücke zwischen letzter Ablage und Neustart wird benannt.
  const spaeterStart = letzteAblage + 30 * 60_000;
  const ablage2 = createRecordStore("test/kosten-luecke");
  await laufKostenWache({ env, ablage: ablage2, prozessStartMs: start1, jetztMs: letzteAblage, berichtLader: lader(2, 5) });
  const mitLuecke = await laufKostenWache({ env, ablage: ablage2, prozessStartMs: spaeterStart, jetztMs: spaeterStart + 60_000, berichtLader: lader(0.5, 1) });
  assert.match(mitLuecke.meldung, /2\.50 von 10 USD/);
  assert.match(mitLuecke.meldung, /Untergrenze: 30 min vor dem Neustart nicht erfasst/);
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
    // Nr. 65 (2026-08-26): die Trainings-Reife-Ablage gehört zu den Quellen —
    // in der gesunden Welt liegt darin eine frische Karte ab Stufe 2.
    storeFabrik: (praefix) => praefix === TRAININGS_REIFE_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [{ stufe: 2, gesamt: 2600, ziel: 5000, createdAt: new Date().toISOString() }] }) }
      : praefix === DSGVO_FRISTEN_ABLAGE
        ? { liste: async () => ({ ok: true, datensaetze: [{ ueberschritten: 0, kritisch: 0, bald: 0, createdAt: new Date().toISOString() }] }) }
        : praefix === FLAGGEN_ABLAGE
          ? { liste: async () => ({ ok: true, datensaetze: [{ veraltetAnzahl: 0, veraltetNamen: [], createdAt: new Date().toISOString() }] }) }
          // Nr. 72 (2026-09-03): der Evolutions-Takt liefert seinen jüngsten Zyklus per lies().
          : praefix === MODELL_EVOLUTION_ABLAGE
            ? { lies: async () => ({ zyklus: 1, referenzNote: null, tor: { offen: false, gesamt: 7, zu: ["Daten"] }, createdAt: new Date().toISOString() }) }
            : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  assert.equal(gesund.stummeQuellen.length, 0);
  assert.equal(gesund.roteAmpeln.length, 1);
  assert.equal(gesund.wartenAufDich.length, 1);
  assert.ok(gesund.entscheiden.some((e) => e.art === "trainings-reife"), "die reife Karte muss unter ENTSCHEIDEN stehen");
});

test("Nr. 60 Tagesmappe: dieselbe Rückroll-Empfehlung steht nur EINMAL (Master-Audit 15.09.)", async () => {
  const jetzt = new Date().toISOString();
  const ablage = (praefix) => praefix === "admin/rueck-roller"
    ? { liste: async () => ({ ok: true, datensaetze: [
      { art: "rueckroll-empfehlung", zuSha: "d8f6bd8c1111", grund: "rot", createdAt: jetzt },
      { art: "rueckroll-empfehlung", zuSha: "d8f6bd8c1111", grund: "rot", createdAt: jetzt },
      { art: "rueckroll-empfehlung", zuSha: "aaaaaaaa2222", grund: "rot", createdAt: jetzt }
    ] }) }
    : { liste: async () => ({ ok: true, datensaetze: [] }), lies: async () => null };
  const mappe = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [
      { id: "synthetic-user-watchdog", ampel: "rot" },
      { id: "nachweis-kette", ampel: "rot" }
    ] }),
    ticketLader: async () => [],
    storeFabrik: ablage
  });
  const rueck = mappe.entscheiden.filter((e) => e.art === "rueckrollen");
  assert.equal(rueck.length, 2, JSON.stringify(rueck));

  // Admin-A-bis-Z 16.09.: sind die Kerne wieder grün, ist die alte Empfehlung erledigt.
  const erholt = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [
      { id: "synthetic-user-watchdog", ampel: "gruen" },
      { id: "nachweis-kette", ampel: "gruen" }
    ] }),
    ticketLader: async () => [],
    storeFabrik: ablage
  });
  assert.equal(erholt.entscheiden.filter((e) => e.art === "rueckrollen").length, 0);
});

test("ANSCHLUSS-BEWEIS: alle in Registry, Taktgeber und Selbstheilung — Nummern eindeutig", () => {
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
  // Nr. 85 (2026-09-08): die Code-Sicherung nach IDrive e2 — fachlich derselbe
  // Schutz-Block, aber ausserhalb des alten Nummernbandes. Die Liste bleibt
  // ABSICHTLICH fest aufgezaehlt: sie ist der Anschluss-Beweis. Wer einen
  // Autopiloten hinzufuegt, soll ihn hier eintragen MUESSEN und dabei merken,
  // ob er ihn auch in Registry und Selbstheilung angeschlossen hat.
  assert.deepEqual(neue, [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 62, 64, 85]);
  assert.ok(AUTOPILOTEN.length >= 62, `die Registry muss mindestens 62 Autopiloten führen, hat ${AUTOPILOTEN.length}`);
});
