// smejj.com — Modell-Evolutions-Takt (Autopilot Nr. 72), Betreiber-Auftrag
// 2026-09-03 ("24/7 dauerhaft trainieren … Autopilot erstellen … du beobachtest,
// ob er 24 Stunden läuft und trainiert").
//
// WAS ER IST: der Kreislauf aus dem Betreiber-Auftrag — MESSEN → SCHWÄCHE
// FINDEN → HYPOTHESE → TOR PRÜFEN → NUR BESSERE VERSIONEN ÜBERNEHMEN — als
// Takt im Control-Server, alle 30 Minuten, neustart-fest. Jeder Durchgang ist
// ein nummerierter Zyklus mit Protokoll in der Ablage; damit ist "läuft er
// rund um die Uhr?" eine ablesbare Zahl statt eine Behauptung.
//
// WAS ER NICHT IST, ausdrücklich: Er STARTET KEIN TRAINING und mietet keine
// GPU. Der Betreiber-Auftrag selbst verlangt: "Rechenleistung nur einsetzen,
// wenn ein messbarer Nutzen erwartet wird" und "keine unkontrollierten
// Produktionsänderungen". Der GPU-Lauf bleibt Rote Liste (Charta §0,
// Trainingsplan 02.09.: unter 3.000 Paaren kein Lauf, Deckel 10 USD/Monat).
// Dieser Takt macht sichtbar, WELCHES Tor noch zu ist — und legt, sobald alle
// Tore offen sind, die Entscheidungskarte in die Tagesmappe (Nr. 60). Geklickt
// wird vom Menschen.
//
// GEMESSEN, NICHT GESCHÄTZT: Referenz-Note aus dem Herzschlag der
// Qualitätsmessung (Nr. 01), Noten je Fähigkeit aus der Kennzahlen-Ablage der
// Evolution-Engine (Nr. 37), Datenreife aus der Karte der Reife-Wache (Nr. 65),
// Schalter und Freigaben aus der echten Umgebung. Was nicht messbar ist, steht
// als "nicht messbar" in der Meldung — nie als Zahl.
import { createRecordStore } from "../admin/recordStore.js";
import { autopilotUebersicht } from "../admin/opsAutopiloten.js";
import { holeKennzahlen } from "../evolution/kennzahlenAblage.js";
import { zaehleAufgaben } from "../evolution/aufgabenAblage.js";
import { isCaptureEnabled } from "../../../src/training/constants.js";
import { TRAININGS_REIFE_ABLAGE } from "./trainingsReifeAutopilot.js";

/** Die Ablage der Zyklus-Protokolle — liest die Tagesmappe (Nr. 60). */
export const MODELL_EVOLUTION_ABLAGE = "autopiloten/modell-evolution";
/** Kennung des überschriebenen Datensatzes mit dem jüngsten Zyklus. */
export const LETZTER_ZYKLUS_ID = "letzter-zyklus";
/** Budgetdeckel für Training (Betreiber-Freigabe 02.09.: 10 USD/Monat). */
export const BUDGET_MONAT_USD_STANDARD = 10;
/** Unter so vielen Messungen ist eine Fähigkeits-Note Rauschen, keine Schwäche. */
export const MINDEST_MESSUNGEN = 5;

/**
 * Die sieben Tore vor einem Trainingslauf — Reihenfolge = Reihenfolge der
 * nächsten Schritte. Jedes Tor nennt den Handgriff, der es öffnet.
 */
export const TORE = Object.freeze([
  { id: "daten", name: "Daten", hinweis: "Einwilligungs-Paare sammeln, bis die Reife-Wache (Nr. 65) Stufe 3 meldet" },
  { id: "einwilligung", name: "Einwilligung", hinweis: "SMEJJ_TRAINING_CAPTURE_ENABLED=YES und IDRIVE_E2_TRAINING_* im Zeabur-Portal setzen" },
  { id: "kostenfreigabe", name: "Kostenfreigabe", hinweis: "schriftliche Freigabe als SMEJJ_LORA_FREIGABE_ID + Monatsbetrag innerhalb des Deckels hinterlegen" },
  { id: "basismodell", name: "Basismodell", hinweis: "Qwen3-4B nach e2 models/staging/ ablegen und SMEJJ_LORA_BASIS_PREFIX setzen" },
  { id: "gpu-heimat", name: "GPU-Heimat", hinweis: "Trainer-Adresse SMEJJ_LORA_TRAINER_URL (Rote Liste: Anbieter-Entscheidung)" },
  { id: "schalter", name: "Schalter", hinweis: "SMEJJ_LORA_LOOP_ENABLED und SMEJJ_LORA_TRAINING_ENABLED auf true, kein SMEJJ_LORA_NOTAUS" },
  { id: "messlatte", name: "Messlatte", hinweis: "Referenz-Note der Live-Kette muss gemessen vorliegen (Qualitätsmessung Nr. 01)" }
]);

