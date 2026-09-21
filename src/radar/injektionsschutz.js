// smejj ai radar — Internetinhalte sind DATEN, nie Anweisungen (Auftrag Punkt 7).
//
// Rein, ohne I/O. Zweck: Text von fremden Seiten kann Saetze enthalten, die
// sich an ein Sprachmodell richten ("ignore previous instructions", "du bist
// jetzt ..."). Wandert so ein Satz ungeprueft in die Wissensbasis, liest ihn
// der Agent spaeter als Teil seines Kontexts.
//
// Zwei Schritte, bewusst getrennt:
//   1. ERKENNEN      verdaechtige Muster benennen (fuer Bericht und Ablehnung)
//   2. ENTSCHAERFEN  Steuerzeichen und Zaun-Zeichen entfernen, Laenge kappen
// Was erkannt wurde, wird NICHT gespeichert — auch nicht "markiert gespeichert":
// ein Satz, der eine Anweisung ist, hat als Wissen keinen Wert.

const ANWEISUNGS_MUSTER = [
  /\bignore (all )?(previous|prior|above) (instructions|prompts)\b/i,
  /\bdisregard (the )?(previous|above|system)\b/i,
  /\byou are now\b|\bdu bist (jetzt|ab sofort)\b/i,
  /\bsystem prompt\b|\bsystemanweisung\b/i,
  /\b(act|behave) as (an? )?(admin|developer|jailbreak)/i,
  /\breveal (your|the) (prompt|instructions|api key)\b/i,
  /\b(send|post|exfiltrate|schicke) (the |your )?(api[- ]?key|token|password|passwort|zugangsdaten)\b/i,
  /<\s*\/?\s*(script|iframe|system|instructions)\b/i,
  /\[\[?\s*(system|assistant|user)\s*\]\]?\s*:/i
];

/** Unsichtbare Zeichen, mit denen Anweisungen versteckt werden. */
const UNSICHTBAR = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029"
  + "\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]",
  "g"
);
const VERSTECK = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064]");

/** Findet Anweisungs-Muster. Leeres Feld = nichts gefunden. */
export function findeAnweisungen(text) {
  const roh = String(text || "");
  const entblaettert = roh.replace(UNSICHTBAR, "");
  const treffer = [];
  for (const muster of ANWEISUNGS_MUSTER) {
    const gefunden = entblaettert.match(muster);
    if (gefunden) treffer.push(gefunden[0].slice(0, 60));
  }
  if (treffer.length === 0 && VERSTECK.test(roh)) treffer.push("versteckte Steuerzeichen");
  return treffer;
}

/**
 * Macht fremden Text ablagefaehig: Steuerzeichen raus, Markdown-Zaeune und
 * Klammer-Rollen entschaerft, Laenge gekappt. Aendert nichts am Sinn.
 */
export function entschaerfe(text, { maxZeichen = 400 } = {}) {
  return String(text || "")
    .replace(UNSICHTBAR, "")
    .replace(/`{3,}/g, "'''")
    .replace(/\[\[?\s*(system|assistant|user)\s*\]\]?\s*:/gi, "$1 -")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxZeichen);
}

/**
 * Das Tor fuer einen Fund: `ok:false` heisst "nicht speichern", mit Grund fuer
 * den Tagesbericht ("verworfen, weil ...").
 */
export function pruefeFremdtext(fund) {
  const treffer = [
    ...findeAnweisungen(fund?.title),
    ...findeAnweisungen(fund?.snippet),
    ...findeAnweisungen(fund?.url)
  ];
  if (treffer.length) return { ok: false, grund: "anweisung_im_fremdtext", treffer: treffer.slice(0, 3) };
  return { ok: true, grund: null, treffer: [] };
}
