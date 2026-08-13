// smejj.com — Kundensupport Stufe 1: Tickets mit KI-Sofortantwort.
//
// WARUM (Betreiber-Auftrag 2026-08-13): Bis heute gab es KEINEN Weg, auf dem
// ein Kunde smejj erreichen konnte — kein Formular mit Empfaenger, kein
// Posteingang. Die Admin-Ansicht D war ein Werkzeug ohne Zulauf. Stufe 1
// schafft den Kanal und die Sofortantwort; die Leitplanken-Aktionen (Stufe 2)
// und das Nachfassen (Stufe 3) bauen darauf auf.
//
// GRUNDSAETZE:
//   - Die KI-Antwort kommt in Sekunden und ist EHRLICH gekennzeichnet
//     ("automatische Antwort"). Sie nutzt denselben Weg wie der Chat der App
//     (Bruecke, /api/agent, RAG ueber das Projektwissen) — kein zweites Hirn.
//   - Scheitert die Sofortantwort, bleibt das Ticket OFFEN und die SLA-Ampel
//     (Nr. 35) faerbt sich — ein unbeantworteter Kunde ist ein Ausfall,
//     kein Schoenheitsfehler.
//   - Jede Aenderung landet im Verlauf des Tickets. Nichts verschwindet.
import crypto from "node:crypto";
import { createRecordStore } from "./recordStore.js";
import { issueSessionToken } from "../auth/sessionToken.js";
import { sseZuText } from "../autopilots/modellEinkaeufer.js";

const ablage = createRecordStore("support/tickets", { maximal: 500 });
const BRUECKE_STANDARD = "https://smejj-chat-bridge.zeabur.app";
const BETREFF_MAX = 140;
const TEXT_MAX = 4000;

/** Der Auftrag an die KI: helfen, ehrlich bleiben, nichts versprechen. */
function sofortantwortAuftrag(betreff, text) {
  return "Du bist der Kundensupport von smejj.com. Ein angemeldeter Kunde meldet ein Problem. "
    + "Antworte auf Deutsch, kurz und konkret, mit Schritten zum Ausprobieren. "
    + "Wenn du die Loesung nicht sicher weisst, sage das ehrlich und sage, dass ein Mensch uebernimmt. "
    + "Versprich NIE Erstattungen, Loeschungen oder Fristen — das entscheidet der Betreiber. "
    + `\n\nBetreff: ${betreff}\nMeldung des Kunden: ${text}`;
}

/** Holt die KI-Sofortantwort ueber den echten Nutzerweg. Wirft nie. */
export async function holeSofortantwort(betreff, text, { env = process.env, fetchImpl = fetch } = {}) {
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) return { ok: false, grund: "kein Sitzungsgeheimnis — Sofortantwort nicht moeglich" };
  try {
    const token = issueSessionToken({
      secret,
      user: { userId: "support-automatik", email: "support@smejj.invalid", method: "local-e2e" },
      ttlMs: 5 * 60 * 1000
    });
    const basis = String(env.SMEJJ_BRUECKE_URL || BRUECKE_STANDARD).replace(/\/+$/, "");
    const antwort = await fetchImpl(`${basis}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task: sofortantwortAuftrag(betreff, text) }),
      signal: AbortSignal.timeout(45_000)
    });
    if (!antwort.ok) return { ok: false, grund: `Bruecke HTTP ${antwort.status}` };
    const inhalt = sseZuText(await antwort.text()).trim();
    if (inhalt.length < 20) return { ok: false, grund: "leere Antwort der Bruecke" };
    return { ok: true, text: inhalt };
  } catch (fehler) {
    return { ok: false, grund: fehler?.name === "TimeoutError" ? "Zeitlimit 45 s" : String(fehler?.message || fehler).slice(0, 80) };
  }
}

/**
 * Nimmt ein Ticket an und beantwortet es sofort. Das Ticket wird IMMER
 * gespeichert — auch wenn die Sofortantwort scheitert; dann bleibt der
 * Status "offen" und die SLA-Ampel uebernimmt.
 */
export async function erstelleTicket({ email, betreff, text, env = process.env, sofortantwort = holeSofortantwort } = {}) {
  const wer = String(email || "").toLowerCase().trim();
  const titel = String(betreff || "").trim().slice(0, BETREFF_MAX);
  const inhalt = String(text || "").trim().slice(0, TEXT_MAX);
  if (!wer) return { ok: false, error: "support_email_missing" };
  if (!titel || inhalt.length < 5) return { ok: false, error: "support_text_missing" };

  const jetzt = new Date().toISOString();
  const ticket = {
    id: `T-${jetzt.slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`,
    email: wer,
    betreff: titel,
    status: "offen",
    erstelltAm: jetzt,
    beantwortetAm: null,
    verlauf: [{ von: "kunde", am: jetzt, text: inhalt }]
  };

  const auto = await sofortantwort(titel, inhalt, { env });
  if (auto.ok) {
    ticket.verlauf.push({
      von: "automatik",
      am: new Date().toISOString(),
      text: auto.text,
      hinweis: "Automatische Antwort der smejj-KI. Ein Mensch liest mit — antworte einfach, wenn das Problem bleibt."
    });
    ticket.status = "beantwortet";
    ticket.beantwortetAm = ticket.verlauf[1].am;
  } else {
    ticket.verlauf.push({ von: "system", am: new Date().toISOString(), text: `Sofortantwort nicht moeglich: ${auto.grund}. Ein Mensch uebernimmt.` });
  }

  const geschrieben = await ablage.schreib(ticket, { env, timeoutMs: 20_000 }).then(() => true).catch(() => false);
  return { ok: true, ticket, gespeichert: geschrieben };
}

/** Alle Tickets (Admin) bzw. nur die eigenen (Kunde). Juengste zuerst. */
export async function listeTickets({ env = process.env, email = null } = {}) {
  // liste() liefert {ok, datensaetze, total} — nicht das Array selbst.
  const antwort = await ablage.liste({ env }).catch(() => null);
  const gefiltert = (antwort?.datensaetze || [])
    .filter((t) => t && t.id && (!email || t.email === String(email).toLowerCase().trim()))
    .sort((a, b) => String(b.erstelltAm).localeCompare(String(a.erstelltAm)));
  return gefiltert;
}

/**
 * Fuer die SLA-Ampel (Nr. 35): Tickets, die laenger als `minuten` ohne
 * Antwort offen stehen. Ein unbeantworteter Kunde ist ein Ausfall.
 */
export async function offeneUeberfaellig({ env = process.env, minuten = 15, jetztMs = Date.now() } = {}) {
  const alle = await listeTickets({ env });
  return alle.filter((t) => t.status === "offen"
    && jetztMs - Date.parse(t.erstelltAm) > minuten * 60 * 1000);
}
