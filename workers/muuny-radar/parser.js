// muuny ai radar — aus Feeds und Schnittstellen werden Funde.
//
// JEDER Inhalt aus dem Netz ist Daten, nie Anweisung. Darum:
//  * HTML wird zu Text; Skripte, Stile, HTML-Kommentare und VERSTECKTE Elemente
//    (display:none, visibility:hidden, hidden, aria-hidden, font-size:0) werden
//    entfernt und GEZAEHLT — versteckter Text ist das klassische Versteck fuer
//    Anweisungen an eine KI, die die Seite liest.
//  * unsichtbare Zeichen (Null-Breite, Richtungsumkehr) fliegen raus
//  * Anweisungsversuche entschaerft entwaffneFremdtext (Baustein von smejj) — und
//    der Fund wird sichtbar mitgezaehlt, nicht still geschluckt.
import { entwaffneFremdtext } from "../../control-server/src/rag/fremdinhaltFilter.js";

const ENTITAETEN = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", mdash: "—", ndash: "–", hellip: "…" };

export function dekodiere(t) {
  return String(t || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITAETEN[n.toLowerCase()] ?? m);
}

const VERSTECKT = /<([a-z0-9]+)\b[^>]*?(?:style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)[^"']*["']|\shidden(?=[\s>=/])|aria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/\1>/gi;
const UNSICHTBAR = /[​-‏‪-‮⁠-⁤﻿]/g;

/** HTML -> Text. Liefert auch, wie viel Verstecktes entfernt wurde. */
export function zuText(html) {
  let s = dekodiere(html);
  let versteckt = 0;
  // Das Entfernte wird aufgehoben: steht darin eine Anweisung, ist die Seite manipuliert.
  const weg = [];
  s = s.replace(/<!--([\s\S]*?)-->/g, (_, inhalt) => { versteckt += 1; weg.push(inhalt); return " "; });
  s = s.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ");
  // Mehrfach, weil versteckte Elemente verschachtelt sein koennen.
  for (let i = 0; i < 3; i += 1) s = s.replace(VERSTECKT, (treffer) => { versteckt += 1; weg.push(treffer.replace(/<[^>]+>/g, " ")); return " "; });
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ");
  s = dekodiere(s); // doppelt kodierte Feeds
  const vorher = s.length;
  s = s.replace(UNSICHTBAR, "");
  if (s.length !== vorher) versteckt += 1;
  s = s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { text: s, versteckt, versteckterText: weg.join(" ").replace(/\s+/g, " ").trim() };
}

/**
 * Markdown (Release-Notizen) -> schlichter Text.
 * GitHub-Notizen enthalten fast immer auch HTML (<details>, <img>, <summary>) — gemessen
 * am 23.09. an llama.cpp b11118 und transformers 5.17.0, deren Text mit "<details open"
 * begann. Darum laeuft der Text danach durch zuText: Tags weg, Verstecktes weg, Entitaeten
 * aufgeloest.
 */
function ausMarkdown(md) {
  // ERST das HTML (zuText), DANN die Markdown-Zeichen: andersherum zerstoert das
  // Entfernen von ">" die Tags, und zuText findet nichts mehr zu entfernen — der Text
  // kam dann leer heraus (im Test gemessen).
  const { text } = zuText(String(md || "").replace(/```[\s\S]*?```/g, " "));
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
}

function feld(block, ...namen) {
  for (const n of namen) {
    const m = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, "i").exec(block);
    if (m) return m[1];
  }
  return "";
}

