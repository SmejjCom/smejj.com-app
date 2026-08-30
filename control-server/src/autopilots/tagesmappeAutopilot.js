// smejj.com — Tagesmappe (Autopilot Nr. 60): EIN Ort für die 10 Minuten des
// Betreibers. Alles, was auf eine Entscheidung wartet, in EINER Mappe —
// statt verteilt über Ampeln, Ablagen und Mails.
//
// Die Mappe SAMMELT nur; sie entscheidet nichts und beschönigt nichts. Jede
// Quelle, die nicht lesbar ist, steht als stumme Quelle IN der Mappe — eine
// Mappe, die Lücken verschweigt, wäre gefährlicher als keine (dieselbe Regel
// wie im Werkstatt-Backlog).
//
// Abschnitte:
//   1. ENTSCHEIDEN   — Rückroll-Empfehlungen, Modell-Wechsel-Empfehlung,
//                      fertige Experiment-Urteile
//   2. ROTE AMPELN   — was gerade kaputt ist (mit Meldung)
//   3. WARTEN AUF DICH — Support-Tickets ohne Antwort, offene Aufgaben
//   4. OFFENE PUNKTE — bekannte Baustellen, die eine Betreiber-Entscheidung
//                      brauchen (zweiter Sicherungs-Eimer)
import { createRecordStore } from "../admin/recordStore.js";
import { autopilotUebersicht } from "../admin/opsAutopiloten.js";
import { listeTickets } from "../admin/supportTickets.js";
import { TRAININGS_REIFE_ABLAGE } from "./trainingsReifeAutopilot.js";
import { DSGVO_FRISTEN_ABLAGE } from "./dsgvoFristenAutopilot.js";
import { FLAGGEN_ABLAGE } from "./flaggenAutopilot.js";

/** Offene Punkte, die nur der Betreiber entscheiden kann. Gepflegt im Code,
 *  damit jeder Eintrag mit seinem Grund im Review steht — KEINE Messwerte. */
export const OFFENE_PUNKTE = Object.freeze([
  // Der zweite Eimer ist seit 2026-08-24 LIVE (smejj-sicherung, us-west-2):
  // IDrive-e2-Objektreplikation spiegelt smejj-app komplett und die
  // Betriebs-Schnappschüsse (sicherung/-Präfix aus smejj-model-files)
  // serverseitig — ohne neuen Schlüssel. Der Dienst-Schlüssel kann den
  // Sicherungs-Eimer bewusst NICHT lesen (Isolation: ein gekaperter Server
  // erreicht das Backup nicht); Kontrolle läuft über die IDrive-Konsole.
  // Zusammenspiel-Audit 2026-08-24: Löschen ist Rote Liste — deshalb steht die
  // Entscheidung HIER statt in einem Automat, der einfach löscht.
  // Aufbewahrung ENTSCHIEDEN (Betreiber-Freigabe 2026-08-24): 30 Tage.
  // Haupteimer: Rotation im Autopiloten Nr. 46 (fail-closed, nur exakte
  // sicherung_JJJJ-MM-TT-Kennungen). Zweit-Eimer: IDrive-Lebenszyklus-Regel
  // (Praefix sicherung/, Ablauf 30 Tage). Damit ist die Liste leer — und
  // eine leere Liste ist der ehrliche Zustand, kein Platzhalter.
]);

function neueAblage(praefix, maximal) {
  return createRecordStore(praefix, { maximal });
}

/**
 * Baut die Mappe aus den echten Quellen. Jede Quelle einzeln abgesichert:
 * ein Fehler macht sie zur benannten stummen Quelle, nie zum leeren Abschnitt.
 */
