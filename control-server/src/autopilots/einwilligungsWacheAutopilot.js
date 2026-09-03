// smejj.com — Einwilligungs-Wache (Autopilot Nr. 74), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: Seit der Umgebungs-Löschung vom 14.08. antwortete
// /api/training/consent/decision mit 503 — der Schalter „Modelltraining
// erlauben" sprang zurück, keine Einwilligung war erteilbar, keine Frage
// speicherbar. Fail-closed, wie gebaut — aber KEINE Ampel sagte es. Der
// Trainingsplan vom 02.09. hängt an genau diesem Weg (0 Paare).
//
// Sie prüft im Takt dieselben Bedingungen, an denen die Routen 503 liefern:
// API-Schalter, Signierschlüssel (trainingConsentConfig.ready), Speicher des
// Trainings-Schreibers (IDRIVE_E2_TRAINING_*), erlaubte Präfixe. Mit Netz
// zählt sie zusätzlich die Einwilligungs-Ereignisse im Ledger (nur LIST, nie
// Inhalt). Sie schreibt nichts und erteilt nichts.
import { trainingConsentConfig } from "../../../src/training/consent.js";
import { isCaptureEnabled } from "../../../src/training/constants.js";
import { readTrainingIdriveConfig } from "../../../src/training/idrive-conditional-writer.js";
import { signedS3List, parseS3ListPage } from "../storage/s3Signer.js";

export const LEDGER_PRAEFIX = "training/consents/v1/";
export const CAPTURE_PRAEFIX = "training/fragen/";

/** Liest die Lage aus der Umgebung — ohne zu werfen. Getrennt testbar. */
export function leseEinwilligungsLage(env = process.env) {
  const apiAn = String(env.SMEJJ_TRAINING_CONSENT_API_ENABLED || "NO").trim().toUpperCase() === "YES";
  const schluesselBereit = trainingConsentConfig(env).ready === true;
  let speicher = null;
  let speicherFehler = "";
  try { speicher = readTrainingIdriveConfig(env); } catch (f) { speicherFehler = String(f?.message || f).slice(0, 60); }
  const praefixe = speicher?.allowedPrefixes || [];
  return {
    apiAn,
    schluesselBereit,
    speicherBereit: Boolean(speicher),
    speicherFehler,
    ledgerErlaubt: praefixe.some((p) => LEDGER_PRAEFIX.startsWith(p) || p.startsWith("training/consents")),
    captureErlaubt: praefixe.some((p) => CAPTURE_PRAEFIX.startsWith(p) || p.startsWith("training/fragen")),
    captureAn: isCaptureEnabled(env),
    speicher
  };
}

/** Beurteilt die Lage. Getrennt testbar (kaputt + gesund). */
export function beurteileEinwilligung(lage) {
  if (!lage.apiAn) return { ok: true, grund: "Einwilligungs-API aus (SMEJJ_TRAINING_CONSENT_API_ENABLED≠YES) — gewollt, Schalter in der App zeigt das ehrlich" };
  const zu = [];
  if (!lage.schluesselBereit) zu.push("Signierschlüssel (SMEJJ_TRAINING_CONSENT_*) fehlen oder kollidieren");
  if (!lage.speicherBereit) zu.push(`Trainings-Speicher fehlt (IDRIVE_E2_TRAINING_*: ${lage.speicherFehler || "unvollständig"})`);
  else if (!lage.ledgerErlaubt) zu.push("Präfix training/consents/ nicht in IDRIVE_E2_TRAINING_ALLOWED_PREFIXES");
  if (zu.length) return { ok: false, grund: `Einwilligung NICHT erteilbar — decision/capture antworten 503: ${zu.join("; ")}` };
  const capture = lage.captureAn
    ? (lage.captureErlaubt ? "Erfassung AN" : "Erfassung AN, aber Präfix training/fragen/ nicht erlaubt (Erfassung scheitert mit 503)")
    : "Erfassung aus (SMEJJ_TRAINING_CAPTURE_ENABLED≠YES)";
  return { ok: !(lage.captureAn && !lage.captureErlaubt), grund: `Einwilligung erteilbar (Schlüssel + Speicher bereit); ${capture}` };
}

