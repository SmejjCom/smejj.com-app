// smejj.com Hausmodell — Modell-Depot: e2 ist Kaltlager, die SSD ist Warm-Cache.
//
// Der Weg einer Modelldatei:
//   1. SSD-Cache da und Pruefsumme stimmt  -> sofort benutzen
//   2. in e2 vorhanden                     -> e2 -> SSD (Pruefsumme im Fluss)
//   3. weder noch (Erstbezug)              -> Hugging Face -> SSD -> e2
//
// Fall 3 laeuft ABSICHTLICH auf dem Server, nie ueber den Rechner des
// Betreibers: dessen Anschluss ist der Flaschenhals (Memory-Lehre), und ein
// 2,7-GB-Download durch eine langsame Leitung ist eine Nachtaufgabe.
//
// Der SSD-Cache hat einen Deckel (Standard 20 GB). Ist er erreicht, fliegen
// die am laengsten unbenutzten Dateien raus (LRU) — nie die gerade gebrauchte.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, utimes, rename } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { e2Schluessel, e2ManifestSchluessel, e2PruefsummenSchluessel, baueManifest } from "./katalog.js";

const HF_BASIS = "https://huggingface.co";

export class Depot {
  constructor({ e2, cacheVerzeichnis, deckelBytes = 20 * 1024 ** 3, protokoll = console }) {
    this.e2 = e2;
    this.cacheVerzeichnis = cacheVerzeichnis;
    this.deckelBytes = deckelBytes;
    this.protokoll = protokoll;
    this.laufendeBezuege = new Map();
  }

  pfadVon(modell) {
    return path.join(this.cacheVerzeichnis, modell.id, modell.datei);
  }

