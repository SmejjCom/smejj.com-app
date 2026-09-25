// smejj.com — Bildablage der Bruecke (Betreiber 23.09.2026: "Bild erneut anfordern ohne Neumalen").
//
// WARUM: Ein fertig gemaltes Bild reist als ~600 KB data:-Adresse im Antwortstrom.
// Reisst die Leitung dabei ab (LTE, App im Hintergrund), stand in der App nur
// "Die Bild-Uebertragung ist abgerissen" — und ein neuer Auftrag liess den Maler
// wieder 1–2 Minuten ein NEUES Bild malen. Hier bleibt jedes fertige Bild 30
// Minuten liegen. Fragt die App mit `bildErneut: true` nach, kommt DASSELBE Bild
// sofort zurueck, ohne neues Malen.
//
// Schluessel = sha256(Anmelde-Kopf + Auftrag): nur wer das Bild bestellt hat,
// bekommt es zurueck, und nie ein Bild zu einem anderen Auftrag. Gespeichert
// wird nur im Arbeitsspeicher (kein Datentraeger, nach Neustart leer) — Deckel
// 40 Bilder, aelteste zuerst raus. Fail-safe: kein Treffer = normaler Weg.

import { createHash } from "node:crypto";

const BILDABLAGE_MS = 30 * 60 * 1000;
const BILDABLAGE_MAX = 40;
const bildablage = new Map();

/** Schluessel fuer die Ablage; "" ohne Anmelde-Kopf oder Auftrag (dann keine Ablage). */
export function bildablageSchluessel(anmeldung, auftrag) {
  const kopf = String(anmeldung || "").trim();
  const text = String(auftrag || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!kopf || !text) return "";
  return createHash("sha256").update(`${kopf}\n${text}`).digest("hex");
}

/** Will die App ein schon gemaltes Bild zurueck? */
export function willBildErneut(body) {
  return body?.bildErneut === true || body?.preferences?.bildErneut === true;
}

/** Legt ein fertiges Bild ab. Nur echte Bild-Antworten (data:image), nie Absagen. */
export function legeBildAb(schluessel, inhalt, jetzt = Date.now()) {
  const text = String(inhalt || "");
  if (!schluessel || !/\]\(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+\)/i.test(text)) return false;
  bildablage.delete(schluessel);
  bildablage.set(schluessel, { inhalt: text, bis: jetzt + BILDABLAGE_MS });
  while (bildablage.size > BILDABLAGE_MAX) bildablage.delete(bildablage.keys().next().value);
  return true;
}

/** Das abgelegte Bild oder "" (nichts da oder abgelaufen). */
export function holeAbgelegtesBild(schluessel, jetzt = Date.now()) {
  if (!schluessel) return "";
  const eintrag = bildablage.get(schluessel);
  if (!eintrag) return "";
  if (eintrag.bis <= jetzt) {
    bildablage.delete(schluessel);
    return "";
  }
  return eintrag.inhalt;
}

/** Nur fuer Tests und /health: wie viele Bilder liegen gerade ab. */
export function bildablageGroesse() {
  return bildablage.size;
}

// ---- v177: laufendes Malen je Schluessel (Betreiber 25.09.2026, Ashburn-Maler ~165 s) ----
// Reisst der Strom mitten im Malen ab, fragt die App sofort mit bildErneut nach. Frueher war die Ablage
// dann noch leer und die Bruecke malte ein ZWEITES Mal — der einzige Maler arbeitete doppelt. Jetzt wartet
// die Nachfrage auf das laufende Malen desselben Nutzers und Auftrags.
const laufendesMalen = new Map();
const MALEN_MAX_MS = 6 * 60 * 1000;

/** Meldet ein Malen an; die Rueckgabe wird mit dem fertigen Inhalt ("" = gescheitert) aufgerufen. */
export function beginneMalen(schluessel) {
  if (!schluessel) return () => {};
  let erledige = () => {};
  const versprechen = new Promise((fertig) => { erledige = fertig; });
  laufendesMalen.set(schluessel, versprechen);
  // Obergrenze: bricht das Malen ab, ohne sich zu melden, warten Nachfragen nie ewig.
  const notbremse = setTimeout(() => { erledige(""); if (laufendesMalen.get(schluessel) === versprechen) laufendesMalen.delete(schluessel); }, MALEN_MAX_MS);
  notbremse.unref?.();
  return (inhalt) => {
    clearTimeout(notbremse);
    erledige(String(inhalt || ""));
    if (laufendesMalen.get(schluessel) === versprechen) laufendesMalen.delete(schluessel);
  };
}

/** Laeuft fuer diesen Schluessel gerade ein Malen? (nur fuer Tests und Diagnose) */
export function maltGerade(schluessel) {
  return Boolean(schluessel) && laufendesMalen.has(schluessel);
}

function sendeAusAblage(res, inhalt) {
  for (let i = 0; i < inhalt.length; i += 65536) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: inhalt.slice(i, i + 65536) } }] })}\n\n`);
}

/**
 * Bedient eine Nachfrage aus der Ablage — true = erledigt (Antwort gesendet), false = normaler Mal-Weg.
 * Reihenfolge: fertiges Bild > laufendes Malen abwarten (mit Lebenszeichen) > bildNurAblage leer.
 * @param {{kopf: (profil: string) => void, fehltext: string, taktMs?: number}} optionen
 */
export async function bedieneAusAblage(res, body, schluessel, { kopf, fehltext, taktMs = 10_000 }) {
  if (!willBildErneut(body) && body?.bildNurAblage !== true) return false;
  const abgelegt = willBildErneut(body) ? holeAbgelegtesBild(schluessel) : "";
  const imGange = !abgelegt && willBildErneut(body) ? laufendesMalen.get(schluessel) : null;
  if (!abgelegt && !imGange && body?.bildNurAblage !== true) return false;
  kopf(abgelegt ? "bilder-ablage" : imGange ? "bilder-ablage-warten" : "bilder-ablage-leer");
  if (abgelegt) sendeAusAblage(res, abgelegt);
  else if (imGange) {
    const takt = setInterval(() => res.write(": smejj-malt-noch\n\n"), taktMs); // Leitung offen halten
    try {
      const inhalt = await imGange;
      sendeAusAblage(res, inhalt || (body?.bildNurAblage === true ? "" : fehltext));
    } finally {
      clearInterval(takt);
    }
  }
  res.write("data: [DONE]\n\n");
  res.end();
  return true;
}