/** Liest einen Prozentwert ("97,1 %" oder "97 %") aus einer Meldung; ohne Treffer null. */
export function leseProzent(text = "") {
  const treffer = String(text).match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (!treffer) return null;
  const wert = Number(treffer[1].replace(",", "."));
  return Number.isFinite(wert) && wert >= 0 && wert <= 100 ? wert : null;
}

/** Die schwächste Fähigkeit aus den Kennzahlen-Arten — nur mit genug Messungen. */
export function findeSchwaechste(arten = [], mindestMessungen = MINDEST_MESSUNGEN) {
  const messbar = arten.filter((a) => Number.isFinite(a?.note) && (a.gemessen || 0) >= mindestMessungen);
  if (!messbar.length) return null;
  return messbar.reduce((s, a) => (a.note < s.note ? a : s));
}

function wahr(wert) {
  return ["1", "true", "yes", "ja", "on"].includes(String(wert ?? "").trim().toLowerCase());
}

/**
 * Prüft die sieben Tore gegen die gemessene Lage. Getrennt testbar (kaputt +
 * gesund). Ein Tor ist nur offen, wenn sein Beleg vorliegt — fehlende Werte
 * schließen es (fail-closed), sie werden nie als "vermutlich ok" gewertet.
 *
 * @param {{reifeStufe:number|null, captureAn:boolean, referenzNote:number|null, env:object}} lage
 */
export function pruefeTore({ reifeStufe = null, captureAn = false, referenzNote = null, env = {} } = {}) {
  const deckel = Number(env.SMEJJ_TRAINING_BUDGET_MONAT_USD) > 0 ? Number(env.SMEJJ_TRAINING_BUDGET_MONAT_USD) : BUDGET_MONAT_USD_STANDARD;
  const monatsbetrag = Number(env.SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD);
  const offen = {
    daten: Number(reifeStufe) >= 3,
    einwilligung: captureAn === true,
    kostenfreigabe: Boolean(String(env.SMEJJ_LORA_FREIGABE_ID || "").trim()) && Number.isFinite(monatsbetrag) && monatsbetrag > 0 && monatsbetrag <= deckel,
    basismodell: Boolean(String(env.SMEJJ_LORA_BASIS_PREFIX || "").trim()),
    "gpu-heimat": Boolean(String(env.SMEJJ_LORA_TRAINER_URL || "").trim()),
    schalter: wahr(env.SMEJJ_LORA_LOOP_ENABLED) && wahr(env.SMEJJ_LORA_TRAINING_ENABLED) && !String(env.SMEJJ_LORA_NOTAUS || "").trim(),
    messlatte: Number.isFinite(referenzNote)
  };
  const zu = TORE.filter((t) => !offen[t.id]);
  return {
    offen: zu.length === 0,
    offenAnzahl: TORE.length - zu.length,
    gesamt: TORE.length,
    zu: zu.map((t) => t.name),
    naechsterSchritt: zu.length ? zu[0].hinweis : "alle Tore offen — Lauf smejj 1.1 wartet auf den Betreiber-Klick (Rote Liste)",
    deckelUsd: deckel
  };
}

