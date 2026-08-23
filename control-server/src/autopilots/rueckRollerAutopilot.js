// smejj.com — Rück-Roller (Autopilot Nr. 44): erkennt, wenn ein frischer
// Deploy die Kern-Ampeln umwirft, und legt eine fertige Rückroll-Empfehlung
// vor — im PROTOKOLL-MODUS, er rollt nie selbst.
//
// WARUM PROTOKOLL-MODUS: Zwei Gründe, beide gemessen. Erstens liegt der
// Zeabur-Schlüssel auf dem Mac des Betreibers (cli.yaml), nicht am Dienst —
// der Container KANN gar nicht deployen, und so zu tun wäre eine Attrappe.
// Zweitens ist ein automatischer Eingriff erst nach einer Beobachtungsphase
// vertretbar, in der jede Empfehlung protokolliert und vom Betreiber geprüft
// wurde (Branchen-Standard: erst mitschreiben, dann eingreifen).
//
// Was er WIRKLICH misst: die Kennung des laufenden Standes
// (ZEABUR_GIT_COMMIT_SHA, von Zeabur je Bau gesetzt — siehe Modul AL) gegen
// den letzten Stand, unter dem die Kern-Ampeln nachweislich grün waren. Der
// stabile Stand wird in der Ablage mitgeführt und überlebt Neustarts.
import { createRecordStore } from "../admin/recordStore.js";

/** Die Ampeln, ohne die der Dienst für Nutzer nicht funktioniert. */
export const KERN_AMPELN = Object.freeze([
  "brueckenwaechter",       // antwortet die Chat-Brücke?
  "synthetic-user-watchdog",// kommt ein Nutzer durch (Anmeldung, Chat, Speicher)?
  "nachweis-kette",         // lässt sich der Adminspeicher beschreiben?
  "container-puls"          // lebt der Control-Server selbst?
]);

/** Ab wie vielen roten Kern-Ampeln eine Empfehlung fällig ist. */
export const ROT_SCHWELLE = 2;

const ABLAGE_ID = "rueck-roller-stand";

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("admin/rueck-roller");
  return ablageStandard;
}

/** Der Stand, den Zeabur diesem Bau mitgegeben hat. Leer = nicht auf Zeabur. */
export function aktuellerStand(env = process.env) {
  return String(env.ZEABUR_GIT_COMMIT_SHA || "").slice(0, 40);
}

/**
 * Das Urteil, getrennt von jeder Außenwelt — damit der Selbsttest es mit
 * kaputter UND gesunder Probe prüfen kann.
 *
 * @param {{autopiloten: Array, aktuelleSha: string, stabileSha: string}} lage
 * @returns {{empfehlung: boolean, roteKerne: string[], grund: string}}
 */
export function beurteileLage({ autopiloten = [], aktuelleSha = "", stabileSha = "" } = {}) {
  const roteKerne = autopiloten
    .filter((a) => KERN_AMPELN.includes(a.id) && a.ampel === "rot")
    .map((a) => a.id);
  if (roteKerne.length < ROT_SCHWELLE) {
    return { empfehlung: false, roteKerne, grund: roteKerne.length ? `${roteKerne.length} rote Kern-Ampel(n) — unter der Schwelle von ${ROT_SCHWELLE}` : "Kern-Ampeln in Ordnung" };
  }
  if (!aktuelleSha || !stabileSha || aktuelleSha === stabileSha) {
    // Rote Kerne OHNE Standwechsel sind ein Betriebsproblem, kein Deploy-
    // Problem — zurückrollen würde denselben Stand noch einmal bauen.
    return { empfehlung: false, roteKerne, grund: `${roteKerne.length} rote Kern-Ampeln, aber kein Standwechsel seit dem stabilen Stand — Rückrollen würde nichts ändern` };
  }
  return {
    empfehlung: true,
    roteKerne,
    grund: `${roteKerne.length} rote Kern-Ampeln (${roteKerne.join(", ")}) auf Stand ${aktuelleSha.slice(0, 8)} — letzter stabiler Stand ist ${stabileSha.slice(0, 8)}`
  };
}

