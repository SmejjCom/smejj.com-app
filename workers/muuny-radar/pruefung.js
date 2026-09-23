// muuny ai radar — Funde pruefen, bevor irgendetwas in die Wissensbasis darf.
//
// STATUS eines Fundes (die Reihenfolge der Pruefung ist die Reihenfolge hier):
//   verworfen         unvollstaendig, themenfremd, zu alt, Werbung, oder
//                     manipuliert (verstecktes Material MIT Anweisungsversuch)
//   widerspruechlich  eine Zahl (Preis, Benchmark) widerspricht einer anderen Quelle
//   unbestaetigt      Geruecht, Sekundaerquelle ohne zweite unabhaengige Bestaetigung,
//                     oder Anweisungsversuch auf einer an sich vertrauenswuerdigen Seite
//   unveraendert      steht schon genau so in der Wissensbasis
//   aktualisiert      steht in der Wissensbasis, hat sich aber inhaltlich geaendert
//   geprueft          Primaerquelle, oder zwei unabhaengige Domains sagen dasselbe
//
// Nur "geprueft" und "aktualisiert" (sofern geprueft) werden aktive Wissenseintraege.
// Alles andere wird PROTOKOLLIERT — mit Grund — aber nicht benutzt.
import { createHash } from "node:crypto";

const hash = (t) => createHash("sha256").update(String(t)).digest("hex");

/** Kanonische Adresse: ohne Tracking-Parameter, Fragment und Schluss-Schraegstrich. */
export function kanonisch(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch { return String(url || "").trim(); }
}