/** Umgebung, in der alle sieben Tore offen wären — nur für Selbsttest und TÜV. */
export function offeneUmgebungFuerTest() {
  return {
    SMEJJ_LORA_FREIGABE_ID: "freigabe-test", SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "8",
    SMEJJ_LORA_BASIS_PREFIX: "models/staging/qwen3-4b/", SMEJJ_LORA_TRAINER_URL: "https://trainer.test",
    SMEJJ_LORA_LOOP_ENABLED: "true", SMEJJ_LORA_TRAINING_ENABLED: "true"
  };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const alleOffen = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: offeneUmgebungFuerTest() });
  if (!alleOffen.offen || alleOffen.offenAnzahl !== TORE.length) fehler.push("sieben belegte Tore gelten fälschlich als zu");
  const leer = pruefeTore({ reifeStufe: 0, captureAn: false, referenzNote: null, env: {} });
  if (leer.offen || leer.offenAnzahl !== 0) fehler.push("leere Umgebung öffnet fälschlich ein Tor");
  const zuTeuer = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: { ...offeneUmgebungFuerTest(), SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180" } });
  if (zuTeuer.offen || !zuTeuer.zu.includes("Kostenfreigabe")) fehler.push("180 USD/Monat passt nicht unter den 10-USD-Deckel und muss das Kosten-Tor schließen");
  const notaus = pruefeTore({ reifeStufe: 3, captureAn: true, referenzNote: 97, env: { ...offeneUmgebungFuerTest(), SMEJJ_LORA_NOTAUS: "1" } });
  if (notaus.offen || !notaus.zu.includes("Schalter")) fehler.push("Notaus muss das Schalter-Tor schließen");
  if (leseProzent("Note 97,1 % (14 Fälle)") !== 97.1 || leseProzent("kein Wert") !== null) fehler.push("Prozent-Leser liest falsch");
  const schwach = findeSchwaechste([{ art: "text", note: 90, gemessen: 40 }, { art: "code", note: 60, gemessen: 12 }, { art: "bild", note: 10, gemessen: 2 }]);
  if (schwach?.art !== "code") fehler.push("schwächste Fähigkeit falsch bestimmt (Rauschen unter 5 Messungen zählt nicht)");
  return { bestanden: fehler.length === 0, fehler, geprueft: 6 };
}

