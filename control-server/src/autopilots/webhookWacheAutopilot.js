// smejj.com — Webhook- und Smee-Wache (Autopilot Nr. 84).
//
// Betreiber-Auftrag 2026-09-05: "Smee / Webhook-Proxy muss in unserem System
// sein" — und der Autopilot soll ihn ueberwachen: laeuft der Dienst, besteht
// die Verbindung, kommen Webhooks an, werden sie weitergeleitet, ist das Ziel
// erreichbar, wie viel Speicher braucht er.
//
// WAS DIESE WACHE NICHT TUT: Sie schickt keine Testereignisse durch den
// Kanal. Ein echter Webhook-Weg endet bei Stripe in der Zahlungslogik; ihn zur
// Pruefung mit erfundenen Ereignissen zu fuellen, hiesse den Weg zu
// beschaedigen, den man messen will. Geprueft wird die STRECKE, nicht der
// Inhalt: Dienst gesund, Kanal verbunden, Ziel erreichbar.
//
// AMPEL-REGELN (Hausregel: "nicht messbar" ist kein Verstoss):
//   ROT   Dienst laeuft, meldet sich aber ungesund; oder der eigene Eingang
//         antwortet falsch (offen, obwohl er zu sein muesste).
//   GELB  eingeschaltet, aber die Verbindung steht nicht.
//   GRAU  gar nicht eingerichtet — das ist ein Zustand, kein Fehler.
//   GRUEN Dienst gesund, Kanal verbunden, Eingang antwortet wie erwartet.
import { createRecordStore } from "../admin/recordStore.js";

export const WEBHOOK_WACHE_ABLAGE = "autopiloten/webhook-wache";
const ZEITBUDGET_MS = 8_000;

/**
 * Beurteilt den gemessenen Zustand. Rein und testbar — kein Netz, keine Uhr.
 * @param {{dienst: object|null, eingang: object|null, eingeschaltet: boolean}} lage
 */
