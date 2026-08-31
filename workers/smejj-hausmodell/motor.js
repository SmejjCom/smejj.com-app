// smejj.com Hausmodell — Lebenszyklus des Rechenmotors (llama.cpp llama-server).
//
// Die Kernregel des Betreibers: NIE ein Modell dauerhaft im RAM ohne
// aktive oder erwartete Anfrage. Deshalb vier Zustaende:
//
//   STOPPED  kein Prozess, 0 MB RAM            <- der Normalzustand
//   LADEND   llama-server startet, mmapt die Datei
//   ACTIVE   eine Anfrage rechnet gerade
//   WARM     Prozess lebt, wartet auf die naechste Anfrage (Standard 5 min)
//
// Nach WARM ohne Anfrage wird der Prozess beendet — der Speicher ist danach
// wirklich weg, nicht nur "frei markiert".
//
// RAM-Spar-Stack (Betreiber-Vorgabe): mmap AN (llama-server macht das von
// sich aus; --no-mmap waere der Fehler), KV-Cache q8_0, ctx 4096,
// OMP_NUM_THREADS=1 gegen den OpenMP-Threadpool, der sonst je Kern Puffer
// anlegt.
import { spawn } from "node:child_process";
import { setTimeout as warte } from "node:timers/promises";

export const ZUSTAENDE = { GESTOPPT: "STOPPED", LADEND: "LOADING", AKTIV: "ACTIVE", WARM: "WARM" };

export class Motor {
  constructor({
    binaer = "/opt/llama/llama-server",
    hafen = 8081,
    leerlaufMs = 5 * 60 * 1000,
    startFristMs = 180_000,
    threads = 2,
    protokoll = console
  } = {}) {
    this.binaer = binaer;
    this.hafen = hafen;
    this.leerlaufMs = leerlaufMs;
    this.startFristMs = startFristMs;
    this.threads = threads;
    this.protokoll = protokoll;

    this.zustand = ZUSTAENDE.GESTOPPT;
    this.prozess = null;
    this.modell = null;
    this.startVersprechen = null;
    this.leerlaufUhr = null;
    this.offeneAnfragen = 0;
    this.letzteNutzung = null;
    this.letzterStartMs = null;
    this.startZaehler = 0;
    this.benutzterKvTyp = null;
    this.letzterFehler = null;
  }

  get basisUrl() {
    return `http://127.0.0.1:${this.hafen}`;
  }

  bericht() {
    return {
      zustand: this.zustand,
      modell: this.modell?.id || null,
      offeneAnfragen: this.offeneAnfragen,
      letzteNutzung: this.letzteNutzung,
      letzterStartMs: this.letzterStartMs,
      kvCache: this.benutzterKvTyp || null,
      startZaehler: this.startZaehler,
      leerlaufMs: this.leerlaufMs,
      letzterFehler: this.letzterFehler
    };
  }

