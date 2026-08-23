// smejj.com — Sync-Waechter (Autopilot Nr. 43)
//
// Prueft rund um die Uhr die Kette, die vom 15. bis 23.08.2026 unbemerkt
// gerissen war: der Server stempelte jede Chat-Datei mit SEINER Kontokennung
// (SHA-256), der Client verglich mit seiner Sitzungs-ID — jeder Chat vom Server
// galt als fremd, der Geraete-Sync war tot, und keine Ampel sah es.
//
// Drei Messungen, alle gegen die LIVE-Welt, keine Attrappe:
//  1. Eigene API mit einem 60-s-Token fuer einen SYNTHETISCHEN Nutzer (leerer
//     Ordner, beruehrt keine echten Daten): die Antwort muss `konto` nennen,
//     und zwar genau kontoKennung() dieses Nutzers.
//  2. Ausgeliefertes chat-sync.js auf smejj.com merkt sich `konto`.
//  3. Ausgeliefertes chat-owner.js auf smejj.com kennt den Alias (kontoAliase).
// Quelle und Artefakt koennen auseinanderlaufen (Memory "Artefakt ersetzt nie
// die Quelle") — deshalb werden die DATEIEN GEPRUEFT, DIE DER BROWSER LAEDT.
import { issueSessionToken } from "../auth/sessionToken.js";
import { kontoKennung } from "../chats/chatSyncStore.js";

const PROBE = { userId: "sync-waechter", email: "sync-waechter@smejj.invalid", method: "local-e2e" };

/** Reine Bewertung (testbar): Antwort, erwartetes Konto, die zwei Client-Dateien. */
export function bewerteSyncAlias({ status, antwort, erwartetesKonto, chatSyncQuelle, chatOwnerQuelle }) {
  const fehler = [];
  if (status !== 200) fehler.push(`eigene API antwortete HTTP ${status}`);
  else {
    const konto = String(antwort?.konto || "");
    if (!konto) fehler.push("Antwort nennt kein `konto` — alter Server-Stand, Client kann Server-Chats nicht zuordnen");
    else if (konto !== erwartetesKonto) fehler.push("`konto` passt nicht zu kontoKennung() — Stempel und Antwort gehen auseinander");
    for (const c of antwort?.chats || []) if (c?.ownerId && c.ownerId !== konto) { fehler.push(`Eintrag ${c.id} traegt fremden Besitzer`); break; }
  }
  if (!/merkeKontoKennung\(localStorage, nutzer, daten\.konto\)/.test(String(chatSyncQuelle || ""))) fehler.push("ausgeliefertes chat-sync.js merkt `konto` nicht (alte Fassung live)");
  if (!/export function kontoAliase/.test(String(chatOwnerQuelle || ""))) fehler.push("ausgeliefertes chat-owner.js kennt keinen Alias (alte Fassung live)");
  return { ok: fehler.length === 0, fehler };
}

export async function laufSyncAlias({ env = process.env, fetchImpl = fetch } = {}) {
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) return { ok: false, meldung: "SMEJJ_SESSION_SECRET fehlt — Sync-Kette nicht pruefbar" };
  const eigene = String(env.SMEJJ_CONTROL_SELF_URL || "https://smejj-control.zeabur.app").replace(/\/+$/, "");
  const seite = String(env.SMEJJ_SITE_ORIGIN || "https://smejj.com").replace(/\/+$/, "");
  const start = Date.now();
  try {
    const token = issueSessionToken({ secret, user: PROBE, ttlMs: 60_000 });
    const kopf = { Authorization: `Bearer ${token}`, Origin: seite };
    const [api, sync, owner] = await Promise.all([
      fetchImpl(`${eigene}/api/chats?nurAbgleich=1`, { headers: kopf, signal: AbortSignal.timeout(15_000) }),
      fetchImpl(`${seite}/assets/chat-sync.js`, { signal: AbortSignal.timeout(15_000) }),
      fetchImpl(`${seite}/assets/chat-owner.js`, { signal: AbortSignal.timeout(15_000) })
    ]);
    let antwort = null;
    try { antwort = await api.json(); } catch { antwort = null; }
    const bewertung = bewerteSyncAlias({
      status: api.status, antwort, erwartetesKonto: kontoKennung(PROBE),
      chatSyncQuelle: sync.ok ? await sync.text() : "", chatOwnerQuelle: owner.ok ? await owner.text() : ""
    });
    const ms = Date.now() - start;
    if (!bewertung.ok) return { ok: false, meldung: `Sync-Kette gerissen: ${bewertung.fehler[0]} (${bewertung.fehler.length} Befund(e), ${ms} ms)` };
    return { ok: true, meldung: `Server nennt \`konto\`, Client (live auf ${seite.replace(/^https?:\/\//, "")}) fuehrt es als Alias — Server-Chats kommen an (${ms} ms)` };
  } catch (fehler) {
    return { ok: false, meldung: `Sync-Kette nicht pruefbar: ${String(fehler?.name === "TimeoutError" ? "Zeitlimit 15 s" : fehler?.message || fehler).slice(0, 90)}` };
  }
}
