// muuny Laufzeit — der Freigabe-Waechter: welcher Adapter laeuft, und wann wird gewechselt.
//
// Der Autopilot schreibt muuny/freigabe.json, wenn eine Version messbar besser ist.
// Dieser Waechter liest sie beim Start und alle 10 Minuten:
//
//   Datei fehlt (geloescht)         -> zurueck auf das Grundmodell. Das ist der
//                                      Rueckweg ohne Deploy: Datei loeschen genuegt.
//   Datei unvollstaendig/ungueltig  -> IGNORIEREN, beim bisherigen Stand bleiben.
//                                      Ein falscher Adapter ist schlimmer als keiner.
//   Datei nicht lesbar (e2 weg)     -> beim bisherigen Stand bleiben. Ein Lesefehler
//                                      ist KEINE Anweisung, etwas zu aendern.
//   Datei geaendert und gueltig     -> Adapter holen, per sha256 UND Groesse pruefen,
//                                      und erst wechseln, wenn gerade NIEMAND rechnet.
//
// Jede Datei wird vor der Benutzung per sha256 geprueft — auch eine, die schon auf
// der Platte liegt. Der Hausmodell-Dienst von smejj verglich im Zwischenspeicher nur
// die Groesse; eine gleich grosse, aber veraenderte Datei waere unbemerkt geladen worden.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { adapterVollstaendig, pruefeFreigabe } from "../muuny-autopilot/entscheidung.js";

export const GRUNDMODELL = "muuny-grundmodell";
export const PRUEF_INTERVALL_MS = 10 * 60_000;

export async function sha256Datei(pfad) {
  const h = createHash("sha256");
  await pipeline(createReadStream(pfad), h);
  return h.digest("hex");
}

export class FreigabeWaechter {
  /**
   * @param e2              {liesJson(key), ladeInDatei(key, pfad) -> {bytes, sha256}}
   * @param freigabeSchluessel  z. B. "muuny/freigabe.json"
   * @param grundmodellSchluessel  z. B. "muuny/grundmodell/gguf.json" — Beschreibung der Grundmodell-GGUF
   */
  constructor({ e2, freigabeSchluessel, grundmodellSchluessel, cacheVerzeichnis, motor,
    istBeschaeftigt = () => false, hashDatei = sha256Datei, protokoll = console }) {
    Object.assign(this, { e2, freigabeSchluessel, grundmodellSchluessel, cacheVerzeichnis, motor, istBeschaeftigt, hashDatei, protokoll });
    this.aktuell = null;      // {version, modellPfad, adapterPfad, adapterSha256}
    this.ausstehend = null;   // derselbe Aufbau, wartet auf einen freien Moment
    this.letztePruefung = null;
    this.letzterGrund = null;
  }

  bericht() {
    return { version: this.aktuell?.version || null, adapterSha256: this.aktuell?.adapterSha256 || null,
      ausstehend: this.ausstehend?.version || null, letztePruefung: this.letztePruefung, letzterGrund: this.letzterGrund };
  }

  /** Holt eine beschriebene Datei und beweist sie per Groesse und sha256. Wirft sonst. */
  async bereitstellen({ datei, sha256, sizeBytes, ablageort }) {
    if (!adapterVollstaendig({ datei, sha256, sizeBytes, ablageort })) throw new Error("beschreibung_unvollstaendig");
    await mkdir(this.cacheVerzeichnis, { recursive: true });
    const ziel = path.join(this.cacheVerzeichnis, `${sha256.slice(0, 16)}-${path.basename(datei)}`);
    const vorhanden = await stat(ziel).catch(() => null);
    if (vorhanden) {
      // Auch im Zwischenspeicher: erst beweisen, dann benutzen.
      if (vorhanden.size === sizeBytes && (await this.hashDatei(ziel)) === sha256) return ziel;
      this.protokoll.warn?.(`[freigabe] ${ziel} passt nicht zur Beschreibung — wird neu geholt`);
      await rm(ziel, { force: true });
    }
    const tmp = `${ziel}.laden`;
    await rm(tmp, { force: true });
    const r = await this.e2.ladeInDatei(`${ablageort.replace(/\/+$/, "")}/${datei}`, tmp);
    if (r?.bytes !== sizeBytes || r?.sha256 !== sha256) {
      await rm(tmp, { force: true });
      throw new Error(`pruefung_fehlgeschlagen:${datei}:${r?.bytes}B`);
    }
    await rename(tmp, ziel);
    return ziel;
  }