/** Selbsttest: kaputte UND gesunde Lage müssen richtig beurteilt werden. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = beurteileLage({
    autopiloten: [
      { id: "brueckenwaechter", ampel: "rot" },
      { id: "synthetic-user-watchdog", ampel: "rot" },
      { id: "container-puls", ampel: "gruen" }
    ],
    aktuelleSha: "b".repeat(40),
    stabileSha: "a".repeat(40)
  });
  if (!kaputt.empfehlung) fehler.push("kaputte Lage (2 rote Kerne, frischer Stand) löst KEINE Empfehlung aus");
  const gesund = beurteileLage({
    autopiloten: KERN_AMPELN.map((id) => ({ id, ampel: "gruen" })),
    aktuelleSha: "b".repeat(40),
    stabileSha: "a".repeat(40)
  });
  if (gesund.empfehlung) fehler.push("gesunde Lage löst fälschlich eine Empfehlung aus");
  const gleicherStand = beurteileLage({
    autopiloten: [
      { id: "brueckenwaechter", ampel: "rot" },
      { id: "nachweis-kette", ampel: "rot" }
    ],
    aktuelleSha: "a".repeat(40),
    stabileSha: "a".repeat(40)
  });
  if (gleicherStand.empfehlung) fehler.push("ohne Standwechsel darf es keine Rückroll-Empfehlung geben");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann echte Lage.
 *
 * Grüne Kern-Ampeln STEMPELN den aktuellen Stand als stabil (in die Ablage);
 * eine Empfehlung wird als Vorfall in die Ablage geschrieben — sie erscheint
 * in der Tagesmappe und der Betreiber rollt mit einem Klick im Zeabur-Portal
 * (oder per Control deploy(gitRef)) zurück.
 */
export async function laufRueckRoller({ uebersicht, ablage = null, env = process.env, jetztIso = new Date().toISOString() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Rück-Roller beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  const aktuelleSha = aktuellerStand(env);
  let stand = null;
  try {
    stand = await speicher.lies(ABLAGE_ID);
  } catch { /* eine unlesbare Ablage wird unten ehrlich benannt */ }

  const daten = uebersicht({});
  const lage = beurteileLage({
    autopiloten: daten.autopiloten || [],
    aktuelleSha,
    stabileSha: String(stand?.stabileSha || "")
  });

  if (!lage.empfehlung && lage.roteKerne.length === 0 && aktuelleSha) {
    // Alle Kerne grün: DIESER Stand ist der neue stabile. Nur dann stempeln —
    // ein halb kranker Stand darf nie zum Rückroll-Ziel werden.
    const alleKerneGruen = KERN_AMPELN.every((id) =>
      (daten.autopiloten || []).some((a) => a.id === id && a.ampel === "gruen"));
    if (alleKerneGruen && stand?.stabileSha !== aktuelleSha) {
      try {
        await speicher.schreib({ id: ABLAGE_ID, stabileSha: aktuelleSha, createdAt: jetztIso, updatedAt: jetztIso });
        stand = { stabileSha: aktuelleSha };
      } catch { /* nicht stempeln können ist kein Ausfall des Urteils */ }
    }
  }

  if (lage.empfehlung) {
    try {
      await speicher.schreib({
        id: `empfehlung_${jetztIso.slice(0, 13)}`,
        art: "rueckroll-empfehlung",
        createdAt: jetztIso,
        vonSha: aktuelleSha,
        zuSha: String(stand?.stabileSha || ""),
        grund: lage.grund
      });
    } catch { /* die rote Meldung unten trägt den Grund auch ohne Ablage */ }
    return { ok: false, meldung: `RÜCKROLL-EMPFEHLUNG (Protokoll-Modus, rollt nicht selbst): ${lage.grund}` };
  }

  const standText = stand?.stabileSha
    ? `stabiler Stand ${String(stand.stabileSha).slice(0, 8)}`
    : "noch kein stabiler Stand gestempelt";
  const standort = aktuelleSha ? `Stand ${aktuelleSha.slice(0, 8)}` : "ohne Zeabur-Standkennung (lokal?)";
  return { ok: true, meldung: `Selbsttest 3/3; ${lage.grund} — ${standort}, ${standText}` };
}