export async function baueTagesmappe({
  uebersicht = autopilotUebersicht,
  ticketLader = listeTickets,
  storeFabrik = neueAblage,
  env = process.env,
  jetztMs = Date.now()
} = {}) {
  const stumm = [];
  const entscheiden = [];
  const roteAmpeln = [];
  const wartenAufDich = [];

  // 1. Ampel: rote Autopiloten mit ihrer letzten Meldung.
  try {
    const ampel = uebersicht({ jetztMs });
    for (const a of ampel.autopiloten || []) {
      if (a.ampel === "rot") {
        roteAmpeln.push({ id: a.id, name: a.name, meldung: a.letzterLauf?.meldung || "ohne Meldung" });
      }
    }
  } catch (f) {
    stumm.push(`Ampel (${String(f?.message || f).slice(0, 50)})`);
  }

  // 2. Rückroll-Empfehlungen der letzten 3 Tage.
  try {
    const liste = await storeFabrik("admin/rueck-roller", 50).liste({ limit: 20 });
    if (!liste.ok) stumm.push("Rück-Roller-Ablage");
    else {
      for (const e of liste.datensaetze) {
        if (e.art === "rueckroll-empfehlung" && jetztMs - Date.parse(e.createdAt || 0) < 3 * 86_400_000) {
          entscheiden.push({ art: "rueckrollen", text: `Rückrollen auf ${String(e.zuSha).slice(0, 8)}: ${e.grund}` });
        }
      }
    }
  } catch { stumm.push("Rück-Roller-Ablage"); }

  // 3. Jüngste Empfehlung des Modell-Einkäufers (Nr. 34).
  try {
    const liste = await storeFabrik("autopiloten/modell-einkaeufer", 30).liste({ limit: 1 });
    const juengster = liste.ok ? liste.datensaetze[0] : null;
    const empfehlung = juengster?.empfehlung || juengster?.meldung || "";
    if (empfehlung && /wechsel|empfiehlt/i.test(String(empfehlung))) {
      entscheiden.push({ art: "modell-wechsel", text: String(empfehlung).slice(0, 160) });
    }
  } catch { stumm.push("Modell-Einkäufer-Ablage"); }

  // 4. Fertige Experiment-Urteile (Nr. 59).
  try {
    const liste = await storeFabrik("experimente/laeufe", 100).liste({ limit: 20 });
    if (liste.ok) {
      for (const e of liste.datensaetze) {
        if (e.status === "aktiv" && e.urteil && e.urteil !== "zu-frueh") {
          entscheiden.push({ art: "experiment", text: `${e.name || e.id}: ${e.urteil}` });
        }
      }
    }
  } catch { stumm.push("Experiment-Ablage"); }

  // 5. Support: was auf einen Menschen wartet.
  try {
    const tickets = await ticketLader({ env });
    for (const t of tickets) {
      if (t.status === "offen") wartenAufDich.push({ art: "support", text: `Ticket ${t.id}: ${String(t.betreff || "").slice(0, 60)}` });
    }
  } catch { stumm.push("Support-Tickets"); }

  // 6. Dringende Werkstatt-Aufgaben (Stufe 1-2) aus der Evolution-Ablage.
  try {
    const liste = await storeFabrik("evolution/aufgaben", 500).liste({ limit: 100 });
    if (liste.ok) {
      const dringend = liste.datensaetze.filter((a) => Number(a.stufe) <= 2 && a.status !== "erledigt").slice(0, 10);
      for (const a of dringend) wartenAufDich.push({ art: "werkstatt", text: String(a.titel || a.id).slice(0, 80) });
    }
  } catch { stumm.push("Aufgaben-Ablage"); }

  // 7. Trainings-Reife-Karte (Nr. 65): erst ab Stufe 2 ("nah dran" oder "reif")
  // eine Entscheidung — bei Stufe 0/1 ist "weiter sammeln" kein Beschluss wert.
  // Eine veraltete Karte (älter als 3 Tage) zählt als stumme Quelle: die Wache
  // läuft alle 30 Minuten; schweigt sie länger, steht das HIER, nicht nirgends.
  try {
    const liste = await storeFabrik(TRAININGS_REIFE_ABLAGE, 10).liste({ limit: 1 });
    if (!liste.ok) stumm.push("Trainings-Reife-Ablage");
    else {
      const karte = liste.datensaetze[0];
      const frisch = karte && jetztMs - Date.parse(karte.createdAt || 0) < 3 * 86_400_000;
      if (!karte || !frisch) stumm.push("Trainings-Reife-Ablage (veraltet)");
      else if (Number(karte.stufe) >= 2) {
        entscheiden.push({
          art: "trainings-reife",
          text: `Trainingsdaten Stufe ${karte.stufe}/3: ${karte.gesamt}/${karte.ziel} Datensätze`
            + ` — GPU-Lauf braucht deine Kosten-Freigabe (Rote Liste)`
        });
      }
    }
  } catch { stumm.push("Trainings-Reife-Ablage"); }

  // 8. DSGVO-Fristen-Karte (Nr. 67): kritische Fristen (≤ 5 Tage) und
  // überschrittene sind eine Entscheidung — bearbeiten oder (nach Begründung)
  // verlängern. Dieselbe Frisch-Regel wie oben: älter als 3 Tage = stumm.
  try {
    const liste = await storeFabrik(DSGVO_FRISTEN_ABLAGE, 10).liste({ limit: 1 });
    if (!liste.ok) stumm.push("DSGVO-Fristen-Ablage");
    else {
      const karte = liste.datensaetze[0];
      const frisch = karte && jetztMs - Date.parse(karte.createdAt || 0) < 3 * 86_400_000;
      if (!karte || !frisch) stumm.push("DSGVO-Fristen-Ablage (veraltet)");
      else if (Number(karte.ueberschritten) > 0 || Number(karte.kritisch) > 0) {
        const dringend = karte.dringendste?.faelligAm ? `, dringendste fällig ${String(karte.dringendste.faelligAm).slice(0, 10)}` : "";
        entscheiden.push({
          art: "dsgvo-frist",
          text: `DSGVO: ${karte.ueberschritten} über der Frist, ${karte.kritisch} kritisch (≤ 5 Tage)${dringend}`
            + ` — Bußgeld-Risiko, Vorgang bearbeiten oder Frist begründet verlängern`
        });
      }
    }
  } catch { stumm.push("DSGVO-Fristen-Ablage"); }

  // 9. Flaggen-Karte (Nr. 70): vergessene Flag-Entscheidungen (on/partial
  // unverändert über 30 Tage) als EINE Karte — aufräumen oder bewusst lassen.
  try {
    const liste = await storeFabrik(FLAGGEN_ABLAGE, 10).liste({ limit: 1 });
    if (!liste.ok) stumm.push("Flaggen-Ablage");
    else {
      const karte = liste.datensaetze[0];
      const frisch = karte && jetztMs - Date.parse(karte.createdAt || 0) < 3 * 86_400_000;
      if (!karte || !frisch) stumm.push("Flaggen-Ablage (veraltet)");
      else if (Number(karte.veraltetAnzahl) > 0) {
        const namen = (karte.veraltetNamen || []).slice(0, 5).join(", ");
        entscheiden.push({
          art: "flaggen",
          text: `${karte.veraltetAnzahl} Feature-Flag(s) länger als 30 Tage unverändert (${namen})`
            + ` — aufräumen oder bewusst lassen`
        });
      }
    }
  } catch { stumm.push("Flaggen-Ablage"); }

  return {
    ok: true,
    erstelltAm: new Date(jetztMs).toISOString(),
    tag: new Date(jetztMs).toISOString().slice(0, 10),
    entscheiden,
    roteAmpeln,
    wartenAufDich,
    offenePunkte: [...OFFENE_PUNKTE],
    stummeQuellen: stumm,
    zusammenfassung: `${entscheiden.length} Entscheidung(en), ${roteAmpeln.length} rote Ampel(n), `
      + `${wartenAufDich.length} wartend, ${stumm.length} stumme Quelle(n)`
  };
}

