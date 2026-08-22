// smejj.com — Protokoll der Anmeldeversuche.
//
// WARUM ES DAS GIBT (Betreiber-Befund 2026-08-22): "Google Login hat nicht
// geklappt" — und in den Zeabur-Logs stand NICHTS. Kein Fehler, keine Zeile,
// nichts. Die Ursache (Anmelde-Ticket galt 120 s, der `state` 600 s) liess
// sich nur finden, indem der Weg von aussen einzeln nachgemessen wurde.
//
// Das darf beim naechsten Mal nicht wieder Stunden kosten. Jeder Schritt des
// Anmeldewegs schreibt jetzt eine Zeile, und zwar so, dass man SIEHT, an
// welcher Stelle es klemmt — nicht nur, DASS es klemmt.
//
// Format wie beim Verbrauch: eine Zeile, ein Praefix, danach JSON. So bleibt
// es mit `grep "[anmeldung]"` und dem Zeabur-Log-Fenster auswertbar.
//
// WAS NIE INS PROTOKOLL DARF: E-Mail-Adressen im Klartext, Tokens, Ticket-IDs
// in voller Laenge, Passwoerter. Ein Log wird kopiert, weitergereicht und
// aufbewahrt — es ist der falsche Ort fuer personenbezogene Daten. Adressen
// werden wie im Kontospeicher als SHA-256 abgelegt (dieselbe Rechnung wie
// `emailKey`), Ticket-IDs auf acht Zeichen gekuerzt: genug, um zwei Zeilen
// einander zuzuordnen, zu wenig, um damit etwas anzufangen.
import crypto from "node:crypto";

// Die Schritte des Anmeldewegs, in der Reihenfolge, in der sie passieren.
// Eine feste Liste, damit im Log keine Schreibweisen auseinanderlaufen.
export const SCHRITTE = Object.freeze({
  TICKET_START: "ticket-start",       // App holt ein Anmelde-Ticket
  WEITERLEITUNG: "weiterleitung",     // Nutzer wird zum Anbieter geschickt
  RUECKKEHR: "rueckkehr",             // Anbieter schickt den Nutzer zurueck
  TICKET_HINTERLEGT: "ticket-hinterlegt", // Token im Ticket abgelegt
  ABGESCHLOSSEN: "abgeschlossen"      // Nutzer ist angemeldet
});

/** Adresse -> Fingerabdruck. Dieselbe Rechnung wie emailKey im Kontospeicher. */
export function adressFingerabdruck(email) {
  const normalisiert = String(email || "").trim().toLowerCase();
  if (!normalisiert) return "";
  return crypto.createHash("sha256").update(normalisiert).digest("hex").slice(0, 16);
}

/** Ticket-ID -> kurzes Stueck, nur zum Zuordnen zweier Zeilen. */
export function ticketKuerzel(id) {
  return String(id || "").slice(0, 8);
}

/**
 * Baut die Protokollzeile als reines Objekt (ohne zu schreiben).
 *
 * Getrennt vom Schreiben, damit ein Pruefer den Inhalt messen kann, ohne die
 * Ausgabe abfangen zu muessen — und damit hier nachweisbar nichts Geheimes
 * hineingerät.
 */
export function baueEintrag({ schritt, anbieter, ok, grund, email, ticket, dauerMs, jetzt = () => Date.now() } = {}) {
  const eintrag = {
    zeitpunkt: new Date(jetzt()).toISOString(),
    schritt: String(schritt || "unbekannt"),
    anbieter: String(anbieter || "unbekannt"),
    ok: ok === true
  };
  // Der Grund ist das Wichtigste an einer fehlgeschlagenen Anmeldung —
  // deshalb steht er da, wo man ihn zuerst sucht.
  if (grund) eintrag.grund = String(grund).slice(0, 120);
  const fingerabdruck = adressFingerabdruck(email);
  if (fingerabdruck) eintrag.konto = fingerabdruck;
  const kuerzel = ticketKuerzel(ticket);
  if (kuerzel) eintrag.ticket = kuerzel;
  if (Number.isFinite(Number(dauerMs))) eintrag.dauerMs = Math.max(0, Math.round(Number(dauerMs)));
  return eintrag;
}

/**
 * Schreiber bauen. `schreibe` ist injizierbar (Tests ohne Konsole),
 * abschaltbar per SMEJJ_ANMELDE_LOG=aus — wie beim Verbrauchsprotokoll.
 */
export function createAnmeldeProtokoll({ schreibe = (zeile) => console.log(zeile), env = process.env, jetzt = () => Date.now() } = {}) {
  const an = String(env.SMEJJ_ANMELDE_LOG || "an") !== "aus";
  return {
    /** Schreibt eine Zeile. Wirft NIE — ein Protokoll darf nie die Anmeldung kippen. */
    notiere(felder = {}) {
      if (!an) return null;
      try {
        const eintrag = baueEintrag({ ...felder, jetzt });
        schreibe(`[anmeldung] ${JSON.stringify(eintrag)}`);
        return eintrag;
      } catch {
        return null;
      }
    }
  };
}
