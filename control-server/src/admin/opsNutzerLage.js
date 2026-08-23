// smejj.com — Modul B, Teil 2: die Nutzer-Lage (Design-Vorschlag "Adminbereich",
// Seite "Nutzer — und die Zeile, die euch mal Stunden gekostet hat", 2026-08-23).
//
// Aus der eigenen Geschichte: Ein Abo war unsichtbar, weil unter einer anderen
// Adresse bezahlt wurde als angemeldet (7shahnazaryan@… gegen smejjcom@…).
// Deshalb steht "bezahlt als" hier als EIGENE SPALTE — nicht versteckt in
// einem Detailfenster. Und: Konten, zu denen ein Abo nicht passt, stehen als
// eigene Liste oben, mit der zahlenden Adresse, damit klar ist, WEN man
// anschreibt.
//
// Ehrlichkeitsregeln:
//   - Der Nutzer-Index wird nur gelesen (readUserIndexFresh frischt im
//     Hintergrund auf). Fehlt er, kommt 409 mit Bauhinweis — wie bisher.
//   - Verbrauch stammt aus dem Token-Messer im Arbeitsspeicher: er zaehlt SEIT
//     DEM LETZTEN NEUSTART, und genau so steht es dran.
//   - Nie in Gespraeche schauen: hier gibt es nur Kopfdaten.
import { readUserIndexFresh, selectFromIndex } from "./userIndex.js";
import { abrechnungUebersicht } from "./opsAbrechnung.js";
import { bericht as verbrauchsBericht } from "../llm/tokenMesser.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";

const TAG_MS = 24 * 60 * 60 * 1000;

function klein(s) {
  return String(s || "").trim().toLowerCase();
}

/** Abos je Konto-Adresse; nicht zuordenbare getrennt. */
function aboKarte(abrechnung) {
  const jeKonto = new Map();
  const ohneKonto = [];
  for (const abo of abrechnung?.abos || []) {
    if (abo.konto) jeKonto.set(klein(abo.konto), abo);
    else ohneKonto.push(abo);
  }
  return { jeKonto, ohneKonto };
}

function verbrauchKarte(bericht) {
  const karte = new Map();
  for (const n of bericht?.topNutzer || []) karte.set(String(n.nutzer), n);
  return karte;
}

function bezahltAls(eintrag, abo) {
  if (!abo) return null;
  const zahlend = klein(abo.paidEmail || abo.zahlendeAdresse || "");
  if (!zahlend) return "unbekannt";
  return zahlend === klein(eintrag.email) ? "dieselbe" : zahlend;
}

export async function nutzerLage({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  query = "",
  limit = 50,
  offset = 0,
  leseIndex = readUserIndexFresh,
  leseAbrechnung = abrechnungUebersicht,
  leseVerbrauch = verbrauchsBericht
} = {}) {
  const index = await leseIndex({ env, fetchImpl });
  if (!index?.ok) return { ok: false, error: index?.error || "user_index_missing", hint: "POST /api/admin/users/index/rebuild" };

  let abrechnung = { ok: false, abos: [] };
  try { abrechnung = await leseAbrechnung({ env, fetchImpl, jetztMs }); } catch (fehler) { abrechnung = { ok: false, abos: [], error: String(fehler?.message || fehler).slice(0, 100) }; }
  const { jeKonto, ohneKonto } = aboKarte(abrechnung);
  let verbrauch = new Map();
  try { verbrauch = verbrauchKarte(leseVerbrauch({})); } catch { verbrauch = new Map(); }

  const alle = index.entries || [];
  const heuteAb = jetztMs - TAG_MS;
  const wocheAb = jetztMs - 7 * TAG_MS;
  const seite = selectFromIndex(alle, { query, offset, limit });

  const eintraege = (seite.entries || []).map((n) => {
    const abo = jeKonto.get(klein(n.email)) || null;
    // Der Token-Messer kennt nur die Einweg-Kennung (authenticatedUserId) — nie die Adresse.
    const v = verbrauch.get(authenticatedUserId({ userId: n.userId })) || null;
    return {
      userId: n.userId, email: n.email, name: n.name || "", method: n.method || "email",
      role: n.role, status: n.status, emailVerified: n.emailVerified === true,
      activeSessions: n.activeSessions || 0, createdAt: n.createdAt, lastSeenAt: n.lastSeenAt || null,
      // Nur E-Mail-Anmeldungen hinterlassen Sitzungen im Datensatz. Google/GitHub/
      // Passkey-Sitzungen sind reine Token (sessionRegistry kennt nur die sid) —
      // "zuletzt" ist dort NICHT messbar, und genau das steht in der Spalte.
      zuletztMessbar: String(n.method || "email") === "email",
      plan: abo ? (abo.plan || "—") : "Frei",
      aboZustand: abo ? abo.zustand : null,
      aboKlartext: abo ? abo.klartext : null,
      bezahltAls: bezahltAls(n, abo),
      verbrauch: v ? { anfragen: v.anfragen || 0, kostenUsd: v.kostenUsd ?? null } : null
    };
  });

  const zweiAdressen = (abrechnung.abos || []).filter((a) => {
    const zahlend = klein(a.paidEmail || a.zahlendeAdresse || "");
    return zahlend && a.konto && zahlend !== klein(a.konto);
  }).length;

  return {
    ok: true,
    gemessenAm: new Date(jetztMs).toISOString(),
    index: {
      builtAt: index.builtAt, ageSeconds: index.ageSeconds, count: index.count,
      unreadable: index.unreadable, refreshing: index.refreshing === true, truncated: index.truncated,
      // Ob "Zuletzt" ueberhaupt befuellt sein kann: das Feld kam am 2026-08-23
      // dazu — ein Index von davor traegt es nicht, bis er neu gebaut wird.
      kenntZuletzt: alle.some((n) => n.lastSeenAt),
      zuletztMessbarKonten: alle.filter((n) => String(n.method || "email") === "email").length
    },
    konten: {
      gesamt: alle.length,
      neuDieseWoche: alle.filter((n) => Date.parse(n.createdAt || 0) >= wocheAb).length,
      heuteAktiv: alle.filter((n) => Date.parse(n.lastSeenAt || 0) >= heuteAb).length,
      verifiziert: alle.filter((n) => n.emailVerified).length,
      gesperrt: alle.filter((n) => n.status !== "active").length
    },
    abos: {
      erreichbar: abrechnung.ok !== false,
      grund: abrechnung.error || null,
      zahlend: abrechnung.zahlend || 0,
      zweiAdressen,
      nichtZugeordnet: ohneKonto.length,
      nichtZugeordnetListe: ohneKonto.slice(0, 10).map((a) => ({
        kundenId: a.kundenId, plan: a.plan, zustand: a.zustand, klartext: a.klartext,
        zahlendeAdresse: a.paidEmail || a.zahlendeAdresse || null, naechsterSchritt: a.naechsterSchritt || null
      }))
    },
    verbrauchHinweis: "Verbrauch zaehlt seit dem letzten Neustart des Control-Servers (Token-Messer im Arbeitsspeicher).",
    total: seite.total, offset: seite.offset, limit: seite.limit,
    eintraege
  };
}
