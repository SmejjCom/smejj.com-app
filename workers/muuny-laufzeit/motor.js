// muuny Laufzeit — der Motor: EIN llama-server-Prozess, der wach bleibt.
//
// Anders als der Hausmodell-Dienst von smejj wird das Modell NIE im Leerlauf
// entladen (Owner-Auftrag 21.09.2026): jede erste Frage nach dem Entladen kostet
// 15-25 s Ladezeit, und genau in dieser Zeit laufen die Fristen von Browser und
// Router ab. Der Motor startet beim Dienststart, und eine Uhr prueft jede Minute,
// ob er noch antwortet — steht er, wird er neu gestartet.
//
// Der Motor weiss nichts ueber Freigaben. Er startet genau das, was man ihm
// sagt: ein Grundmodell und hoechstens einen Adapter.
import { spawn as spawnStandard } from "node:child_process";

export const ZUSTAND = Object.freeze({ AUS: "aus", STARTET: "startet", BEREIT: "bereit", GESTORBEN: "gestorben" });

/** Die Startargumente — getrennt, damit sie ohne Prozess pruefbar sind. */
export function startArgumente({ modellPfad, adapterPfad = null, hafen, threads = 4, kontext = 4096 }) {
  if (!modellPfad) throw new Error("modellpfad_fehlt");
  const a = ["-m", modellPfad, "--host", "127.0.0.1", "--port", String(hafen), "-c", String(kontext),
    "-t", String(threads), "--no-webui", "--jinja"];
  // Genau EIN Rechenplatz: zwei gleichzeitige Rechnungen sind nicht doppelt so
  // schnell, sondern beide langsam. Die Warteschlange davor haelt den Rest auf.
  a.push("--parallel", "1");
  if (adapterPfad) a.push("--lora", adapterPfad);
  return a;
}

export class WacherMotor {
  constructor({ binaer = "/opt/llama/llama-server", hafen = 8081, threads = 4, kontext = 4096,
    startFristMs = 300_000, spawn = spawnStandard, fetchImpl = fetch, protokoll = console } = {}) {
    Object.assign(this, { binaer, hafen, threads, kontext, startFristMs, spawn, fetchImpl, protokoll });
    this.zustand = ZUSTAND.AUS;
    this.prozess = null;
    this.stand = null; // {modellPfad, adapterPfad, version}
    this.starts = 0;
    this.letzterFehler = null;
  }

  get basisUrl() { return `http://127.0.0.1:${this.hafen}`; }

  bericht() {
    return { zustand: this.zustand, version: this.stand?.version || null, adapter: Boolean(this.stand?.adapterPfad),
      starts: this.starts, letzterFehler: this.letzterFehler };
  }

  /** Startet mit genau diesem Stand. Laeuft schon ein anderer, wird er erst beendet. */
  async starte(stand) {
    await this.stoppe();
    this.zustand = ZUSTAND.STARTET;
    this.stand = stand;
    this.starts += 1;
    const argumente = startArgumente({ modellPfad: stand.modellPfad, adapterPfad: stand.adapterPfad,
      hafen: this.hafen, threads: this.threads, kontext: this.kontext });
    this.prozess = this.spawn(this.binaer, argumente, { stdio: ["ignore", "pipe", "pipe"] });
    this.prozess.on?.("exit", (code) => {
      if (this.prozess && this.zustand !== ZUSTAND.AUS) {
        this.zustand = ZUSTAND.GESTORBEN;
        this.letzterFehler = `prozess_beendet:${code}`;
      }
    });
    const bis = Date.now() + this.startFristMs;
    while (Date.now() < bis) {
      if (this.zustand === ZUSTAND.GESTORBEN) break;
      if (await this.gesund()) { this.zustand = ZUSTAND.BEREIT; this.letzterFehler = null; return true; }
      await new Promise((r) => setTimeout(r, 250));
    }
    this.letzterFehler ||= "startfrist_abgelaufen";
    await this.stoppe();
    this.zustand = ZUSTAND.GESTORBEN;
    return false;
  }

  /** Antwortet llama-server? (Er meldet 503, solange er noch laedt.) */
  async gesund() {
    try {
      const r = await this.fetchImpl(`${this.basisUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return r.status === 200;
    } catch { return false; }
  }

  async stoppe() {
    const p = this.prozess;
    this.prozess = null;
    if (this.zustand !== ZUSTAND.GESTORBEN) this.zustand = ZUSTAND.AUS;
    if (!p) return;
    try { p.kill?.("SIGTERM"); } catch { /* schon weg */ }
    await new Promise((r) => {
      const uhr = setTimeout(() => { try { p.kill?.("SIGKILL"); } catch { /* weg */ } r(); }, 10_000);
      uhr.unref?.();
      p.once?.("exit", () => { clearTimeout(uhr); r(); });
      if (!p.once) { clearTimeout(uhr); r(); }
    });
  }

  /**
   * Wach halten: jede Minute pruefen, und wenn er steht, mit demselben Stand
   * neu starten. Gibt eine Funktion zurueck, die die Uhr anhaelt.
   */
  wachHalten({ intervallMs = 60_000, istBeschaeftigt = () => false, neustart = () => this.starte(this.stand) } = {}) {
    const uhr = setInterval(async () => {
      if (!this.stand || this.zustand === ZUSTAND.STARTET || istBeschaeftigt()) return;
      if (await this.gesund()) return;
      // Der Neustart laeuft ueber den Aufrufer (den Freigabe-Waechter), damit jede
      // Datei VOR der Benutzung erneut per sha256 bewiesen wird.
      this.protokoll.warn?.("[motor] antwortet nicht — Neustart ueber den Freigabe-Waechter");
      await neustart().catch((f) => { this.letzterFehler = String(f?.message || f); });
    }, intervallMs);
    uhr.unref?.();
    return () => clearInterval(uhr);
  }
}