export function domain(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

/** Was sich staendig aendert, ohne dass sich die AUSSAGE aendert (Zaehler). */
export function inhaltKern(fund) {
  return `${fund.titel}\n${fund.text}`.replace(/\b(Downloads|Likes|Punkte|Kommentare):\s*[\d?]+\.?/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Der Schluessel einer Aussage: was ist "dasselbe", ueber Laeufe und Quellen hinweg. */
export function schluesselVon(fund) {
  if (fund.quelleId?.startsWith("hf-") || /huggingface\.co\/[^/]+\/[^/?#]+$/.test(fund.link)) {
    return `modell:${String(fund.titel).toLowerCase()}`;
  }
  const gh = /github\.com\/([^/]+\/[^/]+)\/releases\/tag\/([^/?#]+)/.exec(fund.link);
  if (gh) return `release:${gh[1].toLowerCase()}:${gh[2]}`;
  return `artikel:${kanonisch(fund.link)}`;
}

const MODELLNAME = /\b(GPT-[\w.]+|o[1-9](?:-(?:mini|pro))?|Gemini[\s-]?\d[\w.]*(?:[\s-](?:Pro|Flash|Ultra|Nano))?|Claude[\s-](?:Opus|Sonnet|Haiku)[\s-]?[\d.]+|Qwen[\d.]+(?:-[\w.]+)?|Llama[\s-]?[\d.]+|Mistral[\s-](?:Large|Medium|Small)[\s-]?[\d.]*|DeepSeek[\s-]?[VR]?[\d.]+|Gemma[\s-]?[\d.]+)\b/gi;

export function modelle(text) {
  return [...new Set([...String(text || "").matchAll(MODELLNAME)].map((m) => m[1].replace(/\s+/g, "-").toLowerCase()))];
}

/**
 * Zahlenaussagen: Preise je Million Tokens und Benchmark-Werte, jeweils an ein Modell gebunden.
 * Nur so lassen sich Widersprueche zwischen Quellen ueberhaupt erkennen.
 */
export function zahlenAussagen(fund) {
  const text = `${fund.titel}. ${fund.text}`;
  const modell = modelle(text)[0];
  if (!modell) return [];
  const aussagen = [];
  for (const m of text.matchAll(/\$\s?(\d+(?:\.\d+)?)\s*(?:\/|per)\s*(?:1M|million|1\s?000\s?000)\s*(input|output)?\s*tokens?/gi)) {
    aussagen.push({ schluessel: `preis:${modell}:${(m[2] || "input").toLowerCase()}`, wert: Number(m[1]) });
  }
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s?%\s+(?:on|auf|in)\s+([A-Z][\w.-]{2,30})/g)) {
    aussagen.push({ schluessel: `benchmark:${modell}:${m[2].toLowerCase()}`, wert: Number(m[1]) });
  }
  return aussagen;
}

const WERBUNG = /\b(sponsored|gesponsert|anzeige|advertorial|promo(?:tion)? code|rabattcode|jetzt kaufen|buy now|affiliate|partnerlink)\b/i;
const GERUECHT = /\b(rumou?r(?:ed|s)?|reportedly|leak(?:ed|s)?|allegedly|unconfirmed|insider|could be|may launch|geruecht|gerüchte?|angeblich|soll angeblich|unbestaetigt|unbestätigt|durchgesickert)\b/i;

export function passtZumThema(fund, thema) {
  const t = `${fund.titel} ${fund.text}`.toLowerCase();
  return (thema?.begriffe || []).some((b) => {
    const w = String(b).toLowerCase().trim();
    if (!w) return false;
    // Ganze Woerter: "api" darf nicht in "rapid" treffen.
    return new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(t);
  });
}

/**
 * Prueft die Funde EINES Laufs gegen die Themen und die bestehende Wissensbasis.
 * @param funde    [{fund, themaId}]
 * @param bestand  Map schluessel -> {kern, zahlen:[{schluessel,wert,domain}], aktiv:boolean}
 */
export function pruefeFunde(funde, { themen, bestand = new Map(), jetzt = new Date(), maxAlterTage = 45 }) {
  const nachSchluessel = new Map();
  const verworfen = [];
  const themaVon = new Map(themen.map((t) => [t.id, t]));

  for (const { fund, themaId } of funde) {
    const thema = themaVon.get(themaId);
    const weg = (grund) => verworfen.push({ fund, themaId, status: "verworfen", grund });
    if (!fund.titel || !fund.link) { weg("unvollstaendig"); continue; }
    if (fund.versteckteAnweisungen > 0 || (fund.versteckt > 0 && fund.anweisungsversuche > 0)) { weg("manipuliert:versteckter_text_mit_anweisung"); continue; }
    if (fund.anweisungsversuche > 0 && !fund.primaer) { weg("manipuliert:anweisungsversuch_in_fremdquelle"); continue; }
    if (!passtZumThema(fund, thema)) { weg("themenfremd"); continue; }
    if (fund.veroeffentlicht) {
      const alter = (jetzt - new Date(fund.veroeffentlicht)) / 86_400_000;
      if (alter > maxAlterTage) { weg(`zu_alt:${Math.round(alter)}_tage`); continue; }
      if (alter < -2) { weg("datum_in_der_zukunft"); continue; }
    }
    if (WERBUNG.test(`${fund.titel} ${fund.text}`)) { weg("werbung"); continue; }

    // Innerhalb des Laufs zusammenfuehren: dieselbe Aussage aus mehreren Quellen.
    const s = schluesselVon(fund);
    const e = nachSchluessel.get(s) || { schluessel: s, themaId, funde: [] };
    e.funde.push(fund);
    nachSchluessel.set(s, e);
  }

  // Zweite Stufe: Bestaetigung ueber AEHNLICHE Titel aus verschiedenen Domains.
  const gruppen = [...nachSchluessel.values()];
  const woerter = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9äöüß.-]{4,}/g) || []);
  for (const g of gruppen) g.woerter = woerter(g.funde[0].titel);
  for (const a of gruppen) {
    a.bestaetigtVon = new Set(a.funde.map((f) => domain(f.link)));
    for (const b of gruppen) {
      if (a === b) continue;
      const schnitt = [...a.woerter].filter((w) => b.woerter.has(w)).length;
      const ahnlich = schnitt / Math.max(1, Math.min(a.woerter.size, b.woerter.size));
      if (ahnlich >= 0.6 && schnitt >= 3) for (const f of b.funde) a.bestaetigtVon.add(domain(f.link));
    }
  }

  // Zahlen aller Funde dieses Laufs — fuer Widersprueche innerhalb des Laufs.
  const zahlenImLauf = new Map();
  for (const g of gruppen) for (const f of g.funde) for (const z of zahlenAussagen(f)) {
    const liste = zahlenImLauf.get(z.schluessel) || [];
    liste.push({ ...z, domain: domain(f.link), link: f.link });
    zahlenImLauf.set(z.schluessel, liste);
  }

  const ergebnisse = [];
  for (const g of gruppen) {
    const f = g.funde.find((x) => x.primaer) || g.funde[0];
    const quellen = g.funde.map((x) => ({ url: x.link, domain: domain(x.link), primaer: x.primaer, quelle: x.quelle,
      veroeffentlicht: x.veroeffentlicht }));
    const kern = inhaltKern(f);
    const kernHash = hash(kern);
    const basis = { fund: f, themaId: g.themaId, schluessel: g.schluessel, quellen, kernHash, modelle: modelle(`${f.titel} ${f.text}`),
      zahlen: g.funde.flatMap((x) => zahlenAussagen(x).map((z) => ({ ...z, domain: domain(x.link) }))) };

    // Widerspruch: dieselbe Zahlenaussage mit anderem Wert aus einer ANDEREN Domain.
    const widersprueche = [];
    for (const z of basis.zahlen) {
      const andere = [...(zahlenImLauf.get(z.schluessel) || []), ...((bestand.get(`zahl:${z.schluessel}`)?.werte) || [])]
        .filter((y) => y.domain !== z.domain && Math.abs(y.wert - z.wert) > 1e-9);
      for (const y of andere) widersprueche.push(`${z.schluessel}: ${z.wert} (${z.domain}) gegen ${y.wert} (${y.domain})`);
    }
    if (widersprueche.length) { ergebnisse.push({ ...basis, status: "widerspruechlich", grund: widersprueche.slice(0, 3).join("; ") }); continue; }

    const alt = bestand.get(g.schluessel);
    if (alt && alt.kernHash === kernHash) { ergebnisse.push({ ...basis, status: "unveraendert", grund: "steht_schon_so_in_der_wissensbasis" }); continue; }
    // Feed liefert nur die Ueberschrift, das Wissen hat den Text schon (frueher nachgeladen):
    // unveraendert — sonst wuerde der leere Feed-Eintrag den gespeicherten Text ueberschreiben.
    if (alt && !String(f.text || "").trim() && String(alt.kurz || "").trim()) { ergebnisse.push({ ...basis, status: "unveraendert", grund: "text_steht_schon_in_der_wissensbasis" }); continue; }

    const geruecht = GERUECHT.test(`${f.titel} ${f.text}`);
    const zweiDomains = g.bestaetigtVon.size >= 2;
    let pruef;
    if (geruecht && !zweiDomains) pruef = { geprueft: false, grund: "geruecht_ohne_bestaetigung" };
    else if (f.anweisungsversuche > 0) pruef = { geprueft: false, grund: "manipulationsverdacht_auf_primaerquelle" };
    else if (f.primaer) pruef = { geprueft: true, grund: "primaerquelle" };
    else if (zweiDomains) pruef = { geprueft: true, grund: `bestaetigt_durch:${[...g.bestaetigtVon].join(",")}` };
    else pruef = { geprueft: false, grund: "sekundaerquelle_ohne_zweite_bestaetigung" };

    if (!pruef.geprueft) { ergebnisse.push({ ...basis, status: "unbestaetigt", grund: pruef.grund }); continue; }
    ergebnisse.push({ ...basis, status: alt ? "aktualisiert" : "geprueft", grund: pruef.grund,
      ...(alt ? { vorher: alt.kurz || null } : {}) });
  }
  return { ergebnisse, verworfen };
}
