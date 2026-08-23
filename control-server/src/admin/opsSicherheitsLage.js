// smejj.com — Modul L, Teil 2: die Sicherheitslage (Design-Vorschlag "Adminbereich",
// Seite "Sicherheit — Sperren, Vier-Augen, Zugaenge", uebernommen 2026-08-23).
//
// Vier Fragen, vier Antworten aus Messung:
//   1. Endpunkte: Was ist ZU? Gezaehlt wird, was geschlossen ist — nicht, was
//      offen ist. Die Endpunkt-Politik endete einmal mit "alles erlaubt", und
//      jede vergessene Route war oeffentlich, ohne dass etwas fehlschlug.
//   2. Sperren: Welche Manifeste stimmen byte-genau im gebauten Abbild?
//   3. Vier-Augen: Was wartet gerade auf eine zweite Person?
//   4. Zugaenge: Welche Geheimnisse sind GESETZT — und wofuer gibt es einen
//      echten Nachweis (Schreibprobe, Herzschlag)? Werte verlassen dieses
//      Modul nie; es steht nur "gesetzt" / "fehlt".
import { ROUTES } from "../../../src/shared/platform.js";
import { istOeffentlicheApi } from "../../../src/shared/controlAccessPolicy.js";
import { listApprovals } from "./approvalStore.js";
import { sperrenImAbbild } from "./opsAuslieferung.js";
import { autopilotUebersicht } from "./opsAutopiloten.js";

/** Alle bekannten API-Pfade der Plattform gegen die Erlaubnisliste. */
export function endpunktLage() {
  const pfade = [];
  const sammle = (o) => {
    for (const v of Object.values(o || {})) {
      if (typeof v === "string" && v.startsWith("/api/")) pfade.push(v);
      else if (v && typeof v === "object") sammle(v);
    }
  };
  sammle(ROUTES.api);
  const eindeutig = [...new Set(pfade)].sort();
  const offen = eindeutig.filter((p) => istOeffentlicheApi(p));
  return {
    politik: "Erlaubnisliste: geschuetzt ist die Voreinstellung, offen nur mit Eintrag und Grund (src/shared/controlAccessPolicy.js).",
    bekannt: eindeutig.length,
    geschlossen: eindeutig.length - offen.length,
    offen: offen.length,
    offeneListe: offen
  };
}

// Geheimnisse, die der Betrieb braucht. Nur NAMEN — nie Werte. "wofuer" ist
// die Laienantwort auf "was geht ohne ihn nicht?".
const ZUGAENGE = Object.freeze([
  { name: "SMEJJ_SESSION_SECRET", wofuer: "Anmeldung — jede Sitzung ist damit unterschrieben", pflicht: true },
  { name: "IDRIVE_E2_ACCESS_KEY", wofuer: "Speicher IDrive e2 (lesen)", pflicht: true },
  { name: "IDRIVE_E2_SECRET_KEY", wofuer: "Speicher IDrive e2 (schreiben)", pflicht: true },
  { name: "SMEJJ_AUTOPILOT_KEYS", wofuer: "Herzschlaege der Autopiloten von aussen (Mac-Jobs)", pflicht: true },
  { name: "STRIPE_SECRET_KEY", wofuer: "Abos und Zahlungen", pflicht: false },
  { name: "STRIPE_WEBHOOK_SECRET", wofuer: "Echtheit der Stripe-Rueckrufe", pflicht: false },
  { name: "ZHIPU_API_KEY", wofuer: "Modell glm-5.2 (Standard-Antworten)", pflicht: false },
  { name: "GROQ_API_KEY", wofuer: "Schnellspur und Sprach-Ohr", pflicht: false },
  { name: "MOONSHOT_API_KEY", wofuer: "Modell Kimi", pflicht: false },
  { name: "SMEJJ_MESS_TOKEN", wofuer: "Messlaeufe (Qualitaets-Pruefer)", pflicht: false },
  { name: "SMEJJ_EVOLUTION_TOKEN", wofuer: "Meldeweg der AI Evolution Engine", pflicht: false },
  { name: "SMEJJ_MAUS_ENGINE_TOKEN", wofuer: "Maus-Engine (Browser-Automat)", pflicht: false }
]);

