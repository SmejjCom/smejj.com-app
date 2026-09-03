// smejj.com — Wächter-TÜV für den Modell-Evolutions-Takt (Nr. 72,
// Betreiber-Auftrag 2026-09-03). Kaputte UND gesunde Probe — die Hausregel.
//
// Ausführen: node --test tests/modell-evolution.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  pruefeTore, leseProzent, findeSchwaechste, fuehreSelbsttestAus, laufModellEvolution,
  offeneUmgebungFuerTest, TORE, MODELL_EVOLUTION_ABLAGE, LETZTER_ZYKLUS_ID
} from "../control-server/src/autopilots/modellEvolutionAutopilot.js";
import { TRAININGS_REIFE_ABLAGE } from "../control-server/src/autopilots/trainingsReifeAutopilot.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon } from "../control-server/src/admin/opsAutopilotenBereiche.js";
import { baueTagesmappe } from "../control-server/src/autopilots/tagesmappeAutopilot.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

test("Nr. 72: die sieben Tore sind fail-closed und öffnen nur mit Beleg", () => {
  assert.equal(TORE.length, 7);
  const leer = pruefeTore({ env: {} });
  assert.equal(leer.offen, false);
  assert.equal(leer.offenAnzahl, 0, "ohne Belege ist kein Tor offen");
  assert.equal(leer.zu.length, 7);
  assert.match(leer.naechsterSchritt, /Nr\. 65/, "der nächste Schritt ist das erste zu Tor (Daten)");

  const alle = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: offeneUmgebungFuerTest() });
  assert.equal(alle.offen, true, alle.zu.join(", "));
  assert.equal(alle.offenAnzahl, 7);

  const teuer = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: { ...offeneUmgebungFuerTest(), SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180" } });
  assert.equal(teuer.offen, false, "180 USD reißt den 10-USD-Deckel");
  assert.deepEqual(teuer.zu, ["Kostenfreigabe"]);
  const eigenerDeckel = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: { ...offeneUmgebungFuerTest(), SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180", SMEJJ_TRAINING_BUDGET_MONAT_USD: "200" } });
  assert.equal(eigenerDeckel.offen, true, "ein höherer Betreiber-Deckel per Env öffnet das Kosten-Tor");

  const notaus = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: { ...offeneUmgebungFuerTest(), SMEJJ_LORA_NOTAUS: "1" } });
  assert.deepEqual(notaus.zu, ["Schalter"], "Notaus schließt genau das Schalter-Tor");
  const unreif = pruefeTore({ reifeStufe: 2, captureAn: true, referenzNote: 97, env: offeneUmgebungFuerTest() });
  assert.deepEqual(unreif.zu, ["Daten"], "Stufe 2 ist nicht reif — unter 3.000 Paaren kein Lauf");
  const ohneReferenz = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: null, env: offeneUmgebungFuerTest() });
  assert.deepEqual(ohneReferenz.zu, ["Messlatte"], "ohne gemessene Referenz gibt es keine Messlatte");
});

test("Nr. 72: Prozent-Leser und Schwächen-Suche", () => {
  assert.equal(leseProzent("Note 97,1 % über 14 Fälle"), 97.1);
  assert.equal(leseProzent("62 %"), 62);
  assert.equal(leseProzent("Lauf ohne Zahl"), null);
  assert.equal(leseProzent("250 %"), null, "unsinnige Werte werden verworfen");
  const s = findeSchwaechste([
    { art: "text", note: 92, gemessen: 100 },
    { art: "code", note: 71, gemessen: 9 },
    { art: "bild", note: 5, gemessen: 1 }
  ]);
  assert.equal(s.art, "code", "die niedrigste Note mit genug Messungen");
  assert.equal(findeSchwaechste([{ art: "bild", note: 5, gemessen: 1 }]), null, "eine Messung ist Rauschen");
  assert.equal(findeSchwaechste([]), null);
});

function speicher(reifeKarte, { protokoll = [], kaputt = false } = {}) {
  return (praefix) => {
    if (kaputt) return { lies: async () => { throw new Error("Ablage weg"); }, schreib: async () => { throw new Error("Ablage weg"); } };
    if (praefix === TRAININGS_REIFE_ABLAGE) return { lies: async () => reifeKarte };
    if (praefix === MODELL_EVOLUTION_ABLAGE) {
      return {
        lies: async (id) => protokoll.filter((d) => d.id === id).at(-1) || null,
        schreib: async (d) => { protokoll.push(d); return d; }
      };
    }
    return { lies: async () => null, schreib: async (d) => d };
  };
}

