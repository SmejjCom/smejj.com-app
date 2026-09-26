// smejj.com — das Lesestoff-Format fuer smejj 1 (26.09.2026).
//
// EINE Quelle fuer zwei Stellen, die exakt uebereinstimmen muessen:
//   - control-server/src/llm/schlankeAnfrage.js baut daraus die Anfrage im Betrieb,
//   - workers/smejj-lora-loop/internetLernpaare.js baut daraus die Lernpaare.
// Weicht das Trainingsformat vom Betriebsformat ab, lernt smejj 1 etwas, das es
// nie zu sehen bekommt.
/** Die Frage wird hoechstens so lang weitergereicht (Zeichen, nicht Tokens). */
export const MAX_FRAGE_ZEICHEN = 1_500;

export const SCHLANKE_ROLLE = "Du bist smejj, der KI-Assistent von smejj.com. "
  // Freigabe 1f (15.09.2026): Sprache des Nutzers statt fest Deutsch (gleiche Regel wie Bruecke und Agent).
  + "Antworte in der Sprache des Nutzers, kurz und sachlich richtig. "
  + "Wenn du etwas nicht sicher weisst, sag das offen, statt etwas zu erfinden.";

/**
 * Lesestoff fuer das kleine Modell (26.09.2026, Betreiber: smejj 1 soll aus dem
 * Internet lernen). GEMESSEN: der Hausmodell-Dienst liest auf 2 Kernen nur
 * ~12 Tokens/s ein — 1.500 Zeichen Anhang (417 Tokens) kosteten 35 s bis zum
 * ersten Wort. Statt den Anhang vorn abzuschneiden (dort stehen Kopfzeilen und
 * der erste Treffer, nicht zwingend der passende), bekommt smejj 1 die Frage
 * plus die Zeilen, die am meisten mit der Frage zu tun haben — in der
 * urspruenglichen Reihenfolge, mit Quelle, hoechstens MAX_KONTEXT_ZEICHEN.
 *
 * NACHGEMESSEN (26.09.): bei 700 und 1.400 Zeichen fiel der entscheidende
 * Treffer (ZDF, Platz 5) heraus, smejj 1 antwortete "keine Quelle". Darum 1.700:
 * alle fuenf Treffer passen hinein, Kopfzeile und volle Adressen fallen weg.
 * Das spart wenig Zeit — die Grenze ist der 2-Kern-Server, nicht der Text.
 */
export const MAX_KONTEXT_ZEICHEN = 1_700;

/**
 * Zerlegt den Anhang in Einheiten: nummerierte Suchtreffer (Titel, Adresse,
 * Auszug ueber mehrere Zeilen) werden EINE Einheit "Titel — Auszug (domain)",
 * alles andere bleibt zeilenweise. GEMESSEN 26.09.: zeilenweise Auswahl riss
 * Titel, Adresse und Auszug auseinander und liess den entscheidenden Treffer
 * (ZDF, Platz 5) fallen — smejj 1 antwortete dann "keine Quelle".
 */
function einheiten(anhang) {
  const aus = [];
  let block = null;
  const abschliessen = () => { if (block) { aus.push(block); block = null; } };
  const alle = anhang.split("\n");
  for (let n = 0; n < alle.length; n += 1) {
    const zeile = alle[n].trim();
    // Ein neuer Treffer beginnt nur, wenn direkt darunter seine Adresse steht —
    // sonst ist "75. ↑ ..." eine Fussnote im Auszug, kein Treffer.
    const kopf = /^https?:\/\//.test(String(alle[n + 1] || "").trim()) ? zeile.match(/^(\d+)\.\s+(.*)$/) : null;
    if (kopf) { abschliessen(); block = { titel: kopf[2], url: "", auszug: [] }; continue; }
    if (block && /^https?:\/\//.test(zeile)) { block.url = zeile; continue; }
    if (block && zeile && !/^[-*]\s/.test(zeile) && !/^(Aktuelles aus|Projektwissen|Live-Internet-Kontext)/i.test(zeile)) { block.auszug.push(zeile); continue; }
    abschliessen();
    if (zeile.length >= 25 && !/^(Live-Internet-Kontext|Aktuelles aus der eigenen Recherche|Projektwissen)/i.test(zeile)) aus.push({ zeile });
  }
  abschliessen();
  return aus.map((e) => {
    if (e.zeile) return e.zeile;
    let domain = "";
    try { domain = new URL(e.url).hostname.replace(/^www\./, ""); } catch { /* ohne Adresse */ }
    const auszug = e.auszug.join(" ").replace(/\s+/g, " ").slice(0, 260);
    if (!auszug) return "";
    return `${e.titel.replace(/\s*\|.*$/, "").slice(0, 90)} — ${auszug}${domain ? ` (${domain})` : ""}`;
  });
}

export function kompakteFrage(text, { maxKontext = MAX_KONTEXT_ZEICHEN } = {}) {
  const roh = String(text || "");
  const trenn = roh.indexOf("\n\n");
  const frage = (trenn >= 0 ? roh.slice(0, trenn) : roh).trim().slice(0, MAX_FRAGE_ZEICHEN);
  const anhang = trenn >= 0 ? roh.slice(trenn + 2) : "";
  if (!anhang.trim()) return frage;
  const worte = new Set(frage.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
  // Reihenfolge der Suchmaschine bleibt (sie ist die bessere Relevanz als ein
  // Wortvergleich); aufgenommen wird, was mindestens ein Wort der Frage traegt.
  const gewaehlt = [];
  let laenge = 0;
  for (const einheit of einheiten(anhang)) {
    const klein = einheit.toLowerCase();
    let treffer = 0;
    for (const w of worte) if (klein.includes(w)) treffer += 1;
    if (!treffer) continue;
    if (!einheit) continue;
    const stueck = einheit.length > 380 ? `${einheit.slice(0, 380)} …` : einheit;
    if (laenge + stueck.length > maxKontext) continue;
    gewaehlt.push(stueck);
    laenge += stueck.length + 1;
  }
  if (!gewaehlt.length) return frage;
  return `${frage}\n\nGefundene Quellen (nur verwenden, wenn sie zur Frage passen):\n${gewaehlt.map((z) => `- ${z.replace(/^-\s+/, "")}`).join("\n")}`;
}
