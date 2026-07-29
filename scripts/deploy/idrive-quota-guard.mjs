#!/usr/bin/env node
// smejj.com — Sperre vor grossen Uploads auf IDrive e2.
//
// IDrive e2 blockiert nicht, wenn das Kontingent voll ist: es nimmt weiter an
// und rechnet 0,006 USD je GB und Monat ab. Ein Modell-Upload kann das Paket
// reissen, ohne dass irgendwo etwas aufleuchtet. Genau davor sitzt diese Sperre.
//
// Sie ist fail-closed wie das Budget-Gate: Kann die Belegung nicht gemessen
// werden, wird NICHT hochgeladen. Lieber ein Upload, der nicht startet, als
// eine Rechnung, die niemand kommen sah.
//
// Aufruf als Bibliothek:
//   import { pruefeKontingent } from "./idrive-quota-guard.mjs";
//   await pruefeKontingent({ zusaetzlicheBytes: gesamtgroesse });
//
// Aufruf auf der Kommandozeile (Bytes optional):
//   node scripts/deploy/idrive-quota-guard.mjs 734003200
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import {
  bewerte, grenzeProzent, kontingentUebersicht, planBytes
} from "../../control-server/src/admin/opsKontingent.js";

const GIB = 1024 ** 3;

/**
 * @returns {Promise<{ok: boolean, grund?: string, lage: object}>}
 *   ok=false heisst: nicht hochladen.
 */
export async function pruefeKontingent({
  zusaetzlicheBytes = 0,
  env = process.env,
  fetchImpl = fetch,
  lageLesen = kontingentUebersicht
} = {}) {
  const lage = await lageLesen({ env, fetchImpl, frisch: true });
  if (!lage?.ok) {
    // Fail-closed: ohne Messung keine Freigabe.
    return { ok: false, grund: `Belegung nicht messbar (${lage?.error || "unbekannt"})`, lage: lage || {} };
  }

  const grenze = grenzeProzent(env);
  const nachher = bewerte({
    bytesGesamt: lage.bytesGesamt,
    paketBytes: planBytes(env),
    geplantBytes: zusaetzlicheBytes
  });

  if (nachher.auslastungProzent > grenze) {
    return {
      ok: false,
      grund: `Nach dem Upload waeren ${nachher.auslastungProzent} % des Pakets belegt `
        + `(Grenze ${grenze} %). Ueberschreitung kostet ${nachher.mehrkostenUsdProMonat ?? 0} USD/Monat.`,
      lage: { ...lage, nachher }
    };
  }

  // Eine unvollstaendige Messung ist ein Mindestwert. Dicht an der Grenze darf
  // ein Mindestwert nicht durchwinken.
  if (!lage.vollstaendig && nachher.auslastungProzent > grenze - 10) {
    return {
      ok: false,
      grund: `Die Belegung ist nur ein Mindestwert (${lage.hinweis}) und liegt mit `
        + `${nachher.auslastungProzent} % nahe an der Grenze von ${grenze} %.`,
      lage: { ...lage, nachher }
    };
  }

  return { ok: true, lage: { ...lage, nachher } };
}

/** Kurzfassung fuer die Ausgabe im Terminal. */
export function alsText(ergebnis) {
  const n = ergebnis?.lage?.nachher;
  if (!n) return ergebnis?.grund || "keine Lage ermittelt";
  return `Belegt ${(n.bytesGesamt / GIB).toFixed(1)} GiB von ${(n.paketBytes / GIB).toFixed(0)} GiB`
    + ` — nach dem Vorhaben ${n.auslastungProzent} % (${n.ampel})`;
}

const direktAufgerufen = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (direktAufgerufen) {
  loadSecureLocalEnv();
  const zusaetzlicheBytes = Number(process.argv[2] || 0);
  const ergebnis = await pruefeKontingent({ zusaetzlicheBytes });
  console.log(alsText(ergebnis));
  if (!ergebnis.ok) {
    console.error(`\nSPERRE: ${ergebnis.grund}`);
    console.error("Kein Upload. Entweder aufraeumen, Paket vergroessern (Freigabe noetig) "
      + "oder SMEJJ_IDRIVE_GRENZE_PROZENT bewusst anheben.");
    process.exit(1);
  }
  console.log("Freigabe: der Upload bleibt innerhalb des Pakets.");
}