  /**
   * Liefert den lokalen Pfad der Modelldatei und holt sie bei Bedarf.
   * Mehrfache Aufrufe fuer dasselbe Modell teilen sich EINEN Bezug — sonst
   * laedt der Dienst bei zwei gleichzeitigen Kaltstarts zweimal.
   */
  async bereitstellen(modell, { beiFortschritt } = {}) {
    if (this.laufendeBezuege.has(modell.id)) return this.laufendeBezuege.get(modell.id);
    const versprechen = this.#bereitstellenIntern(modell, { beiFortschritt }).finally(() => {
      this.laufendeBezuege.delete(modell.id);
    });
    this.laufendeBezuege.set(modell.id, versprechen);
    return versprechen;
  }

  async #bereitstellenIntern(modell, { beiFortschritt }) {
    const ziel = this.pfadVon(modell);
    await mkdir(path.dirname(ziel), { recursive: true });

    const vorhanden = await stat(ziel).catch(() => null);
    if (vorhanden && vorhanden.size === modell.sizeBytes) {
      // Groesse stimmt: als benutzt stempeln (LRU) und nicht neu pruefen.
      // Die volle Pruefsumme lief beim Laden; sie hier bei jedem Start erneut
      // zu rechnen kostet auf 2 Kernen mehrere Sekunden je Gigabyte.
      await utimes(ziel, new Date(), new Date()).catch(() => {});
      return { pfad: ziel, quelle: "ssd-cache", bytes: vorhanden.size };
    }
    if (vorhanden) {
      this.protokoll.warn?.(`[depot] ${modell.id}: Cache-Datei hat falsche Groesse (${vorhanden.size} statt ${modell.sizeBytes}) — wird neu geholt`);
      await rm(ziel, { force: true });
    }

    await this.#platzSchaffen(modell.sizeBytes, modell.id);

    const schluessel = e2Schluessel(modell);
    const inE2 = await this.e2.kopf(schluessel).catch(() => null);
    if (inE2 && inE2.groesse === modell.sizeBytes) {
      const ergebnis = await this.#ausE2(modell, ziel, { beiFortschritt });
      return { pfad: ziel, quelle: "e2", bytes: ergebnis.bytes };
    }

    // Erstbezug: Hugging Face -> SSD -> e2. Damit wandert die Datei EINMAL
    // durch das Netz des Servers und liegt danach dauerhaft im eigenen Lager.
    const ergebnis = await this.#ausHuggingFace(modell, ziel, { beiFortschritt });
    await this.nachE2Spiegeln(modell, ziel);
    return { pfad: ziel, quelle: "huggingface+e2", bytes: ergebnis.bytes };
  }

  async #ausE2(modell, ziel, { beiFortschritt }) {
    const vorlaeufig = `${ziel}.teil`;
    this.protokoll.log?.(`[depot] ${modell.id}: laedt aus e2 (${(modell.sizeBytes / 1e9).toFixed(2)} GB)`);
    const ergebnis = await this.e2.ladeInDatei(e2Schluessel(modell), vorlaeufig, { beiFortschritt });
    if (ergebnis.sha256 !== modell.sha256) {
      await rm(vorlaeufig, { force: true });
      throw new Error(`pruefsumme_falsch_aus_e2: ${modell.id} (${ergebnis.sha256.slice(0, 16)} statt ${modell.sha256.slice(0, 16)})`);
    }
    await rename(vorlaeufig, ziel);
    this.protokoll.log?.(`[depot] ${modell.id}: aus e2 geladen, SHA256 stimmt`);
    return ergebnis;
  }

  async #ausHuggingFace(modell, ziel, { beiFortschritt }) {
    const url = `${HF_BASIS}/${modell.hfRepo}/resolve/main/${modell.hfDatei}?download=true`;
    this.protokoll.log?.(`[depot] ${modell.id}: Erstbezug von Hugging Face (${(modell.sizeBytes / 1e9).toFixed(2)} GB)`);
    const kopfzeilen = {};
    if (process.env.HF_TOKEN) kopfzeilen.Authorization = `Bearer ${process.env.HF_TOKEN}`;
    const antwort = await fetch(url, { headers: kopfzeilen, redirect: "follow" });
    if (!antwort.ok) throw new Error(`hf_download_${antwort.status}: ${modell.hfRepo}/${modell.hfDatei}`);

    const vorlaeufig = `${ziel}.teil`;
    const hasher = createHash("sha256");
    let geladen = 0;
    const quelle = Readable.fromWeb(antwort.body);
    quelle.on("data", (stueck) => {
      hasher.update(stueck);
      geladen += stueck.length;
      if (beiFortschritt) beiFortschritt(geladen, modell.sizeBytes);
    });
    await pipeline(quelle, createWriteStream(vorlaeufig));

    const summe = hasher.digest("hex");
    if (summe !== modell.sha256) {
      await rm(vorlaeufig, { force: true });
      throw new Error(`pruefsumme_falsch_von_hf: ${modell.id} (${summe.slice(0, 16)} statt ${modell.sha256.slice(0, 16)})`);
    }
    await rename(vorlaeufig, ziel);
    this.protokoll.log?.(`[depot] ${modell.id}: von Hugging Face geladen, SHA256 stimmt`);
    return { bytes: geladen, sha256: summe };
  }

  /** Legt Datei, manifest.json und sha256.txt in der e2-Registry ab. */
  async nachE2Spiegeln(modell, quellPfad) {
    const schluessel = e2Schluessel(modell);
    this.protokoll.log?.(`[depot] ${modell.id}: spiegelt nach e2 -> ${schluessel}`);
    await this.e2.ladeDateiHoch(schluessel, quellPfad, { typ: "application/octet-stream" });
    await this.e2.schreibJson(e2ManifestSchluessel(modell), baueManifest(modell));
    await this.e2.schreib(e2PruefsummenSchluessel(modell), `${modell.sha256}  ${modell.datei}\n`, "text/plain; charset=utf-8");
    this.protokoll.log?.(`[depot] ${modell.id}: in e2 abgelegt (Datei + manifest.json + sha256.txt)`);
  }

  /** Was liegt gerade im SSD-Cache? */
  async cacheStand() {
    const dateien = await this.#cacheDateien();
    const bytes = dateien.reduce((summe, d) => summe + d.bytes, 0);
    return {
      dateien: dateien.map((d) => ({ pfad: path.relative(this.cacheVerzeichnis, d.pfad), bytes: d.bytes, zuletzt: d.zuletzt })),
      bytesGesamt: bytes,
      deckelBytes: this.deckelBytes,
      freiBytes: Math.max(0, this.deckelBytes - bytes)
    };
  }

  async #cacheDateien() {
    const treffer = [];
    const gehe = async (verzeichnis) => {
      const eintraege = await readdir(verzeichnis, { withFileTypes: true }).catch(() => []);
      for (const eintrag of eintraege) {
        const voll = path.join(verzeichnis, eintrag.name);
        if (eintrag.isDirectory()) await gehe(voll);
        else if (eintrag.isFile() && !eintrag.name.endsWith(".teil")) {
          const werte = await stat(voll).catch(() => null);
          if (werte) treffer.push({ pfad: voll, bytes: werte.size, zuletzt: werte.atimeMs });
        }
      }
    };
    await gehe(this.cacheVerzeichnis);
    return treffer;
  }

  /** LRU: raeumt so lange auf, bis `brauchtBytes` unter den Deckel passen. */
  async #platzSchaffen(brauchtBytes, schonenId) {
    const dateien = (await this.#cacheDateien()).filter((d) => !d.pfad.includes(`${path.sep}${schonenId}${path.sep}`));
    let belegt = (await this.#cacheDateien()).reduce((summe, d) => summe + d.bytes, 0);
    if (belegt + brauchtBytes <= this.deckelBytes) return;

    dateien.sort((a, b) => a.zuletzt - b.zuletzt);
    for (const datei of dateien) {
      if (belegt + brauchtBytes <= this.deckelBytes) break;
      await rm(datei.pfad, { force: true });
      belegt -= datei.bytes;
      this.protokoll.log?.(`[depot] LRU raeumt ${path.relative(this.cacheVerzeichnis, datei.pfad)} (${(datei.bytes / 1e9).toFixed(2)} GB)`);
    }
    if (belegt + brauchtBytes > this.deckelBytes) {
      throw new Error(`ssd_cache_deckel_zu_klein: braucht ${brauchtBytes} B, Deckel ${this.deckelBytes} B`);
    }
  }
}
