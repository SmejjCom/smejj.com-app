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
  "Sicherungs-Schnappschüsse (sicherung/taeglich, jetzt auch als Kopie im Eimer smejj-sicherung) sammeln sich ohne Aufräumen an — Aufbewahrungsdauer festlegen (auch wegen Löschrechten: user-memory steckt in den Kopien) und das Löschen alter Stände freigeben (Betreiber-Entscheidung)"
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
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }) })
  });
  if (gesund.roteAmpeln.length !== 1) fehler.push("rote Ampel fehlt in der gesunden Mappe");
  if (gesund.wartenAufDich.length !== 1) fehler.push("offenes Ticket fehlt in der gesunden Mappe");
  if (gesund.stummeQuellen.length !== 0) fehler.push("gesunde Mappe meldet fälschlich stumme Quellen");
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
  return { ok: true, meldung: `Selbsttest 4/4; Mappe gebaut: ${mappe.zusammenfassung} (GET /api/admin/ops/tagesmappe)` };
}