function zugangsLage(env, autopiloten) {
  const ap = (id) => (autopiloten || []).find((a) => a.id === id) || null;
  const nachweis = ap("nachweis-kette");
  const laeufer = ap("autopilot-laeufer");
  return ZUGAENGE.map((z) => {
    const wert = String(env[z.name] || "").trim();
    const gesetzt = wert.length > 0;
    let beleg = null;
    if (z.name === "IDRIVE_E2_SECRET_KEY" && nachweis) {
      beleg = nachweis.ampel === "gruen"
        ? "Schreibprobe erfolgreich " + (nachweis.letzterLauf ? nachweis.letzterLauf.am : "")
        : nachweis.ampel === "rot" ? "Schreibprobe FEHLGESCHLAGEN — " + (nachweis.ampelGrund || "") : "Schreibprobe: " + nachweis.ampel;
    }
    if (z.name === "SMEJJ_AUTOPILOT_KEYS" && gesetzt) {
      beleg = wert.split(",").filter((t) => t.includes(":")).length + " Kennungen hinterlegt";
    }
    if (z.name === "SMEJJ_SESSION_SECRET" && gesetzt && laeufer) {
      beleg = "Admin-Sitzungen laufen (diese Seite ist damit geoeffnet)";
    }
    return {
      name: z.name, wofuer: z.wofuer, pflicht: z.pflicht,
      zustand: gesetzt ? "gesetzt" : (z.pflicht ? "fehlt-pflicht" : "fehlt"),
      beleg
    };
  });
}

function vierAugen(approvals, jetztMs) {
  const offen = (approvals || []).filter((a) => a.status === "pending");
  return {
    offen: offen.length,
    gesamt: (approvals || []).length,
    liste: offen.slice(0, 20).map((a) => ({
      id: a.id, aktion: a.action, ziel: a.target, grund: a.reason,
      angefragtVon: a.requestedBy, angefragtAm: a.requestedAt, laeuftAbAm: a.expiresAt,
      wartetSeitMin: Math.max(0, Math.round((jetztMs - Date.parse(a.requestedAt)) / 60000))
    }))
  };
}

export async function sicherheitsLage({ env = process.env, jetztMs = Date.now(), fetchImpl = fetch, wurzel = process.cwd(), leseFreigaben = listApprovals } = {}) {
  let freigaben = { ok: false, approvals: [] };
  try { freigaben = await leseFreigaben({ env, fetchImpl, nowMs: jetztMs }); } catch (fehler) { freigaben = { ok: false, approvals: [], error: String(fehler?.message || fehler).slice(0, 100) }; }
  const autopiloten = autopilotUebersicht({ jetztMs }).autopiloten;
  const sperren = sperrenImAbbild({ wurzel });
  const zugaenge = zugangsLage(env, autopiloten);
  return {
    ok: true,
    gemessenAm: new Date(jetztMs).toISOString(),
    endpunkte: endpunktLage(),
    sperren,
    sperrenStimmen: sperren.filter((s) => s.zustand === "stimmt").length,
    sperrenVeraendert: sperren.filter((s) => s.zustand === "veraendert").length,
    vierAugen: { ...vierAugen(freigaben.approvals, jetztMs), erreichbar: freigaben.ok !== false, grund: freigaben.error || null },
    zugaenge,
    zugaengeGesetzt: zugaenge.filter((z) => z.zustand === "gesetzt").length,
    pflichtFehlt: zugaenge.filter((z) => z.zustand === "fehlt-pflicht").map((z) => z.name),
    nichtMessbar: [
      { name: "Erreichbares CVE-Risiko", satz: "npm run check:cve misst lokal gegen den Lockfile und trennt Ausgeliefertes von totem Holz; im Abbild gibt es den Pruefer nicht." },
      { name: "Zuletzt benutzt", satz: "Wann ein Schluessel zuletzt benutzt wurde, wird nicht protokolliert — hier steht nur, ob er gesetzt ist und ob ein Nachweis vorliegt." }
    ]
  };
}
