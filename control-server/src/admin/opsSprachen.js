// smejj.com — Modul T: Sprachen und Uebersetzungen (Single Responsibility: was fehlt wo).
//
// Quellsprache ist Deutsch, und zwar woertlich: der deutsche Satz IST der
// Schluessel. Eine Sprachdatei bildet deutschen Quelltext auf die Uebersetzung
// ab. Es gibt deshalb keine de.js — Deutsch ist immer vollstaendig.
//
// ZWEI BEFUNDE, die streng getrennt bleiben muessen:
//
//   - FEHLT      — der Schluessel steht gar nicht in der Datei. Die Oberflaeche
//                  zeigt dann deutschen Text mitten in einer fremden Sprache.
//                  Das ist immer ein Mangel.
//   - WORTGLEICH — der Wert ist derselbe wie der deutsche Quelltext. Das KANN
//                  eine vergessene Uebersetzung sein — oder voellig richtig:
//                  "Free-safe", "System", "Maximal" heissen in vielen Sprachen
//                  genau so. Live gemessen (29.07.2026) waren alle 14 Sprachen
//                  betroffen, praktisch nur durch solche Faelle.
//
// Deshalb zaehlt NUR "fehlt" als Luecke. Wortgleiches wird gezeigt, damit man
// es durchsehen kann, aber es faerbt keine Kachel rot. Ein Bildschirm, der
// korrekte Uebersetzungen als Mangel meldet, wird beim zweiten Mal ignoriert.
//
// BEZUGSGROESSE IST DIE VEREINIGUNG ALLER SPRACHDATEIEN, nicht der Quelltext der
// App. Ein Schluessel, den KEINE Sprache kennt, faellt hier also nicht auf. Das
// steht ausdruecklich in der Antwort — eine Vollstaendigkeit, die nicht geprueft
// wurde, darf nicht behauptet werden.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const I18N_VERZEICHNIS = path.resolve(fileURLToPath(new URL("../../../public/i18n/", import.meta.url)));
// ui.js ist die Laufzeit, keine Sprachdatei.
const KEINE_SPRACHE = new Set(["ui.js"]);
const CACHE_MS = 10 * 60 * 1000;

let cache = null;

export async function sprachUebersicht({
  jetztMs = Date.now(),
  verzeichnis = I18N_VERZEICHNIS,
  frisch = false
} = {}) {
  if (!frisch && cache && jetztMs - cache.atMs < CACHE_MS) {
    return { ...cache.wert, ausCache: true };
  }

  let dateien;
  try {
    dateien = (await fs.readdir(verzeichnis))
      .filter((n) => n.endsWith(".js") && !KEINE_SPRACHE.has(n))
      .sort();
  } catch (error) {
    return { ok: false, error: String(error?.message || "i18n_nicht_lesbar").slice(0, 160), sprachen: [] };
  }

  const geladen = [];
  for (const datei of dateien) geladen.push(await ladeSprache(verzeichnis, datei));

  const lesbar = geladen.filter((s) => s.lesbar);
  const alleSchluessel = new Set();
  for (const s of lesbar) for (const k of s.schluessel) alleSchluessel.add(k);

  const sprachen = lesbar.map((s) => {
    const fehlend = [...alleSchluessel].filter((k) => !s.werte.has(k));
    // Wortgleich ist KEIN Mangel: Eigennamen und Fachbegriffe heissen in vielen
    // Sprachen genau so. Gezeigt zum Durchsehen, nicht gezaehlt als Luecke.
    const wortgleich = [...s.werte.entries()].filter(([k, v]) => v === k).map(([k]) => k);
    const vorhanden = alleSchluessel.size - fehlend.length;
    return {
      code: s.code,
      eintraege: s.werte.size,
      fehlend: fehlend.length,
      wortgleich: wortgleich.length,
      // Abdeckung misst Vorhandensein — das ist das, was sich objektiv
      // feststellen laesst. Ob eine Uebersetzung gut ist, kann eine Maschine
      // nicht beurteilen und behauptet es deshalb auch nicht.
      abdeckungProzent: alleSchluessel.size
        ? Math.round((vorhanden / alleSchluessel.size) * 1000) / 10
        : 100,
      // Nur eine Handvoll Beispiele: die Ansicht soll zeigen, wo es klemmt,
      // nicht die Sprachdatei nachdrucken.
      beispieleFehlend: fehlend.slice(0, 5),
      beispieleWortgleich: wortgleich.slice(0, 5)
    };
  }).sort((a, b) => a.abdeckungProzent - b.abdeckungProzent || b.wortgleich - a.wortgleich);

  const nichtLesbar = geladen.filter((s) => !s.lesbar);
  const wert = {
    ok: true,
    quellsprache: "Deutsch",
    schluesselGesamt: alleSchluessel.size,
    sprachen: sprachen.length,
    vollstaendig: sprachen.filter((s) => s.fehlend === 0).length,
    mitLuecken: sprachen.filter((s) => s.fehlend > 0).length,
    // Getrennt gefuehrt: zum Durchsehen, nicht als Mangel.
    mitWortgleichem: sprachen.filter((s) => s.wortgleich > 0).length,
    liste: sprachen,
    nichtLesbar: nichtLesbar.map((s) => ({ code: s.code, grund: s.grund })),
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: "Bezugsgroesse ist die Vereinigung aller Sprachdateien, nicht der Quelltext der App. "
      + "Ein Schluessel, den keine Sprache kennt, faellt hier nicht auf. "
      + "Deutsch ist die Quellsprache und deshalb immer vollstaendig.",
    wortgleichHinweis: "Wortgleich heisst: der Wert entspricht dem deutschen Quelltext. Das ist oft "
      + "richtig — Eigennamen und Fachbegriffe heissen in vielen Sprachen genau so. Es zaehlt "
      + "deshalb NICHT als Luecke, sondern steht zum Durchsehen da."
  };
  cache = { atMs: jetztMs, wert };
  return { ...wert, ausCache: false };
}

async function ladeSprache(verzeichnis, datei) {
  const code = datei.replace(/\.js$/, "");
  try {
    // Datenmodule ohne Nebenwirkungen: `export default { ... }`.
    const modul = await import(path.join(verzeichnis, datei));
    const tabelle = modul?.default;
    if (!tabelle || typeof tabelle !== "object") {
      return { code, lesbar: false, grund: "kein Standard-Export mit Uebersetzungen" };
    }
    const werte = new Map(Object.entries(tabelle).map(([k, v]) => [k, String(v)]));
    return { code, lesbar: true, werte, schluessel: [...werte.keys()] };
  } catch (error) {
    return { code, lesbar: false, grund: String(error?.message || "nicht ladbar").slice(0, 120) };
  }
}

export function __leereSprachCache() { cache = null; }