// Referenz zuerst aus der tiefen Spur (Nr. 75, GLM — die Kette, die Nachdenken
// und Coding bekommen), sonst aus dem Mac-Messlauf der Schnellspur (Nr. 01).
const REFERENZ_QUELLEN = Object.freeze([["tiefe-spur-messung", "Nr. 75"], ["qualitaetsmessung", "Nr. 01"]]);
function referenzAusAmpel(uebersicht) {
  const liste = uebersicht?.autopiloten || [];
  for (const [id, name] of REFERENZ_QUELLEN) {
    const eintrag = liste.find((a) => a.id === id);
    const note = leseProzent(eintrag?.letzterLauf?.meldung || "");
    if (Number.isFinite(note)) return { note, ampel: `${name}, ${eintrag?.ampel || "unbekannt"}` };
  }
  const nr01 = liste.find((a) => a.id === "qualitaetsmessung");
  return { note: null, ampel: `Nr. 01: ${nr01?.ampel || "unbekannt"}` };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die vier Messquellen, dann Tore und
 * Protokoll. GRÜN, solange gemessen werden kann — ein geschlossenes Tor ist
 * ein Zustand, kein Fehler. ROT nur bei unlesbaren Quellen oder falsch
 * beurteilten Selbsttest-Proben.
 */
export async function laufModellEvolution({
  env = process.env,
  storeFabrik = createRecordStore,
  uebersicht = autopilotUebersicht,
  kennzahlen = holeKennzahlen,
  aufgaben = zaehleAufgaben,
  jetztMs = Date.now()
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Modell-Evolution beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }

  // 1. MESSEN — Referenz der Live-Kette (Nr. 01) und Noten je Fähigkeit (Nr. 37).
  let referenz;
  try { referenz = referenzAusAmpel(uebersicht({})); } catch (f) {
    return { ok: false, meldung: `Ampel-Übersicht nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  const k = await Promise.resolve().then(() => kennzahlen({ tage: 7, env })).catch((f) => ({ ok: false, grund: String(f?.message || f).slice(0, 80) }));
  if (!k?.ok) return { ok: false, meldung: `Kennzahlen-Ablage der Evolution-Engine nicht lesbar: ${k?.grund || "ohne Grund"}` };
  const a = await Promise.resolve().then(() => aufgaben({ env })).catch(() => ({ ok: false }));

  // 2. SCHWÄCHE FINDEN — die Fähigkeit mit der niedrigsten Note (genug Messungen).
  const schwaechste = findeSchwaechste(k.arten || []);

  // 3. DATENREIFE — die Karte der Reife-Wache (Nr. 65). Fehlt sie, ist das Tor zu.
  let reife = null;
  try {
    const karte = await storeFabrik(TRAININGS_REIFE_ABLAGE, { maximal: 10 }).lies("letzte-karte");
    if (karte && Number.isFinite(Number(karte.stufe))) reife = { stufe: Number(karte.stufe), gesamt: Number(karte.gesamt) || 0, ziel: Number(karte.ziel) || 0 };
  } catch (f) {
    return { ok: false, meldung: `Reife-Ablage (Nr. 65) nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }

  // 4. TORE — fail-closed gegen die echte Umgebung.
  const captureAn = isCaptureEnabled(env);
  const tor = pruefeTore({ reifeStufe: reife?.stufe ?? null, captureAn, referenzNote: referenz.note, env });

  // 5. PROTOKOLL — nummerierter Zyklus (überschrieben) plus ein Datensatz je Tag.
  const ablage = storeFabrik(MODELL_EVOLUTION_ABLAGE, { maximal: 400 });
  let zyklus = 1;
  let seit = new Date(jetztMs).toISOString();
  try {
    const letzter = await ablage.lies(LETZTER_ZYKLUS_ID);
    if (letzter && Number.isFinite(Number(letzter.zyklus))) { zyklus = Number(letzter.zyklus) + 1; seit = letzter.seit || seit; }
  } catch { /* erster Zyklus */ }
  const protokoll = {
    art: "modell-evolution-zyklus",
    zyklus,
    seit,
    createdAt: new Date(jetztMs).toISOString(),
    referenzNote: referenz.note,
    referenzAmpel: referenz.ampel,
    schwaechste: schwaechste ? { art: schwaechste.art, note: schwaechste.note, gemessen: schwaechste.gemessen } : null,
    aufgabenOffen: a?.ok ? a.offen : null,
    reife,
    captureAn,
    tor: { offen: tor.offen, offenAnzahl: tor.offenAnzahl, gesamt: tor.gesamt, zu: tor.zu, naechsterSchritt: tor.naechsterSchritt },
    trainingGestartet: false
  };
  let ablageStatus = "Protokoll abgelegt";
  try {
    await ablage.schreib({ id: LETZTER_ZYKLUS_ID, ...protokoll }, { timeoutMs: 5000 });
    await ablage.schreib({ id: `tag-${protokoll.createdAt.slice(0, 10)}`, ...protokoll }, { timeoutMs: 5000 });
  } catch {
    ablageStatus = "Protokoll NICHT abgelegt (Ablage gestört)";
  }

  const referenzText = Number.isFinite(referenz.note) ? `Referenz ${referenz.note} % (${referenz.ampel})` : `Referenz nicht messbar (${referenz.ampel})`;
  const schwaechText = schwaechste
    ? `schwächste Fähigkeit ${schwaechste.art} Note ${schwaechste.note}/100 (n=${schwaechste.gemessen}, 7 Tage)`
    : `keine Fähigkeit mit ≥ ${MINDEST_MESSUNGEN} Messungen in 7 Tagen`;
  const reifeText = reife ? `Reife Stufe ${reife.stufe}/3 (${reife.gesamt}/${reife.ziel})` : "Reife unbekannt (Nr. 65 hat noch keine Karte)";
  const torText = tor.offen
    ? `Tor OFFEN ${tor.offenAnzahl}/${tor.gesamt}`
    : `Tor ZU ${tor.offenAnzahl}/${tor.gesamt} (zu: ${tor.zu.join(", ")})`;
  return {
    ok: true,
    meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; Zyklus ${zyklus} seit ${seit.slice(0, 10)}; ${referenzText}; ${schwaechText}; `
      + `${reifeText}; ${torText} — Training NICHT gestartet (Rote Liste); nächster Schritt: ${tor.naechsterSchritt}; ${ablageStatus}`
  };
}
