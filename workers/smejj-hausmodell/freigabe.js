// smejj.com Hausmodell — freigegebene trainierte Version (Betreiber 17.09.2026,
// Schritt 3 des Lernwegs: "Die neue Version geht nur live, wenn sie besser ist").
//
// Die Trainingsschleife (workers/smejj-lora-loop/lernrunde.js) schreibt nach
// einer Messung, die BESSER war als der bisherige Stand, die Datei
// smejj/hausmodell/aktiver-adapter.json. Dieser Dienst liest sie und laedt den
// Adapter zu smejj 1. Fehlt die Datei, laeuft die nackte Basis — das ist der
// Rueckweg: Datei loeschen heisst zurueck zur Basis, ohne Deploy.
import { adapterOderNichts } from "./katalog.js";

export const FREIGABE_KEY = "smejj/hausmodell/aktiver-adapter.json";

/** Liest die Freigabe. Unvollstaendig oder unlesbar = keine Freigabe. */
export async function leseFreigabe(e2) {
  const roh = await e2.liesJson(FREIGABE_KEY);
  if (!roh || typeof roh.modell !== "string") return null;
  const adapter = adapterOderNichts({ id: roh.modell, adapter: roh.adapter });
  if (!adapter) return null;
  return { modell: roh.modell, version: roh.version || adapter.version || null, adapter: { ...adapter, version: roh.version || adapter.version || null } };
}

/** Das Modell, wie es laufen soll: mit freigegebenem Adapter, sonst unveraendert. */
export function mitFreigabe(modell, freigabe) {
  if (!modell || !freigabe || freigabe.modell !== modell.id) return modell;
  return { ...modell, adapter: freigabe.adapter };
}

/** Hat sich gegenueber dem bisher gelesenen Stand etwas geaendert? */
export function freigabeGeaendert(alt, neu) {
  return (alt?.adapter?.sha256 || null) !== (neu?.adapter?.sha256 || null) || (alt?.modell || null) !== (neu?.modell || null);
}
