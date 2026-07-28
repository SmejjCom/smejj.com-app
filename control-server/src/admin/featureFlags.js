// smejj.com — Feature-Flags (Single Responsibility: Funktionen schalten).
//
// Ein An/Aus soll keinen Deploy und keinen Cache-Bump kosten. Drei Zustaende:
//   off      — aus fuer alle
//   partial  — fuer einen Anteil der Nutzer, stabil zugeordnet
//   on       — an fuer alle
//
// "Stabil zugeordnet" ist der Kern: derselbe Mensch bekommt bei 5 % immer
// dieselbe Antwort. Eine Zufallszahl je Anfrage waere kein Test, sondern
// Flackern — die Oberflaeche wuerde bei jedem Neuladen springen.
//
// Die Zuordnung laeuft ueber einen Hash aus Flag-Name und Konto-ID. Damit ist
// sie ohne Speicher reproduzierbar und ueber alle Server gleich.
import crypto from "node:crypto";
import { createRecordStore, neueKennung } from "./recordStore.js";

const store = createRecordStore("admin/flags", { maximal: 200 });

export const FLAG_STATUS = Object.freeze({ off: "off", partial: "partial", on: "on" });
const NAME_MUSTER = /^[a-z][a-z0-9-]{1,48}$/;

/**
 * Deterministische Zuordnung: gleicher Mensch, gleiches Flag -> gleiche Antwort.
 * Liefert 0..99.
 */
export function bucketFor(flagName, subjectId) {
  const roh = `${String(flagName || "")}:${String(subjectId || "")}`;
  const hash = crypto.createHash("sha256").update(roh).digest();
  return hash.readUInt16BE(0) % 100;
}

/** Ist das Flag fuer diese Person an? Fail-closed: unbekannt = aus. */
export function isEnabledFor(flag, subjectId) {
  if (!flag || flag.status === FLAG_STATUS.off) return false;
  if (flag.status === FLAG_STATUS.on) return true;
  if (flag.status !== FLAG_STATUS.partial) return false;
  const id = String(subjectId || "");
  if (!id) return false;
  // Ausdrueckliche Testkonten sind immer an — sonst koennte man die neue
  // Funktion nicht gezielt pruefen, bevor man sie ausrollt.
  if ((flag.alwaysOn || []).includes(id)) return true;
  const anteil = Math.min(100, Math.max(0, Number(flag.percent) || 0));
  return bucketFor(flag.name, id) < anteil;
}

export function validateFlagInput({ name, status, percent, alwaysOn, description }) {
  const kennung = String(name || "").trim().toLowerCase();
  if (!NAME_MUSTER.test(kennung)) {
    return { ok: false, error: "flag_name_invalid", hinweis: "Kleinbuchstaben, Ziffern, Bindestrich; 2 bis 49 Zeichen." };
  }
  const zustand = String(status || "").trim().toLowerCase();
  if (!Object.values(FLAG_STATUS).includes(zustand)) return { ok: false, error: "flag_status_invalid" };
  const anteil = Number(percent);
  if (zustand === FLAG_STATUS.partial && (!Number.isFinite(anteil) || anteil <= 0 || anteil >= 100)) {
    return { ok: false, error: "flag_percent_invalid", hinweis: "Bei partial muss der Anteil zwischen 1 und 99 liegen." };
  }
  const testkonten = (Array.isArray(alwaysOn) ? alwaysOn : [])
    .map((eintrag) => String(eintrag || "").trim()).filter(Boolean).slice(0, 20);
  return {
    ok: true,
    wert: {
      name: kennung,
      status: zustand,
      percent: zustand === FLAG_STATUS.partial ? Math.round(anteil) : (zustand === FLAG_STATUS.on ? 100 : 0),
      alwaysOn: testkonten,
      description: String(description || "").trim().slice(0, 300)
    }
  };
}

/** Legt ein Flag an oder aendert es. Der Aufrufer prueft Recht und schreibt den Nachweis. */
export async function upsertFlag(eingabe, { actor, env = process.env, nowMs = Date.now() } = {}) {
  const geprueft = validateFlagInput(eingabe || {});
  if (!geprueft.ok) return geprueft;

  const nowIso = new Date(nowMs).toISOString();
  const vorhandene = await store.liste({ env });
  const alt = (vorhandene.datensaetze || []).find((f) => f.name === geprueft.wert.name) || null;

  const datensatz = {
    version: 1,
    id: alt?.id || neueKennung("flag"),
    ...geprueft.wert,
    createdAt: alt?.createdAt || nowIso,
    updatedAt: nowIso,
    updatedBy: String(actor?.email || "").slice(0, 254)
  };
  await store.schreib(datensatz, { env });
  return { ok: true, before: alt ? sicht(alt) : null, after: sicht(datensatz), neu: !alt };
}

export async function listFlags({ env = process.env } = {}) {
  const ergebnis = await store.liste({ env });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, flags: [] };
  return { ok: true, total: ergebnis.total, flags: ergebnis.datensaetze };
}

/** Der oeffentliche Teil: was ein Client wissen muss, ohne die Verwaltung zu sehen. */
export async function resolveFlagsFor(subjectId, { env = process.env } = {}) {
  const ergebnis = await store.liste({ env });
  if (!ergebnis.ok) return { ok: false, error: ergebnis.error, flags: {} };
  const flags = {};
  for (const flag of ergebnis.datensaetze) flags[flag.name] = isEnabledFor(flag, subjectId);
  return { ok: true, flags };
}

function sicht(flag) {
  return { name: flag.name, status: flag.status, percent: flag.percent, testkonten: (flag.alwaysOn || []).length };
}

export function __clearFlagsForTests() { store.__leeren(); }
