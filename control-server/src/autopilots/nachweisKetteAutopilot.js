// smejj.com — Nachweis-Waechter (Autopilot Nr. 41): laesst sich der
// Adminspeicher noch BESCHREIBEN?
//
// BEFUND 2026-08-15, live gefunden: Der Step-up-Dialog meldete
//   "IDrive e2 write failed for admin/audit/…json: 403 AccessDenied".
// Lesen ging weiter — das Audit-Log zeigte seine Eintraege, die Kette galt als
// intakt, `/api/health` meldete `storage: true`, alle 40 Ampeln standen gruen.
// Geschrieben wurde seit dem Umgebungs-Verlust trotzdem nichts mehr. Folgen:
// kein Nachweis, kein Step-up-Code (sein Versand haengt am Audit-Eintrag),
// also KEINE einzige schreibende Adminaktion mehr.
//
// Nachgemessen mit scripts/diagnose/eimer-rechte-probe.mjs: der hinterlegte
// Schluessel darf im Eimer "smejj-app" LESEN, aber nicht SCHREIBEN; im Eimer
// "smejj-model-files" darf er beides.
//
// Warum es diesen Autopiloten braucht: Ein Speicher, den man nur lesen kann,
// sieht von aussen vollstaendig gesund aus. Nur ein echter Schreibversuch
// findet das — und genau den macht dieser Lauf.
//
// NACHTRAG, ehrlich: Der Ausfall vom 15.08. war voruebergehend. Eine
// Parallelsitzung hat waehrenddessen die Zeabur-Umgebung repariert
// ("der Eimer darf NICHT aus env.local kommen"); in diesem Fenster stand der
// falsche Eimer, danach schrieb der Server wieder (Audit-Eintrag 00:34).
// Der Waechter bleibt trotzdem: Dass ein solcher Zustand ueberhaupt eine
// halbe Stunde lang unbemerkt bleiben konnte, ist der eigentliche Befund.
//
// GRENZE, ebenfalls ehrlich: Geschrieben wird nach admin/diagnose, nicht nach
// admin/audit. Eine Probe im Audit-Pfad wuerde vom Leser als Eintrag
// aufgesammelt und damit den Nachweis verfaelschen. Ein Rechteproblem, das
// AUSSCHLIESSLICH admin/audit betraefe, faende dieser Lauf deshalb nicht —
// ein Schluessel- oder Eimerproblem, und das war der reale Fall, sehr wohl.
import { createRecordStore } from "../admin/recordStore.js";

/** Immer dieselbe Kennung: die Probe wird ueberschrieben, nicht angehaeuft. */
export const PROBE_ID = "nachweis-schreibprobe";

/**
 * @param {{ablage?: object, mitNetz?: boolean, env?: object, jetztIso?: string}} [deps]
 * @returns {Promise<{ok: boolean, meldung: string}>}
 */
export async function laufNachweisKette({
  ablage = null, mitNetz = true, env = process.env, jetztIso = new Date().toISOString()
} = {}) {
  // Wie bei laufMedienQualitaet: ohne Netz wird nichts behauptet. Hier ist das
  // besonders heikel — ein Lauf ohne Schreibversuch koennte gruen aussehen,
  // ohne dass je jemand geschrieben haette. Deshalb sagt die Meldung es.
  if (!mitNetz) {
    return { ok: true, meldung: "Netz-Takt abgewartet — der Schreibversuch laeuft im naechsten Durchgang" };
  }

  // Das Audit-Log wird ausdruecklich NICHT angefasst: ein Waechter, der zum
  // Messen Nachweise erzeugt, verfaelscht genau das, was er schuetzen soll.
  const store = ablage || createRecordStore("admin/diagnose");
  try {
    await store.schreib({ id: PROBE_ID, art: "schreibprobe", am: jetztIso }, { env });
  } catch (fehler) {
    const text = String(fehler?.message || fehler);
    const verweigert = /403|AccessDenied/i.test(text);
    return {
      ok: false,
      meldung: verweigert
        ? "Adminspeicher ist NUR LESBAR: der Schluessel darf nicht schreiben (403). "
          + "Kein Nachweis, kein Step-up-Code, keine schreibende Adminaktion."
        : `Adminspeicher nicht beschreibbar: ${text.slice(0, 120)}`
    };
  }
  return { ok: true, meldung: `Nachweiskette beschreibbar: 1 Probeobjekt geschrieben (${jetztIso})` };
}
