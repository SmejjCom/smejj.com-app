// smejj.com — Modul S: Inhalte und Wissen (Single Responsibility: was ist indexiert).
//
// Die Wissensbasis der Agenten sind Markdown-Dateien im Repository: die
// Wurzeldokumente plus alles unter docs/. Daraus baut knowledgeLoader Chunks,
// aus denen bm25Index den Suchindex macht.
//
// DAS ALTER IST IM RELEASE-ARTEFAKT NICHT MESSBAR — und das ist kein Detail.
//
// Der Release-Bau ist bewusst deterministisch: er setzt bei JEDER Datei
// denselben Zeitstempel (Epoche 0, im Artefakt sichtbar als 1999-12-31).
// Wuerde dieses Modul daraus ein Alter rechnen, stuenden live rund 9.700 Tage
// neben jedem Dokument, und die Warnung "veraltet" leuchtete fuer alles. Ein
// Bildschirm, der grundlos Alarm schlaegt, wird nach dem zweiten Mal nicht mehr
// gelesen.
//
// Deshalb wird zuerst geprueft, ob die Zeitstempel ueberhaupt etwas aussagen:
// tragen alle Dateien denselben, stammen sie vom Bau und nicht von der letzten
// Bearbeitung. Dann meldet das Modul "Alter nicht messbar" statt einer
// Phantomzahl. In der Arbeitskopie stimmen die Zeitstempel und werden genutzt.
//
// Rein lesend und ohne Netz: gelesen wird der Baum, aus dem der Control-Server
// ohnehin startet.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeChunks } from "../rag/knowledgeLoader.js";

const WURZEL = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const TAG_MS = 24 * 60 * 60 * 1000;
// Ab wann ein Dokument als alt gilt. Grosszuegig: Architekturtexte altern
// langsam, ein halbes Jahr ohne Anfassen ist trotzdem ein Hinweis.
const ALT_AB_TAGEN = 180;
const CACHE_MS = 10 * 60 * 1000;
const MAX_QUELLEN = 60;

let cache = null;

export async function wissenUebersicht({
  jetztMs = Date.now(),
  wurzel = WURZEL,
  ladeChunks = loadKnowledgeChunks,
  frisch = false
} = {}) {
  if (!frisch && cache && jetztMs - cache.atMs < CACHE_MS) return { ...cache.wert, ausCache: true };

  let chunks;
  try {
    chunks = await ladeChunks(wurzel);
  } catch (error) {
    return { ok: false, error: String(error?.message || "wissen_nicht_lesbar").slice(0, 160), quellen: [] };
  }

  const jeQuelle = new Map();
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    const quelle = String(chunk?.source || "unbekannt");
    const eintrag = jeQuelle.get(quelle) || { quelle, chunks: 0, zeichen: 0 };
    eintrag.chunks += 1;
    eintrag.zeichen += String(chunk?.text || "").length;
    jeQuelle.set(quelle, eintrag);
  }

  const roh = [];
  for (const eintrag of jeQuelle.values()) {
    roh.push({ ...eintrag, geaendertMs: await mtimeVon(path.join(wurzel, eintrag.quelle)) });
  }

  const alterMessbar = zeitstempelTaugen(roh);
  const quellen = roh
    .map((q) => ({
      quelle: q.quelle,
      chunks: q.chunks,
      zeichen: q.zeichen,
      geaendertAm: alterMessbar && q.geaendertMs ? new Date(q.geaendertMs).toISOString() : null,
      alterTage: alterMessbar && q.geaendertMs
        ? Math.max(0, Math.floor((jetztMs - q.geaendertMs) / TAG_MS))
        : null
    }))
    // Ist das Alter messbar, stehen die aeltesten oben. Sonst die groessten —
    // eine Sortierung nach einer Zahl, die es nicht gibt, waere Theater.
    .sort(alterMessbar
      ? (a, b) => (b.alterTage ?? -1) - (a.alterTage ?? -1)
      : (a, b) => b.zeichen - a.zeichen);

  const alt = alterMessbar ? quellen.filter((q) => (q.alterTage ?? 0) >= ALT_AB_TAGEN) : [];
  const wert = {
    ok: true,
    quellenGesamt: quellen.length,
    chunksGesamt: quellen.reduce((s, q) => s + q.chunks, 0),
    zeichenGesamt: quellen.reduce((s, q) => s + q.zeichen, 0),
    alterMessbar,
    altAbTagen: alterMessbar ? ALT_AB_TAGEN : null,
    alt: alterMessbar ? alt.length : null,
    aeltestesTage: alterMessbar && quellen.length ? quellen[0].alterTage : null,
    quellen: quellen.slice(0, MAX_QUELLEN),
    abgeschnitten: quellen.length > MAX_QUELLEN,
    sortierung: alterMessbar ? "aelteste zuerst" : "groesste zuerst",
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: alterMessbar
      ? "Aelteste zuerst. Gezaehlt wird, was der Wissenslader tatsaechlich einliest — "
        + "Wurzeldokumente und alles unter docs/. Was nicht eingelesen wird, taucht hier nicht "
        + "auf und ist fuer die Agenten auch nicht vorhanden."
      : "Das Alter der Dokumente ist hier nicht messbar: der Release-Bau ist deterministisch "
        + "und setzt bei jeder Datei denselben Zeitstempel. Statt einer Phantomzahl steht "
        + "deshalb nichts. Gezaehlt wird, was der Wissenslader tatsaechlich einliest."
  };
  cache = { atMs: jetztMs, wert };
  return { ...wert, ausCache: false };
}

/**
 * Tragen alle Dateien denselben Zeitstempel, stammt er vom Release-Bau und
 * sagt ueber das Dokument nichts aus. Bei einer einzigen Quelle laesst sich
 * das nicht unterscheiden — dann wird ebenfalls nichts behauptet.
 */
export function zeitstempelTaugen(eintraege) {
  const werte = eintraege.map((e) => e.geaendertMs).filter((m) => Number.isFinite(m) && m > 0);
  if (werte.length < 2) return false;
  return new Set(werte).size > 1;
}

async function mtimeVon(dateipfad) {
  try {
    return (await fs.stat(dateipfad)).mtimeMs;
  } catch {
    return null;
  }
}

export function __leereWissenCache() { cache = null; }
