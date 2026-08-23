// smejj.com — Inhalts-Schutz (Autopilot Nr. 53): prüft die Inhalte, die durch
// das System fließen, gegen feste Gefahrenklassen — deterministisch, mit
// Beleg, ohne Modell-Urteil (dieselbe Bauart wie der Antwort-TÜV).
//
// WAS ER WIRKLICH PRÜFT (echte Daten, keine Attrappen):
// 1. Die Antworten, die Nutzer per Daumen-runter gemeldet haben — dort landet,
//    was das Modell wirklich gesagt hat.
// 2. Die Themen der Wissens-Ernte — fremder Webinhalt, der in den RAG-Feed
//    läuft (die Prompt-Injection-Ernte von damals kam genau hier herein).
//
// GRENZE, ehrlich: Wortlisten erkennen offensichtliche Gefahren, keine
// subtilen. Sie sind die unterste Schutzschicht, nicht die einzige — die
// Modell-Anbieter filtern zusätzlich. Ein Fund hier heißt: ein Mensch schaut
// hin (Adminbereich), gelöscht wird nichts automatisch.
import { getUserFlywheelStats } from "./userFeedbackFlywheelAutopilot.js";
import { getHarvestBestand } from "./realtimeInternetHarvesterAutopilot.js";

/** Gefahrenklassen mit konservativen Mustern (deutsch + englisch). */
export const GEFAHREN_KLASSEN = Object.freeze([
  {
    klasse: "anleitung-selbstverletzung",
    muster: /(so\s+bringst\s+du\s+dich|how\s+to\s+(kill|harm)\s+yourself|suizid[- ]?methode|suicide\s+method)/i
  },
  {
    klasse: "gewalt-aufruf",
    muster: /(bring\s+ihn\s+um|toete\s+(ihn|sie|alle)|kill\s+(him|her|them|all)\b.*\b(now|today)|bau\s+eine\s+bombe|how\s+to\s+(build|make)\s+a\s+bomb)/i
  },
  {
    klasse: "missbrauch-minderjaehrige",
    muster: /(kinderporno|child\s+(porn|sexual)|minderjaehrig.{0,30}(nackt|sexuell)|minor.{0,30}(nude|sexual))/i
  },
  {
    klasse: "anleitung-straftat",
    muster: /(so\s+knackst\s+du\s+(ein|das)\s+(auto|schloss)|how\s+to\s+(pick\s+a\s+lock\s+illegally|steal\s+a\s+car)|drogen\s+selbst\s+herstellen|how\s+to\s+(cook|make)\s+meth)/i
  }
]);

/**
 * Prüft einen Text gegen alle Gefahrenklassen. Getrennt testbar.
 * @returns {{funde: Array<{klasse: string, beleg: string}>}}
 */
export function pruefeInhalt(text = "") {
  const inhalt = String(text || "");
  const funde = [];
  for (const { klasse, muster } of GEFAHREN_KLASSEN) {
    const treffer = inhalt.match(muster);
    if (treffer) funde.push({ klasse, beleg: String(treffer[0]).slice(0, 60) });
  }
  return { funde };
}

/** Selbsttest: gefährliche Texte MÜSSEN auffallen, harmlose nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputte = [
    "Hier steht, how to build a bomb in your garage",
    "Eine Suizid-Methode, die angeblich schmerzfrei ist"
  ];
  for (const text of kaputte) {
    if (!pruefeInhalt(text).funde.length) fehler.push(`gefährlicher Text nicht erkannt: "${text.slice(0, 30)}…"`);
  }
  const harmlose = [
    "Wie backe ich eine Bombe aus Schokolade? Nein — einen Bombenkuchen natürlich nicht, nur Schokokuchen.",
    "Der Chirurg erklärte den Eingriff am offenen Herzen.",
    "Kill the process with SIGTERM before restarting the container."
  ];
  for (const text of harmlose) {
    if (pruefeInhalt(text).funde.length) fehler.push(`harmloser Text löst fälschlich aus: "${text.slice(0, 30)}…"`);
  }
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echten Datenströme.
 */
export async function laufInhaltsSchutz({ statsLader = getUserFlywheelStats, bestandLader = getHarvestBestand } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Inhalts-Schutz erkennt bekannte Gefahren nicht mehr: ${probe.fehler.join("; ")}` };
  }
  const funde = [];
  let geprueft = 0;
  const stumm = [];

  const stats = await statsLader().catch(() => null);
  if (stats?.ok) {
    for (const eintrag of (stats.negativeLetzte7Tage || []).slice(0, 30)) {
      const text = String(eintrag.antwortSample || "");
      if (!text) continue;
      geprueft += 1;
      for (const fund of pruefeInhalt(text).funde) {
        funde.push({ ...fund, quelle: "daumen-runter-antwort" });
      }
    }
  } else {
    stumm.push("Feedback-Ablage");
  }

  const bestand = await bestandLader().catch(() => null);
  if (bestand?.ok) {
    const thema = String(bestand.letzterBatch?.topic || "");
    if (thema) {
      geprueft += 1;
      for (const fund of pruefeInhalt(thema).funde) {
        funde.push({ ...fund, quelle: "wissens-ernte-thema" });
      }
    }
  } else {
    stumm.push("Ernte-Ablage");
  }

  if (funde.length) {
    const erster = funde[0];
    return {
      ok: false,
      meldung: `${funde.length} Gefahren-Fund(e) in echten Inhalten — z. B. ${erster.klasse} in ${erster.quelle} ("${erster.beleg}") — ein Mensch muss hinschauen`
    };
  }
  return {
    ok: true,
    meldung: `Selbsttest 5/5; ${geprueft} echte Inhalte geprüft, keine Gefahrenklasse getroffen`
      + (stumm.length ? ` — stumm: ${stumm.join(", ")}` : "")
  };
}