  /** Liest Freigabe und Grundmodell und bereitet einen Wechsel vor, wenn noetig. */
  async pruefe() {
    this.letztePruefung = new Date().toISOString();
    let grund;
    try { grund = await this.e2.liesJson(this.grundmodellSchluessel); } catch (f) {
      this.letzterGrund = `grundmodell_unlesbar:${String(f?.message || f).slice(0, 80)}`;
      return { geaendert: false, grund: this.letzterGrund };
    }
    if (!grund || !adapterVollstaendig(grund)) {
      this.letzterGrund = "grundmodell_gguf_fehlt";
      return { geaendert: false, grund: this.letzterGrund };
    }

    let freigabe;
    try { freigabe = await this.e2.liesJson(this.freigabeSchluessel); } catch (f) {
      // Nicht lesbar ist nicht geloescht. Nichts aendern.
      this.letzterGrund = `freigabe_unlesbar:${String(f?.message || f).slice(0, 80)}`;
      return { geaendert: false, grund: this.letzterGrund };
    }
    let ziel;
    if (freigabe === null) {
      ziel = { version: GRUNDMODELL, adapter: null };
    } else {
      const p = pruefeFreigabe(freigabe);
      if (!p.gueltig) {
        this.letzterGrund = `freigabe_ignoriert:${p.grund}`;
        return { geaendert: false, grund: this.letzterGrund };
      }
      ziel = { version: freigabe.version, adapter: freigabe.adapter };
    }

    const zielSha = ziel.adapter?.sha256 || null;
    const gleich = (s) => s && s.version === ziel.version && s.adapterSha256 === zielSha && s.grundSha256 === grund.sha256;
    if (gleich(this.aktuell) || gleich(this.ausstehend)) { this.letzterGrund = null; return { geaendert: false }; }

    let modellPfad;
    let adapterPfad = null;
    try {
      modellPfad = await this.bereitstellen(grund);
      if (ziel.adapter) adapterPfad = await this.bereitstellen(ziel.adapter);
    } catch (f) {
      this.letzterGrund = `nicht_bereitgestellt:${String(f?.message || f).slice(0, 120)}`;
      return { geaendert: false, grund: this.letzterGrund };
    }
    this.ausstehend = { version: ziel.version, modellPfad, adapterPfad, adapterSha256: zielSha, grundSha256: grund.sha256 };
    this.letzterGrund = null;
    return this.anwendenWennFrei();
  }

  /**
   * Neustart des laufenden Standes (Motor stand still): jede Datei wird ERNEUT per
   * sha256 bewiesen. Passt eine nicht mehr, wird alles frisch geholt.
   */
  async neustart() {
    const s = this.aktuell;
    if (!s) return this.pruefe();
    const beweise = [[s.modellPfad, s.grundSha256], ...(s.adapterPfad ? [[s.adapterPfad, s.adapterSha256]] : [])];
    for (const [pfad, sha] of beweise) {
      const ist = await this.hashDatei(pfad).catch(() => null);
      if (ist !== sha) {
        this.protokoll.warn?.(`[freigabe] ${pfad} hat sich veraendert — wird frisch geholt`);
        await rm(pfad, { force: true });
        this.aktuell = null;
        return this.pruefe();
      }
    }
    return this.motor.starte(s);
  }

  /** Wechselt nur, wenn gerade niemand rechnet. Sonst beim naechsten freien Moment. */
  async anwendenWennFrei() {
    if (!this.ausstehend) return { geaendert: false };
    if (this.istBeschaeftigt()) return { geaendert: false, wartet: true };
    const stand = this.ausstehend;
    this.ausstehend = null;
    const ok = await this.motor.starte(stand);
    if (ok) {
      this.aktuell = stand;
      this.protokoll.log?.(`[freigabe] laeuft jetzt: ${stand.version}`);
      return { geaendert: true, version: stand.version };
    }
    // Startet der Motor mit dem neuen Adapter nicht, lieber das nackte Grundmodell als nichts.
    this.letzterGrund = `start_fehlgeschlagen:${stand.version}`;
    if (stand.adapterPfad) {
      const nurGrund = { ...stand, version: GRUNDMODELL, adapterPfad: null, adapterSha256: null };
      if (await this.motor.starte(nurGrund)) this.aktuell = nurGrund;
    }
    return { geaendert: false, grund: this.letzterGrund };
  }
}