  /**
   * Sorgt dafuer, dass genau `modell` geladen ist. Laeuft ein anderes Modell,
   * wird es zuerst beendet — zwei Modelle gleichzeitig sprengen die 8 GB.
   */
  async sicherstellen(modell, modellPfad) {
    if (this.prozess && this.modell?.id !== modell.id) {
      this.protokoll.log?.(`[motor] Modellwechsel ${this.modell?.id} -> ${modell.id}: alter Prozess wird beendet`);
      await this.stoppen("modellwechsel");
    }
    if (this.startVersprechen) return this.startVersprechen;
    if (this.prozess) return true;

    this.startVersprechen = this.#starten(modell, modellPfad).finally(() => {
      this.startVersprechen = null;
    });
    return this.startVersprechen;
  }

  async #starten(modell, modellPfad) {
    const begonnen = Date.now();
    this.zustand = ZUSTAENDE.LADEND;
    this.modell = modell;
    this.letzterFehler = null;

    // Erst mit dem sparsamen KV-Cache (q8_0), bei Bedarf ohne.
    // Grund: q8_0 hat Blockgroesse 32 und verlangt, dass die Kopfbreite des
    // Modells (n_embd_head_k) durch 32 teilbar ist. Bei BitNet-2B und
    // Qwen3.5-4B ist sie 128 — passt. Ein Modell mit z. B. 48 laesst
    // llama-server dagegen sofort mit "does not divide" sterben (am
    // 2026-09-01 im TUEV genau so gemessen). Ohne diesen Rueckfall waere
    // jedes solche Modell ein stiller Totalausfall der Hausmodell-Spur.
    const kvTypen = modell.kvTyp ? [modell.kvTyp] : ["q8_0", null];
    let letzterStartFehler = null;
    for (const kvTyp of kvTypen) {
      try {
        await this.#startVersuch(modell, modellPfad, kvTyp);
        this.letzterStartMs = Date.now() - begonnen;
        this.startZaehler += 1;
        this.zustand = ZUSTAENDE.WARM;
        this.benutzterKvTyp = kvTyp || "f16 (Standard)";
        this.#leerlaufUhrStellen();
        this.protokoll.log?.(`[motor] ${modell.id} bereit nach ${this.letzterStartMs} ms (KV-Cache ${this.benutzterKvTyp})`);
        return true;
      } catch (fehler) {
        letzterStartFehler = fehler;
        if (kvTyp && kvTypen.length > 1) {
          this.protokoll.warn?.(`[motor] Start mit KV-Cache ${kvTyp} scheiterte (${fehler.message}) — zweiter Versuch ohne KV-Quantisierung`);
        }
      }
    }
    this.letzterFehler = letzterStartFehler?.message || "start_fehlgeschlagen";
    await this.stoppen("startfehler");
    throw letzterStartFehler || new Error("start_fehlgeschlagen");
  }

  async #startVersuch(modell, modellPfad, kvTyp) {
    const argumente = [
      "--model", modellPfad,
      "--host", "127.0.0.1",
      "--port", String(this.hafen),
      "--ctx-size", String(modell.kontext || 4096),
      "--threads", String(this.threads),
      "--threads-batch", String(this.threads),
      // Ein Slot = hoechstens eine Inferenz im Motor. Der Deckel steht
      // zusaetzlich in der Warteschlange; hier ist er hart.
      "--parallel", "1",
      "--no-warmup",
      "--alias", modell.id
    ];
    // KV-Cache in q8_0 statt f16 halbiert den Cache-Speicher bei praktisch
    // gleicher Antwortqualitaet — der wichtigste RAM-Hebel neben mmap.
    if (kvTyp) argumente.push("--cache-type-k", kvTyp, "--cache-type-v", kvTyp);

    this.protokoll.log?.(`[motor] startet ${modell.id} (KV-Cache ${kvTyp || "f16"})`);
    this.prozess = spawn(this.binaer, argumente, {
      env: {
        ...process.env,
        // Ohne diese Bremse legt OpenMP je Kern eigene Puffer an — auf einer
        // 8-GB-Maschine, die sich den Speicher mit dem Bild-Maler teilt, ist
        // das der Unterschied zwischen "laeuft" und OOM-Kill.
        OMP_NUM_THREADS: "1",
        LLAMA_CACHE: "/tmp/llama-cache"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.prozess.stdout.on("data", (d) => this.protokoll.log?.(`[llama] ${String(d).trimEnd().slice(0, 400)}`));
    this.prozess.stderr.on("data", (d) => this.protokoll.log?.(`[llama] ${String(d).trimEnd().slice(0, 400)}`));
    this.prozess.on("exit", (code, signal) => {
      this.protokoll.log?.(`[motor] llama-server beendet (code ${code}, signal ${signal || "-"})`);
      this.prozess = null;
      this.modell = null;
      this.zustand = ZUSTAENDE.GESTOPPT;
    });

    try {
      await this.#warteAufBereit();
    } catch (fehler) {
      // Der gescheiterte Versuch darf keinen Prozess zurueckhalten, sonst
      // belegt eine Leiche den Hafen fuer den zweiten Versuch.
      const leiche = this.prozess;
      this.prozess = null;
      leiche?.kill("SIGKILL");
      throw fehler;
    }
    return true;
  }

  async #warteAufBereit() {
    const frist = Date.now() + this.startFristMs;
    while (Date.now() < frist) {
      if (!this.prozess) throw new Error("llama_server_beendet_beim_start");
      try {
        const antwort = await fetch(`${this.basisUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (antwort.ok) return;
      } catch {
        /* noch nicht oben */
      }
      await warte(500);
    }
    throw new Error(`llama_server_nicht_bereit_nach_${this.startFristMs}ms`);
  }

  /** Meldet den Beginn einer Anfrage: Zustand ACTIVE, Leerlauf-Uhr aus. */
  anfrageBeginnt() {
    this.offeneAnfragen += 1;
    this.zustand = ZUSTAENDE.AKTIV;
    if (this.leerlaufUhr) {
      clearTimeout(this.leerlaufUhr);
      this.leerlaufUhr = null;
    }
  }

  /** Meldet das Ende einer Anfrage: zurueck auf WARM, Leerlauf-Uhr an. */
  anfrageEndet() {
    this.offeneAnfragen = Math.max(0, this.offeneAnfragen - 1);
    this.letzteNutzung = new Date().toISOString();
    if (this.offeneAnfragen === 0 && this.prozess) {
      this.zustand = ZUSTAENDE.WARM;
      this.#leerlaufUhrStellen();
    }
  }

  #leerlaufUhrStellen() {
    if (this.leerlaufUhr) clearTimeout(this.leerlaufUhr);
    this.leerlaufUhr = setTimeout(() => {
      if (this.offeneAnfragen > 0) return;
      this.protokoll.log?.(`[motor] ${this.leerlaufMs / 1000} s Leerlauf — Modell wird entladen (0 MB RAM)`);
      this.stoppen("leerlauf").catch((f) => this.protokoll.error?.(`[motor] Stoppen fehlgeschlagen: ${f.message}`));
    }, this.leerlaufMs);
    // Ein offener Timer darf den Dienst nicht am Beenden hindern.
    this.leerlaufUhr.unref?.();
  }

  /** Beendet den Motor. SIGTERM, nach 10 s SIGKILL. */
  async stoppen(grund = "manuell") {
    if (this.leerlaufUhr) {
      clearTimeout(this.leerlaufUhr);
      this.leerlaufUhr = null;
    }
    const prozess = this.prozess;
    if (!prozess) {
      this.zustand = ZUSTAENDE.GESTOPPT;
      return false;
    }
    this.protokoll.log?.(`[motor] stoppt (${grund})`);
    prozess.kill("SIGTERM");
    for (let i = 0; i < 20 && this.prozess; i += 1) await warte(500);
    if (this.prozess) {
      this.protokoll.warn?.("[motor] reagiert nicht auf SIGTERM — SIGKILL");
      prozess.kill("SIGKILL");
      await warte(1000);
    }
    this.prozess = null;
    this.modell = null;
    this.zustand = ZUSTAENDE.GESTOPPT;
    return true;
  }
}
