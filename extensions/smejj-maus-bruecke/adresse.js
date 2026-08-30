// smejj.com Maus-Bruecke — eine Adresse zu einer Herkunft machen.
//
// Eigene Datei, weil es die EINZIGE Stelle ist, an der aus einer Eingabe des
// Betreibers eine Berechtigung wird. Reine Funktion: ohne Fenster und ohne
// chrome-API pruefbar — die Schranke, die am meisten zaehlt, soll die sein,
// die ein Test wirklich erreichen kann.
export function alsHerkunft(eingabe) {
  const roh = String(eingabe || "").trim();
  if (!roh) return null;
  // Ohne Schema ergaenzen wir https. http bleibt gesperrt: im ANGEMELDETEN
  // Chrome des Betreibers waere eine unverschluesselte Seite ein Klartext-Leck.
  const mitSchema = /^https?:\/\//i.test(roh) ? roh : `https://${roh}`;
  try {
    const url = new URL(mitSchema);
    if (url.protocol !== "https:") return null;
    // Ein Punkt muss sein: "mail" allein ist ein Vertipper, kein Ziel — und
    // eine Berechtigung auf einen Vertipper waere still falsch.
    if (!url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}