/** Selbsttest: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const aus = beurteileEinwilligung({ apiAn: false });
  if (!aus.ok) fehler.push("bewusst abgeschaltete API darf nicht rot sein");
  const kaputt = beurteileEinwilligung({ apiAn: true, schluesselBereit: true, speicherBereit: false, speicherFehler: "IDRIVE_E2_TRAINING_ENDPOINT fehlt" });
  if (kaputt.ok || !/503/.test(kaputt.grund)) fehler.push("fehlender Trainings-Speicher muss rot sein und 503 nennen");
  const ohneSchluessel = beurteileEinwilligung({ apiAn: true, schluesselBereit: false, speicherBereit: true, ledgerErlaubt: true });
  if (ohneSchluessel.ok) fehler.push("fehlende Signierschlüssel müssen rot sein");
  const gesund = beurteileEinwilligung({ apiAn: true, schluesselBereit: true, speicherBereit: true, ledgerErlaubt: true, captureErlaubt: true, captureAn: true });
  if (!gesund.ok || !/Erfassung AN/.test(gesund.grund)) fehler.push("vollständige Lage muss grün sein");
  const halb = beurteileEinwilligung({ apiAn: true, schluesselBereit: true, speicherBereit: true, ledgerErlaubt: true, captureErlaubt: false, captureAn: true });
  if (halb.ok) fehler.push("Erfassung AN ohne erlaubtes Präfix muss rot sein");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

/** Zählt Ledger-Ereignisse per LIST (nur Schlüssel, nie Inhalte). */
export async function zaehleEinwilligungen(speicher, { listImpl = signedS3List, fetchImpl = fetch } = {}) {
  let marke = null;
  let erteilt = 0;
  let widerrufen = 0;
  for (let seiten = 0; seiten < 20; seiten += 1) {
    const { response, body } = await listImpl({ ...speicher, prefix: LEDGER_PRAEFIX, continuationToken: marke, fetchImpl, timeoutMs: 8000 });
    if (!response.ok) return { ok: false, status: response.status };
    const seite = parseS3ListPage(body);
    for (const k of seite.keys || []) { if (k.includes("/events/")) erteilt += 1; else if (k.includes("/revocations/")) widerrufen += 1; }
    if (!seite.isTruncated) return { ok: true, erteilt, widerrufen };
    marke = seite.nextContinuationToken || seite.continuationToken || null;
    if (!marke) return { ok: true, erteilt, widerrufen, abgeschnitten: true };
  }
  return { ok: true, erteilt, widerrufen, abgeschnitten: true };
}

/** Der Lauf im Takt: Selbsttest, Umgebung, mit Netz die Zählung. */
export async function laufEinwilligungsWache({ mitNetz = true, env = process.env, listImpl = signedS3List, fetchImpl = fetch } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Einwilligungs-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const lage = leseEinwilligungsLage(env);
  const urteil = beurteileEinwilligung(lage);
  let zaehlung = "";
  if (urteil.ok && lage.apiAn && mitNetz && lage.speicher) {
    try {
      const z = await zaehleEinwilligungen(lage.speicher, { listImpl, fetchImpl });
      zaehlung = z.ok ? `; Ledger: ${z.erteilt} erteilt, ${z.widerrufen} widerrufen${z.abgeschnitten ? " (Liste abgeschnitten)" : ""}` : `; Ledger nicht listbar (HTTP ${z.status})`;
      if (!z.ok) return { ok: false, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}${zaehlung}` };
    } catch (f) {
      zaehlung = `; Ledger nicht listbar (${String(f?.message || f).slice(0, 40)})`;
    }
  }
  return { ok: urteil.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}${zaehlung}` };
}