/** Selbsttest: eine kaputte Quelle MUSS als stumm erscheinen, eine gesunde Mappe vollständig sein. */
export async function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = await baueTagesmappe({
    uebersicht: () => { throw new Error("Ampel weg"); },
    ticketLader: async () => { throw new Error("Tickets weg"); },
    storeFabrik: () => ({ liste: async () => { throw new Error("Ablage weg"); } })
  });
  if (kaputt.stummeQuellen.length < 3) fehler.push(`kaputte Quellen: nur ${kaputt.stummeQuellen.length} als stumm benannt`);
  const gesund = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [{ id: "x", name: "X", ampel: "rot", letzterLauf: { meldung: "kaputt" } }] }),
    ticketLader: async () => [{ id: "T1", status: "offen", betreff: "Hilfe" }],
    storeFabrik: (praefix) => praefix === TRAININGS_REIFE_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [{ stufe: 3, gesamt: 5200, ziel: 5000, createdAt: new Date().toISOString() }] }) }
      : praefix === DSGVO_FRISTEN_ABLAGE
        ? { liste: async () => ({ ok: true, datensaetze: [{ ueberschritten: 0, kritisch: 1, bald: 0, dringendste: { faelligAm: "2026-09-02" }, createdAt: new Date().toISOString() }] }) }
        : praefix === FLAGGEN_ABLAGE
          ? { liste: async () => ({ ok: true, datensaetze: [{ veraltetAnzahl: 2, veraltetNamen: ["neu-menue", "sprach-test"], createdAt: new Date().toISOString() }] }) }
          : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  if (gesund.roteAmpeln.length !== 1) fehler.push("rote Ampel fehlt in der gesunden Mappe");
  if (gesund.wartenAufDich.length !== 1) fehler.push("offenes Ticket fehlt in der gesunden Mappe");
  if (gesund.stummeQuellen.length !== 0) fehler.push("gesunde Mappe meldet fälschlich stumme Quellen");
  if (!gesund.entscheiden.some((e) => e.art === "trainings-reife")) {
    fehler.push("reife Trainings-Karte fehlt unter ENTSCHEIDEN");
  }
  // Stufe 1 ist bewusst KEINE Entscheidung: weiter sammeln ist kein Beschluss.
  const frueh = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === TRAININGS_REIFE_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [{ stufe: 1, gesamt: 900, ziel: 5000, createdAt: new Date().toISOString() }] }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  if (frueh.entscheiden.some((e) => e.art === "trainings-reife")) {
    fehler.push("Stufe 1 darf noch keine Entscheidung erzeugen");
  }
  // Nr. 67: kritische DSGVO-Frist muss eine Karte sein; eine entspannte Lage nicht.
  if (!gesund.entscheiden.some((e) => e.art === "dsgvo-frist")) {
    fehler.push("kritische DSGVO-Frist fehlt unter ENTSCHEIDEN");
  }
  const dsgvoRuhig = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === DSGVO_FRISTEN_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [{ ueberschritten: 0, kritisch: 0, bald: 0, createdAt: new Date().toISOString() }] }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  if (dsgvoRuhig.entscheiden.some((e) => e.art === "dsgvo-frist")) {
    fehler.push("entspannte DSGVO-Lage darf keine Karte erzeugen");
  }
  // Nr. 70: vergessene Flags müssen eine Karte sein; gepflegte nicht.
  if (!gesund.entscheiden.some((e) => e.art === "flaggen")) {
    fehler.push("vergessene Feature-Flags fehlen unter ENTSCHEIDEN");
  }
  const flaggenRuhig = await baueTagesmappe({
    uebersicht: () => ({ autopiloten: [] }),
    ticketLader: async () => [],
    storeFabrik: (praefix) => praefix === FLAGGEN_ABLAGE
      ? { liste: async () => ({ ok: true, datensaetze: [{ veraltetAnzahl: 0, veraltetNamen: [], createdAt: new Date().toISOString() }] }) }
      : { liste: async () => ({ ok: true, datensaetze: [] }) }
  });
  if (flaggenRuhig.entscheiden.some((e) => e.art === "flaggen")) {
    fehler.push("gepflegte Flags dürfen keine Karte erzeugen");
  }
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echte Mappe. Die Ampel ist GRÜN,
 * wenn die Mappe vollständig gebaut wurde — auch mit unbequemem Inhalt: der
 * Inhalt ist der Zweck, nicht der Fehler. ROT nur, wenn die Mappe selbst
 * nicht zustande kommt oder Quellen stumm sind.
 */
export async function laufTagesmappe() {
  const probe = await fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Tagesmappe baut bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  let mappe;
  try {
    mappe = await baueTagesmappe({});
  } catch (f) {
    return { ok: false, meldung: `Tagesmappe ließ sich nicht bauen: ${String(f?.message || f).slice(0, 80)}` };
  }
  if (mappe.stummeQuellen.length) {
    return { ok: false, meldung: `Mappe unvollständig — stumme Quellen: ${mappe.stummeQuellen.join(", ").slice(0, 120)}` };
  }
  return { ok: true, meldung: `Selbsttest 10/10; Mappe gebaut: ${mappe.zusammenfassung} (GET /api/admin/ops/tagesmappe)` };
}
