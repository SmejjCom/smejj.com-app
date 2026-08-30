// smejj.com — DSGVO-Fristen-Wache (Autopilot Nr. 67), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// WARUM ES SIE GIBT: Betroffenenanfragen (Auskunft, Löschung, …) haben eine
// Frist von einem Monat (Art. 12 Abs. 3 DSGVO). Die Vorgangs-Ablage rechnet
// die Restfrist bei jedem Lesen — aber gelesen hat sie bisher nur der Mensch,
// der zufällig aufs Admin-Blatt schaut. Eine überschrittene Frist ist kein
// technischer Schönheitsfehler, sondern ein Bußgeld-Risiko. Diese Wache misst
// die Fristen im Takt und macht die Dringlichkeit zur Ampel.
//
// STUFUNG, bewusst ehrlich: ÜBERSCHRITTEN ist ROT (der Schaden ist da).
// KRITISCH (5 Tage oder weniger) ist noch GRÜN als Ampel — aber die Wache
// legt eine Entscheidungskarte in die Tagesmappe (Nr. 60), damit die Frist
// nicht zwischen zwei Ampel-Runden still verstreicht. Warten ist hier eine
// Entscheidung, kein Ausfall.
import { createRecordStore } from "../admin/recordStore.js";
import { listeAnfragen } from "../admin/gdprRequests.js";

/** Die Ablage der Entscheidungskarte — gelesen von der Tagesmappe (Nr. 60). */
export const DSGVO_FRISTEN_ABLAGE = "autopiloten/dsgvo-fristen";

const OFFEN = ["offen", "in_arbeit"];

/**
 * Bewertet die offenen Vorgänge. Getrennt testbar (kaputt + gesund):
 *   - mindestens ein 'ueberschritten' -> rot
 *   - 'kritisch' (≤ 5 Tage) zählt, erzeugt aber keine rote Ampel, sondern die
 *     Karte für die Tagesmappe
 *   - keine offenen Vorgänge -> grün, ehrlich mit der Zahl 0
 */
export function beurteileFristen(vorgaenge = []) {
  const offen = vorgaenge.filter((v) => OFFEN.includes(v?.status));
  const ueberschritten = offen.filter((v) => v?.dringlichkeit === "ueberschritten");
  const kritisch = offen.filter((v) => v?.dringlichkeit === "kritisch");
  const bald = offen.filter((v) => v?.dringlichkeit === "bald");
  if (ueberschritten.length) {
    const ids = ueberschritten.map((v) => v?.id || "?").join(", ");
    return { ok: false, grund: `${ueberschritten.length} DSGVO-Vorgang/Vorgänge über der Frist (${ids}) — Bußgeld-Risiko, sofort bearbeiten`, ueberschritten: ueberschritten.length, kritisch: kritisch.length, offen: offen.length };
  }
  return { ok: true, ueberschritten: 0, kritisch: kritisch.length, bald: bald.length, offen: offen.length };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const ueber = beurteileFristen([{ status: "offen", dringlichkeit: "ueberschritten", id: "g1" }]);
  if (ueber.ok) fehler.push("überschrittene Frist muss rot sein");
  const kritisch = beurteileFristen([{ status: "in_arbeit", dringlichkeit: "kritisch", id: "g2" }]);
  if (!kritisch.ok || kritisch.kritisch !== 1) fehler.push("kritische Frist muss gezählt und gemeldet werden");
  const erledigt = beurteileFristen([
    { status: "offen", dringlichkeit: "ueberschritten", id: "g3" },
    { status: "abgeschlossen", dringlichkeit: "erledigt", id: "g4" }
  ]);
  if (erledigt.ok) fehler.push("ein abgeschlossener Vorgang darf eine überschrittene offene Frist nicht verstecken");
  const leer = beurteileFristen([]);
  if (!leer.ok || leer.offen !== 0) fehler.push("keine Vorgänge ist grün mit der Zahl 0");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Vorgänge lesen, Fristen bewerten, Karte ablegen. Die Karte
 * ist EIN Datensatz ('letzte-karte'), der überschrieben wird — die Tagesmappe
 * zeigt sie unter ENTSCHEIDEN, sobald kritische oder überschrittene Fristen
 * darauf stehen; eine Karte älter als 3 Tage gilt dort als stumme Quelle.
 *
 * @param {{env?: object, jetztMs?: number, leser?: Function, kartenAblage?: object}} eingabe
 *   leser (Signatur wie listeAnfragen) und kartenAblage testtauglich austauschbar.
 */
export async function laufDsgvoFristen({
  env = process.env,
  jetztMs = Date.now(),
  leser = listeAnfragen,
  kartenAblage = null
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `DSGVO-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  let antwort;
  try {
    antwort = await leser({ env, nowMs: jetztMs });
  } catch (error) {
    return { ok: false, meldung: `DSGVO-Vorgangs-Ablage unlesbar: ${String(error?.message || error).slice(0, 140)}` };
  }
  if (!antwort?.ok) {
    return { ok: false, meldung: `DSGVO-Vorgangs-Ablage nicht lesbar (${antwort?.error || "unbekannt"}) — Fristen sind unbewacht, solange das so ist` };
  }
  const vorgaenge = Array.isArray(antwort?.vorgaenge) ? antwort.vorgaenge : [];
  const urteil = beurteileFristen(vorgaenge);

  const dringendste = vorgaenge
    .filter((v) => OFFEN.includes(v?.status) && v?.faelligAm)
    .map((v) => ({ faelligAm: v.faelligAm, rest: v.restfristTage }))
    .sort((a, b) => String(a.faelligAm).localeCompare(String(b.faelligAm)))[0] || null;
  let karteStatus = "Karte nicht abgelegt";
  try {
    const ablage = kartenAblage || createRecordStore(DSGVO_FRISTEN_ABLAGE, { maximal: 10 });
    await ablage.schreib({
      id: "letzte-karte",
      art: "dsgvo-fristen-karte",
      offen: urteil.offen,
      kritisch: urteil.kritisch,
      bald: urteil.bald,
      ueberschritten: urteil.ueberschritten,
      dringendste,
      createdAt: new Date(jetztMs).toISOString()
    }, { env, timeoutMs: 5000 });
    karteStatus = "Karte in der Tagesmappe-Ablage";
  } catch {
    karteStatus = "Karte NICHT abgelegt (Ablage gestört)";
  }

  if (!urteil.ok) {
    return { ok: false, meldung: `DSGVO: ${urteil.grund}; ${karteStatus}` };
  }
  const critical = urteil.kritisch > 0
    ? ` — ${urteil.kritisch} Vorgang/Vorgänge kritisch (≤ 5 Tage): Entscheidung in der Tagesmappe`
    : "";
  return {
    ok: true,
    meldung: `Selbsttest 4/4; ${urteil.offen} offene DSGVO-Vorgänge, davon ${urteil.kritisch} kritisch, ${urteil.bald} bald${critical}; ${karteStatus}`
  };
}
