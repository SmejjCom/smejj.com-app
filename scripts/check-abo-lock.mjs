#!/usr/bin/env node
// smejj.com — 100%-Schutz der Abo- und Zahlungskette (abo lock v1).
//
// Freigabe des Betreibers vom 2026-08-14:
//   "wenn es alles fertig sicherer alles soll nicht mehr kaputt gehen, nicht
//    mehr geändert werden ohne schriftliche Bestätigung"
//
// WARUM EIN EIGENES MANIFEST und nicht eine bestehende Liste erweitern:
// dieselbe Begruendung wie bei der Einwilligungssperre. Der Start-Lock wird bei
// jedem sw.js-Versionssprung neu eingefroren, oft mehrmals taeglich; laege die
// Zahlungskette dort, wuerde jeder dieser Spruenge stillschweigend auch eine
// Aenderung am Geld mit absegnen.
//
// WAS HIER GESCHUETZT WIRD UND WARUM GENAU DAS:
// Diese Dateien entscheiden, ob eine Zahlung beim Kunden ankommt. Ein Defekt
// darin ist teuer und in BEIDE Richtungen unsichtbar:
//
//   - Faellt die Kette aus, zahlen Kunden und bekommen nichts. Die Oberflaeche
//     sieht dabei voellig normal aus — sie zeigt einfach "Free".
//   - Faellt sie zu weit auf, bekommt jemand Leistungen, fuer die nie gezahlt
//     wurde. Auch das meldet niemand.
//
// BEIDE Richtungen sind hier tatsaechlich eingetreten, am 2026-08-13/14:
//   - Der Webhook war NIE konfiguriert (503). Der Betreiber zahlte ein echtes
//     Abo; der Server erfuhr nie davon. Wochenlang unbemerkt, weil niemand
//     nachgemessen hat und die App brav "Free" anzeigte.
//   - Das Produkt->Plan-Mapping kannte nur Testprodukte, waehrend die
//     Zahlungslinks live waren: eine echte Zahlung waere als Plan `null`
//     gespeichert und als "free" ausgeliefert worden.
//   - Die Zuordnung Kunde->Konto laeuft ueber sha256(E-Mail). Ging die Kennung
//     beim Kauf verloren, blieb der Zahlende fuer immer unzugeordnet.
//
// Keiner dieser drei Fehler war ein Logikfehler. Alle drei waren VERDRAHTUNG
// und Konfiguration — genau das, was eine Dateisperre sichtbar macht, statt es
// in einem Sammel-Commit untergehen zu lassen.
//
// Aenderungsprozess (nur mit ausdruecklicher schriftlicher Bestaetigung):
//   1. Bestaetigung einholen (Wortlaut aufbewahren).
//   2. Aenderung umsetzen, ALLE Check-Suiten gruen bekommen.
//   3. node scripts/check-abo-lock.mjs --freeze --confirm "<Wortlaut>"
import { istDirektAufgerufen, runLockCli } from "./lib/datei-sperre.mjs";

export const PROTECTED_FILES = [
  // Der einzige Weg, auf dem eine Zahlung ins System kommt: Signaturpruefung,
  // Statusausgabe und die Kundenportal-Sitzung.
  "control-server/src/routes/billingRoutes.js",
  // Signaturpruefung selbst. Faellt sie auf, kann jeder Abos verschenken.
  "control-server/src/billing/stripeWebhookVerify.js",
  // Ereignis -> Zustand, inklusive Bestaetigungsmail und der Zuordnung ueber
  // die bei Stripe bestaetigte Adresse.
  "control-server/src/billing/stripeEventApply.js",
  // Welches Produkt welcher Plan ist, wo der Zustand liegt, wann eine Periode
  // endet. Hier sass der Live-/Testmodus-Fehler.
  "control-server/src/billing/subscriptionStore.js",
  // Was der angemeldete Nutzer ueber sein Abo zu sehen bekommt, und die
  // Knoepfe, die Geld kosten (Checkout vs. Kundenportal).
  "public/account-privacy.js",
  // Der Bearer-Weg zu Status und Kundenportal.
  "public/account-sessions.js",
  // Die Bestaetigung nach der Zahlung. Ohne sie steht der Kunde nach dem
  // Bezahlen vor einer Stripe-Standardseite und weiss nichts.
  "public/danke-abo.html",
  "public/danke-abo.js",
  // Die Betreiber-Sicht auf offene Zahlungen und nicht zugeordnete Kunden.
  "control-server/src/admin/opsAbrechnung.js"
];

export const ABO_LOCK = {
  name: "abo-lock",
  manifestPath: "docs/approvals/abo-lock-manifest.json",
  backupRoot: "backups/abo-lock",
  skriptPfad: "scripts/check-abo-lock.mjs",
  lockLabel: "smejj abo lock v1 (100% Schutz)",
  rule: "Keine Aenderung an der Abo- und Zahlungskette (Webhook, Signaturpruefung, Plan-Zuordnung, Abo-Anzeige, Kaufknoepfe, Zahlungsbestaetigung) ohne ausdrueckliche schriftliche Bestaetigung des Betreibers.",
  betreff: "die Abo- und Zahlungskette ist 100% geschuetzt",
  sammelname: "Abo- und Zahlungskette",
  files: PROTECTED_FILES
};

if (istDirektAufgerufen(import.meta.url)) runLockCli(ABO_LOCK);