function link(block) {
  const href = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*(?:rel\s*=\s*["']alternate["'])?[^>]*\/?>/i.exec(block);
  if (href) return dekodiere(href[1]).trim();
  return dekodiere(feld(block, "link", "guid", "id")).trim();
}

function datum(roh) {
  const d = new Date(String(roh || "").trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Macht aus einem rohen Fund einen gepruefbaren, entschaerften Fund. */
function fund(q, { titel, link: l, veroeffentlicht, html = "", text = null }) {
  const t = zuText(titel);
  const koerper = text !== null ? { text: String(text).replace(UNSICHTBAR, ""), versteckt: 0, versteckterText: "" } : zuText(html);
  const et = entwaffneFremdtext(t.text);
  const ek = entwaffneFremdtext(koerper.text);
  return {
    quelleId: q.id, quelle: q.name, anbieter: q.anbieter || null, primaer: Boolean(q.primaer),
    titel: et.text.slice(0, 300), link: String(l || "").trim(), veroeffentlicht: veroeffentlicht || null,
    text: ek.text.slice(0, 1500),
    versteckt: t.versteckt + koerper.versteckt,
    anweisungsversuche: et.funde + ek.funde,
    // Anweisungen im UNSICHTBAREN Teil: der sichere Beweis fuer eine praeparierte Seite.
    versteckteAnweisungen: entwaffneFremdtext(`${t.versteckterText} ${koerper.versteckterText}`).funde
  };
}

/**
 * @returns {{funde: object[], fehler: string|null}}
 */
export function zerlege(q, roh, { max = 15 } = {}) {
  try {
    if (q.art === "rss" || q.art === "arxiv") {
      const bloecke = [...String(roh).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).slice(0, max);
      if (!bloecke.length && !/<(rss|feed|rdf)/i.test(String(roh))) return { funde: [], fehler: "kein_feed" };
      return { funde: bloecke.map((b) => fund(q, { titel: feld(b, "title"), link: link(b),
        veroeffentlicht: datum(feld(b, "pubDate", "published", "updated", "dc:date")),
        html: feld(b, "content:encoded", "content", "summary", "description") })), fehler: null };
    }
    const daten = JSON.parse(roh);
    if (q.art === "github-releases") {
      if (!Array.isArray(daten)) return { funde: [], fehler: "keine_liste" };
      // "v1.8.0" allein sagt niemandem, WESSEN Version das ist — im Bericht wie in der Suche.
      const mitAnbieter = (t) => (q.anbieter && !String(t).toLowerCase().includes(String(q.anbieter).toLowerCase()) ? `${q.anbieter} ${t}` : String(t));
      return { funde: daten.filter((r) => !r.draft).slice(0, max).map((r) => fund(q, { titel: mitAnbieter(r.name || r.tag_name), link: r.html_url,
        veroeffentlicht: datum(r.published_at || r.created_at), text: ausMarkdown(r.body).slice(0, 1500) })), fehler: null };
    }
    if (q.art === "hf-models") {
      if (!Array.isArray(daten)) return { funde: [], fehler: "keine_liste" };
      return { funde: daten.slice(0, max).map((m) => fund(q, { titel: m.modelId || m.id, link: `https://huggingface.co/${m.modelId || m.id}`,
        veroeffentlicht: datum(m.createdAt || m.lastModified),
        text: `Modell ${m.modelId || m.id}. Aufgabe: ${m.pipeline_tag || "unbekannt"}. Downloads: ${m.downloads ?? "?"}. Likes: ${m.likes ?? "?"}. Tags: ${(m.tags || []).slice(0, 12).join(", ")}` })), fehler: null };
    }
    if (q.art === "hn") {
      if (!Array.isArray(daten?.hits)) return { funde: [], fehler: "keine_treffer_liste" };
      return { funde: daten.hits.slice(0, max).map((h) => fund(q, { titel: h.title || h.story_title || "",
        link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, veroeffentlicht: datum(h.created_at),
        text: `${h.title || ""} (Punkte: ${h.points ?? 0}, Kommentare: ${h.num_comments ?? 0})` })), fehler: null };
    }
    return { funde: [], fehler: `art_unbekannt:${q.art}` };
  } catch (f) {
    return { funde: [], fehler: `unlesbar:${String(f?.message || f).slice(0, 60)}` };
  }
}

/**
 * Aus der HTML-Seite eines Fundes den Fliesstext gewinnen — fuer Feeds, die NUR
 * Ueberschriften liefern (DeepMind- und Hugging-Face-Blog, gemessen 23.09.).
 * Derselbe Weg wie bei Feed-Inhalten: Verstecktes zaehlen, Anweisungen entschaerfen.
 * @returns {{text, versteckt, anweisungsversuche}}
 */
export function seitenText(html, { maxZeichen = 900 } = {}) {
  const roh = zuText(String(html || "").replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " "));
  const entwaffnet = entwaffneFremdtext(roh.text);
  const versteckteAnweisungen = entwaffneFremdtext(roh.versteckterText || "").funde;
  // Navigationsreste sind kurze Zeilen ohne Satzzeichen; der erste echte Absatz zaehlt.
  const absaetze = entwaffnet.text.split("\n").map((z) => z.trim()).filter((z) => z.length > 80 || /[.!?]$/.test(z));
  return { text: absaetze.join(" ").slice(0, maxZeichen).trim(), versteckt: roh.versteckt,
    anweisungsversuche: entwaffnet.funde + versteckteAnweisungen, versteckteAnweisungen };
}

/** Die Abruf-Adresse einer Quelle fuer ein Thema (Suche bei arXiv und HN). */
export function abrufAdresse(q, thema) {
  if (q.art === "arxiv") {
    const suche = thema?.suche || thema?.begriffe?.slice(0, 3).map((b) => `all:"${b}"`).join(" OR ") || "all:LLM";
    return `${q.url}?search_query=${encodeURIComponent(suche)}&sortBy=submittedDate&sortOrder=descending&max_results=15`;
  }
  if (q.art === "hn") {
    const begriff = (thema?.begriffe || ["LLM"])[0];
    return `${q.url}?query=${encodeURIComponent(begriff)}&tags=story&hitsPerPage=15`;
  }
  return q.url;
}
