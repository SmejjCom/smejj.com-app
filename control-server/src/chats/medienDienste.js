// smejj.com — EIN Satz Medien-Dienste je Prozess.
//
// Teilen-Links und Aufraeumer halten Zustand (Haltespeicher, Warteschlangen,
// entprellte Laeufe). Zwei Routen-Dateien brauchen sie — die Medien-Routen und
// die Chat-Loeschung. Legte jede ihre eigene Instanz an, wuerde ein Widerruf
// auf der einen den Haltespeicher der anderen nicht leeren. Tests reichen ihre
// eigene Instanz ueber `dienste` an die Routen.
import { createMedienAufraeumer } from "./medienAufraeumen.js";
import { createMedienTeilen } from "./medienTeilen.js";

let geteilt = null;

export function holeMedienDienste({ env = process.env, fetchImpl = fetch } = {}) {
  if (geteilt) return geteilt;
  const teilen = createMedienTeilen({ env, fetchImpl });
  const aufraeumer = createMedienAufraeumer({
    env,
    fetchImpl,
    teilen,
    protokoll: (eintrag) => {
      if (eintrag.geloescht || !eintrag.ok) console.log(`[medien] ${JSON.stringify(eintrag)}`);
    }
  });
  geteilt = { teilen, aufraeumer };
  return geteilt;
}