export function beurteile({ dienst = null, eingang = null, eingeschaltet = false } = {}) {
  const teile = [];
  if (!eingeschaltet) {
    return { ampel: "grau", ok: true, meldung: "Smee ist nicht eingeschaltet (SMEJJ_SMEE_ENABLED != YES) — kein Zweitweg, der Hauptweg laeuft unveraendert." };
  }
  if (!dienst) {
    teile.push("Dienst nicht erreichbar");
    return { ampel: "rot", ok: false, meldung: `Smee eingeschaltet, aber ${teile.join("; ")}.` };
  }
  if (!dienst.konfiguriert) {
    return { ampel: "rot", ok: false, meldung: `Smee-Dienst laeuft, ist aber nicht eingerichtet: ${(dienst.fehlend || []).join(", ") || "unbekannt"}.` };
  }
  const verbunden = dienst.verbunden === true;
  teile.push(verbunden ? "Kanal verbunden" : "Kanal NICHT verbunden");
  teile.push(`${dienst.zugestellt ?? 0} zugestellt, ${dienst.verworfen ?? 0} verworfen`);
  if (dienst.speicherMb != null) teile.push(`${dienst.speicherMb} MB Speicher`);

  // Der eigene Eingang MUSS einen Fremden abweisen. Antwortet er anders,
  // steht ein oeffentlich erreichbares Tor offen — das ist schlimmer als ein
  // ausgefallener Zweitweg.
  if (eingang && eingang.status !== 401 && eingang.status !== 503) {
    return { ampel: "rot", ok: false,
      meldung: `Der Webhook-Eingang antwortet einem Fremden mit HTTP ${eingang.status} statt 401/503 — er steht offen. ${teile.join("; ")}.` };
  }
  if (eingang) teile.push(`Eingang weist Fremde ab (HTTP ${eingang.status})`);

  if (!verbunden) {
    return { ampel: "gelb", ok: true, meldung: `Smee eingeschaltet, aber die Verbindung steht nicht: ${teile.join("; ")}.` };
  }
  return { ampel: "gruen", ok: true, meldung: `Zweitweg steht: ${teile.join("; ")}.` };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const aus = beurteile({ eingeschaltet: false });
  if (aus.ampel !== "grau") fehler.push("nicht eingeschaltet muss grau sein, nicht rot");
  const tot = beurteile({ eingeschaltet: true, dienst: null });
  if (tot.ampel !== "rot") fehler.push("eingeschaltet ohne Dienst muss rot sein");
  const halb = beurteile({ eingeschaltet: true, dienst: { konfiguriert: true, verbunden: false }, eingang: { status: 401 } });
  if (halb.ampel !== "gelb") fehler.push("Dienst ohne Verbindung muss gelb sein");
  const gut = beurteile({ eingeschaltet: true, dienst: { konfiguriert: true, verbunden: true, zugestellt: 3, verworfen: 0, speicherMb: 41 }, eingang: { status: 401 } });
  if (gut.ampel !== "gruen") fehler.push("gesunde Lage muss gruen sein");
  const offen = beurteile({ eingeschaltet: true, dienst: { konfiguriert: true, verbunden: true }, eingang: { status: 200 } });
  if (offen.ampel !== "rot") fehler.push("ein Eingang, der Fremde durchlaesst, MUSS rot sein");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

/** Holt den Gesundheitsbericht des Smee-Dienstes. Ein Fehler ist kein Wurf. */
export async function fragDienst(adresse, fetchImpl = fetch) {
  if (!adresse) return null;
  try {
    const antwort = await fetchImpl(`${String(adresse).replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(ZEITBUDGET_MS) });
    return await antwort.json();
  } catch { return null; }
}

/** Klopft am eigenen Eingang — OHNE gueltigen Beweis. Er muss abweisen. */
export async function pruefeEingang(basis, fetchImpl = fetch) {
  try {
    const antwort = await fetchImpl(`${String(basis).replace(/\/$/, "")}/api/webhooks/relay`, {
      method: "POST", headers: { "content-type": "application/json", "x-smejj-relay": "falsch-zur-pruefung" },
      body: "{}", signal: AbortSignal.timeout(ZEITBUDGET_MS)
    });
    return { status: antwort.status };
  } catch { return null; }
}

export async function laufWebhookWache({
  env = process.env, storeFabrik = createRecordStore, mitNetz = true,
  fetchImpl = fetch, kartenAblage = null
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Webhook-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };

  const eingeschaltet = String(env.SMEJJ_SMEE_ENABLED || "").toUpperCase() === "YES";
  const dienstAdresse = String(env.SMEJJ_SMEE_DIENST_URL || "").trim();
  const eigeneBasis = String(env.SMEJJ_PUBLIC_API_BASE_URL || "https://api.smejj.com").trim();

  const dienst = mitNetz && eingeschaltet ? await fragDienst(dienstAdresse, fetchImpl) : null;
  const eingang = mitNetz ? await pruefeEingang(eigeneBasis, fetchImpl) : null;
  const urteil = beurteile({ dienst, eingang, eingeschaltet });

  let karte = "Karte nicht abgelegt";
  try {
    const ablage = kartenAblage || storeFabrik(WEBHOOK_WACHE_ABLAGE, { maximal: 10 });
    await ablage.schreib({
      id: "letzte-karte", art: "webhook-wache", ampel: urteil.ampel, eingeschaltet,
      verbunden: dienst?.verbunden ?? null, zugestellt: dienst?.zugestellt ?? null,
      verworfen: dienst?.verworfen ?? null, speicherMb: dienst?.speicherMb ?? null,
      eingangStatus: eingang?.status ?? null, createdAt: new Date().toISOString()
    }, { timeoutMs: 5000 });
    karte = "Karte in der Ablage";
  } catch { karte = "Karte NICHT abgelegt (Ablage gestoert)"; }

  return { ok: urteil.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.meldung} ${karte}` };
}
