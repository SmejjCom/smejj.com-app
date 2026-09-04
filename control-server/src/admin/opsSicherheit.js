// smejj.com — Modul L: Sicherheit (Single Responsibility: sicherheitsrelevante Lage).
//
// Kein neues Protokoll, keine zweite Wahrheit: dieses Modul ist eine LINSE auf
// das bestehende Audit-Log und das Nutzerverzeichnis. Ein eigener
// Sicherheits-Speicher waere ein zweiter Stand, der vom ersten abweichen kann —
// und bei einer Pruefung sind zwei Staende schlimmer als einer.
//
// Gezeigt wird ausschliesslich, was gemessen wurde. Zusagen wie "die
// Konto-Enumeration ist geschlossen" stehen hier bewusst NICHT: das waere eine
// Behauptung aus dem Gedaechtnis, kein Befund. Ein Sicherheitsbildschirm, der
// ungepruefte Zusicherungen anzeigt, ist gefaehrlicher als keiner.
import { readAuditPage } from "./auditLog.js";
import { readUserIndex } from "./userIndex.js";

// Was als sicherheitsrelevant gilt — nach Gewicht gruppiert, nicht alphabetisch.
const GEWICHTE = Object.freeze({
  "impersonation.break_glass": "hoch",
  "impersonation.start": "hoch",
  "user.delete": "hoch",
  "users.delete": "hoch",
  "user.role.grant": "hoch",
  "users.role.grant": "hoch",
  "approval.reject": "mittel",
  "approval.approve": "mittel",
  "impersonation.request": "mittel",
  "impersonation.end": "niedrig",
  "user.block": "mittel",
  "users.block": "mittel",
  "user.unblock": "mittel",
  "user.unlock": "niedrig",
  "user.verify": "niedrig",
  "users.unlock": "niedrig",
  "users.verify": "niedrig",
  "audit.read": "niedrig",
  // Admin stellt API-Schluessel aus (smejj-adm-…, 2026-09-04): gibt Dritten Zugang
  // auf das Konto des Ausstellers, bis zu unbefristet — hoch. Widerruf: mittel.
  "apikey.issue": "hoch",
  "apikey.revoke": "mittel",
  "apikey.budget": "niedrig"
});

const TAG_MS = 24 * 60 * 60 * 1000;

export async function sicherheitsUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  tage = 7,
  leseAudit = readAuditPage,
  leseIndex = readUserIndex
} = {}) {
  const von = new Date(jetztMs - Math.max(1, Math.min(90, tage)) * TAG_MS).toISOString().slice(0, 10);

  const [audit, index] = await Promise.all([
    sicher(() => leseAudit({ limit: 200, env, nowMs: jetztMs, from: von })),
    sicher(() => leseIndex({ env }))
  ]);

  return {
    ok: true,
    zeitraumAbTag: von,
    ereignisse: ereignisLage(audit, jetztMs),
    konten: kontenLage(index, jetztMs),
    kette: audit?.ok ? null : "Audit-Log nicht lesbar",
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: "Linse auf Audit-Log und Nutzerverzeichnis — kein zweiter Speicher. "
      + "Angezeigt wird nur, was gemessen wurde; keine Zusicherungen aus dem Gedaechtnis."
  };
}

function ereignisLage(audit, jetztMs) {
  if (!audit?.ok) return { erreichbar: false, grund: audit?.error || "unbekannt" };
  const alle = Array.isArray(audit.entries) ? audit.entries : [];
  const relevant = alle.filter((e) => GEWICHTE[String(e?.action || "")]);

  const nachAktion = new Map();
  for (const e of relevant) {
    const aktion = String(e.action);
    const eintrag = nachAktion.get(aktion) || { aktion, gewicht: GEWICHTE[aktion], anzahl: 0, zuletztAm: null };
    eintrag.anzahl += 1;
    if (!eintrag.zuletztAm || String(e.at) > eintrag.zuletztAm) eintrag.zuletztAm = e.at;
    nachAktion.set(aktion, eintrag);
  }

  const letzte24h = relevant.filter((e) => Date.parse(e.at || "") > jetztMs - TAG_MS);
  return {
    erreichbar: true,
    gesamtImZeitraum: relevant.length,
    davonHoch: relevant.filter((e) => GEWICHTE[String(e.action)] === "hoch").length,
    letzte24Stunden: letzte24h.length,
    nachAktion: [...nachAktion.values()].sort(nachGewicht),
    // Nur Kopfdaten je Ereignis: wer, was, woran. Der Grund steht im Audit-Log
    // selbst — dort gehoert er hin, dort ist er gegen Aenderung gesichert.
    letzte: relevant.slice(0, 20).map((e) => ({
      am: e.at,
      aktion: e.action,
      gewicht: GEWICHTE[String(e.action)],
      akteur: e.actor?.email || e.actorEmail || "",
      ziel: String(e.target || "").slice(0, 120)
    }))
  };
}

function kontenLage(index, jetztMs) {
  if (!index?.ok) return { erreichbar: false, grund: index?.error || "unbekannt" };
  const alle = Array.isArray(index.entries) ? index.entries : [];
  const gesperrtAngemeldet = alle.filter((e) => {
    const bis = e.loginLockedUntil ? Date.parse(e.loginLockedUntil) : NaN;
    return Number.isFinite(bis) && bis > jetztMs;
  });
  const blockiert = alle.filter((e) => e.status === "blocked");
  const unbestaetigt = alle.filter((e) => e.emailVerified !== true && e.status === "active");

  return {
    erreichbar: true,
    gesamt: alle.length,
    anmeldungGesperrt: gesperrtAngemeldet.length,
    blockiert: blockiert.length,
    ohneBestaetigteEmail: unbestaetigt.length,
    offeneSitzungen: alle.reduce((summe, e) => summe + Number(e.activeSessions || 0), 0),
    // Namen nur dort, wo tatsaechlich etwas anliegt.
    auffaellige: [...gesperrtAngemeldet, ...blockiert].slice(0, 20).map((e) => ({
      email: e.email,
      status: e.status,
      gesperrtBis: e.loginLockedUntil || null,
      offeneSitzungen: Number(e.activeSessions || 0)
    }))
  };
}

function nachGewicht(a, b) {
  const rang = { hoch: 0, mittel: 1, niedrig: 2 };
  const unterschied = (rang[a.gewicht] ?? 9) - (rang[b.gewicht] ?? 9);
  return unterschied !== 0 ? unterschied : b.anzahl - a.anzahl;
}

async function sicher(aufgabe) {
  try {
    return await aufgabe();
  } catch (error) {
    return { ok: false, error: String(error?.message || "fehler").slice(0, 120) };
  }
}