const ampel = (meldung) => () => ({ autopiloten: [{ id: "qualitaetsmessung", ampel: "gruen", letzterLauf: { meldung } }] });
const kennzahlen = async () => ({ ok: true, arten: [{ art: "text", note: 93, gemessen: 50 }, { art: "code", note: 70, gemessen: 12 }] });

test("Nr. 72: der Lauf misst, findet die Schwäche, zählt Zyklen und startet NICHTS", async () => {
  const protokoll = [];
  const erster = await laufModellEvolution({
    env: {},
    storeFabrik: speicher({ stufe: 0, gesamt: 0, ziel: 5000 }, { protokoll }),
    uebersicht: ampel("Note 97,1 % (14 Fälle, 3 Wiederholungen)"),
    kennzahlen,
    aufgaben: async () => ({ ok: true, offen: 4, gesamt: 9 }),
    jetztMs: Date.parse("2026-09-03T10:00:00Z")
  });
  assert.equal(erster.ok, true, erster.meldung);
  assert.match(erster.meldung, /Zyklus 1 seit 2026-09-03/);
  assert.match(erster.meldung, /Referenz 97\.1 %/);
  assert.match(erster.meldung, /schwächste Fähigkeit code Note 70\/100 \(n=12/);
  assert.match(erster.meldung, /Reife Stufe 0\/3/);
  assert.match(erster.meldung, /Tor ZU 1\/7/, "nur die Messlatte ist belegt");
  assert.match(erster.meldung, /Training NICHT gestartet \(Rote Liste\)/);
  assert.match(erster.meldung, /nächster Schritt: Einwilligungs-Paare sammeln/);
  assert.equal(protokoll.length, 2, "ein überschriebener Zyklus-Satz plus ein Tages-Satz");
  assert.equal(protokoll[0].id, LETZTER_ZYKLUS_ID);
  assert.equal(protokoll[1].id, "tag-2026-09-03");
  assert.equal(protokoll[0].trainingGestartet, false);
  assert.equal(protokoll[0].tor.offen, false);

  const zweiter = await laufModellEvolution({
    env: {},
    storeFabrik: speicher({ stufe: 0, gesamt: 0, ziel: 5000 }, { protokoll }),
    uebersicht: ampel("Note 97,1 %"),
    kennzahlen,
    aufgaben: async () => ({ ok: true, offen: 4, gesamt: 9 }),
    jetztMs: Date.parse("2026-09-03T10:30:00Z")
  });
  assert.match(zweiter.meldung, /Zyklus 2 seit 2026-09-03/, "der Zähler läuft über die Ablage weiter");
});

test("Nr. 72: alle Tore offen → Tor OFFEN, Protokoll trägt offen:true, trotzdem kein Start", async () => {
  const protokoll = [];
  const e = await laufModellEvolution({
    env: { ...offeneUmgebungFuerTest(), SMEJJ_TRAINING_CAPTURE_ENABLED: "YES" },
    storeFabrik: speicher({ stufe: 3, gesamt: 5200, ziel: 5000 }, { protokoll }),
    uebersicht: ampel("Note 97 %"),
    kennzahlen,
    aufgaben: async () => ({ ok: true, offen: 0, gesamt: 0 })
  });
  assert.equal(e.ok, true, e.meldung);
  assert.match(e.meldung, /Tor OFFEN 7\/7/);
  assert.match(e.meldung, /Betreiber-Klick/);
  assert.match(e.meldung, /Training NICHT gestartet/);
  assert.equal(protokoll[0].tor.offen, true);
  assert.equal(protokoll[0].trainingGestartet, false, "auch mit offenem Tor startet der Takt nichts");
});

test("Nr. 72: unlesbare Quellen sind rot, fehlende Referenz ist ehrlich 'nicht messbar'", async () => {
  const kaputt = await laufModellEvolution({
    env: {},
    storeFabrik: speicher(null, { kaputt: true }),
    uebersicht: ampel("Note 97 %"),
    kennzahlen,
    aufgaben: async () => ({ ok: false })
  });
  assert.equal(kaputt.ok, false, "Reife-Ablage weg MUSS rot sein");

  const ohneKennzahlen = await laufModellEvolution({
    env: {},
    storeFabrik: speicher({ stufe: 1, gesamt: 800, ziel: 5000 }),
    uebersicht: ampel("Note 97 %"),
    kennzahlen: async () => ({ ok: false, grund: "S3 503" }),
    aufgaben: async () => ({ ok: false })
  });
  assert.equal(ohneKennzahlen.ok, false, "Kennzahlen-Ablage weg MUSS rot sein");
  assert.match(ohneKennzahlen.meldung, /S3 503/);

  const ohneReferenz = await laufModellEvolution({
    env: {},
    storeFabrik: speicher(null),
    uebersicht: () => ({ autopiloten: [] }),
    kennzahlen: async () => ({ ok: true, arten: [] }),
    aufgaben: async () => ({ ok: false })
  });
  assert.equal(ohneReferenz.ok, true, "keine Referenz ist ein Zustand, kein Ausfall");
  assert.match(ohneReferenz.meldung, /Referenz nicht messbar/);
  assert.match(ohneReferenz.meldung, /Reife unbekannt \(Nr\. 65 hat noch keine Karte\)/);
  assert.match(ohneReferenz.meldung, /keine Fähigkeit mit ≥ 5 Messungen/);
  assert.match(ohneReferenz.meldung, /Tor ZU 0\/7/);
});

test("Nr. 72: die Tagesmappe zeigt die Karte NUR bei offenem Tor und benennt eine stumme Ablage", async () => {
  const mappeOffen = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === MODELL_EVOLUTION_ABLAGE
      ? { lies: async () => ({ zyklus: 40, referenzNote: 97, tor: { offen: true, gesamt: 7, zu: [] }, createdAt: new Date().toISOString() }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  const karte = mappeOffen.entscheiden.find((e) => e.art === "modell-evolution");
  assert.ok(karte, "offenes Tor muss eine Karte unter ENTSCHEIDEN sein");
  assert.match(karte.text, /Zyklus 40/);
  assert.match(karte.text, /Betreiber-Klick/);

  const mappeZu = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === MODELL_EVOLUTION_ABLAGE
      ? { lies: async () => ({ zyklus: 40, tor: { offen: false, gesamt: 7, zu: ["Daten"] }, createdAt: new Date().toISOString() }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  assert.ok(!mappeZu.entscheiden.some((e) => e.art === "modell-evolution"), "zu Tor = weiter sammeln, keine Entscheidung");
  assert.ok(!mappeZu.stummeQuellen.some((q) => /Modell-Evolution/.test(q)));

  const veraltet = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === MODELL_EVOLUTION_ABLAGE
      ? { lies: async () => ({ zyklus: 2, tor: { offen: true, gesamt: 7, zu: [] }, createdAt: "2026-08-01T00:00:00Z" }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  assert.ok(veraltet.stummeQuellen.some((q) => /Modell-Evolutions-Ablage \(veraltet\)/.test(q)), "ein Takt, der 3 Tage schweigt, steht als stumm in der Mappe");
});

test("Nr. 72 ANSCHLUSS-BEWEIS: registriert, betrieben, heartbeat, zugeordnet, Nummer eindeutig", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "modell-evolution");
  assert.ok(eintrag, "Registry-Eintrag fehlt");
  assert.equal(eintrag.nummer, "72");
  assert.equal(eintrag.messung, "heartbeat", "Nr. 72 muss MESSEN, nicht geplant sein");
  assert.match(eintrag.ort, /Autopilot-Läufer/);
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("modell-evolution"), "die Selbstheilung muss ihn wiederbeleben können");
  assert.equal(bereichVon("modell-evolution"), "Modelle & Wissen");
  const nummern = AUTOPILOTEN.map((a) => String(a.nummer));
  assert.equal(nummern.filter((n) => n === "72").length, 1, "keine doppelte Nummer (Lehre von Nr. 40)");
  assert.ok(eintrag.funktionen.some((f) => /STARTET KEIN TRAINING/.test(f)), "die Grenze steht in der Registry");
});

test("Nr. 72: der Selbsttest fällt durch, wenn die Tor-Mathematik kippt", () => {
  const probe = fuehreSelbsttestAus();
  assert.equal(probe.bestanden, true, `Selbsttest muss grün sein: ${probe.fehler.join("; ")}`);
  assert.equal(probe.geprueft, 6);
});
