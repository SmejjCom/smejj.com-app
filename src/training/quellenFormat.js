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
 */
export const MAX_KONTEXT_ZEICHEN = 700;

export function kompakteFrage(text, { maxKontext = MAX_KONTEXT_ZEICHEN } = {}) {
  const roh = String(text || "");
  const trenn = roh.indexOf("\n\n");
  const frage = (trenn >= 0 ? roh.slice(0, trenn) : roh).trim().slice(0, MAX_FRAGE_ZEICHEN);
  const anhang = trenn >= 0 ? roh.slice(trenn + 2) : "";
  if (!anhang.trim()) return frage;
  const worte = new Set(frage.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
  const zeilen = anhang.split("\n").map((z) => z.trim()).filter((z) => z.length >= 25);
  const bewertet = zeilen.map((zeile, i) => {
    const klein = zeile.toLowerCase();
    let treffer = 0;
    for (const w of worte) if (klein.includes(w)) treffer += 1;
    // Eine Quellenangabe entscheidet nur bei Gleichstand, macht aber keine Zeile passend.
    return { zeile, i, treffer, wert: treffer + (/https?:\/\/|\bQuelle\b/i.test(zeile) ? 0.5 : 0) };
  }).filter((z) => z.treffer > 0);
  bewertet.sort((a, b) => b.wert - a.wert || a.i - b.i);
  const gewaehlt = [];
  let laenge = 0;
  for (const z of bewertet) {
    const stueck = z.zeile.length > 320 ? `${z.zeile.slice(0, 320)} …` : z.zeile;
    if (laenge + stueck.length > maxKontext) continue;
    gewaehlt.push({ ...z, zeile: stueck });
    laenge += stueck.length + 1;
  }
  if (!gewaehlt.length) return frage;
  gewaehlt.sort((a, b) => a.i - b.i);
  return `${frage}\n\nGefundene Quellen (nur verwenden, wenn sie zur Frage passen):\n${gewaehlt.map((z) => z.zeile).join("\n")}`;
}

