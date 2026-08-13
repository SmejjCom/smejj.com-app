// smejj.com — Angelina-Autopilot (Nr. 31): Wächter über die deutsche Sprache
// der ausgelieferten Oberfläche.
//
// WARUM ES DIESE DATEI GIBT (Befund 2026-08-13): Zu Nr. 31 existierte
// ÜBERHAUPT KEIN CODE. Der Commit, der ihn "voll integriert" nannte, fügte
// zwanzig Zeilen Registry-Text hinzu und sonst nichts. Die Registry
// versprach eine "Satz- & Prompt-Synthesizer Engine im 24/7-Dauerbetrieb".
//
// Statt diese Behauptung zu wiederholen, tut dieser Autopilot etwas Kleines,
// aber wirklich Nützliches: Er liest die ausgelieferten Seiten und findet
// deutsche Texte, die der Nutzer zu sehen bekommt und die falsch geschrieben
// sind. Der erste Lauf fand "Willkommen zurueck" auf der Startseite.
//
// Geprüft wird NUR sichtbarer Text zwischen den Tags (>…<). Attribute,
// Skripte und Dateinamen bleiben aussen vor — dort ist eine Ersatzschreibung
// oft richtig (Pfade, Kennungen), und ein Wächter, der Fehlalarm gibt, wird
// ignoriert.

/**
 * Wörter, bei denen die Ersatzschreibung im sichtbaren Text IMMER falsch ist.
 * Bewusst kurz und eindeutig gehalten: lieber wenige sichere Funde als viele
 * unsichere. Jeder Eintrag nennt die richtige Schreibweise mit.
 */
export const ERSATZSCHREIBUNGEN = Object.freeze([
  ["zurueck", "zurück"], ["fuer", "für"], ["ueber", "über"], ["koennen", "können"],
  ["moechten", "möchten"], ["waehlen", "wählen"], ["loeschen", "löschen"],
  ["aendern", "ändern"], ["schliessen", "schließen"], ["naechste", "nächste"],
  ["zurueckset", "zurückset"], ["ungueltig", "ungültig"], ["gueltig", "gültig"],
  ["hinzufuegen", "hinzufügen"], ["ausfuehren", "ausführen"], ["pruefen", "prüfen"],
  ["waehrend", "während"], ["spaeter", "später"], ["moeglich", "möglich"],
  ["persoenlich", "persönlich"], ["erklaerung", "erklärung"], ["bestaetigen", "bestätigen"]
]);

// Sichtbarer Text zwischen zwei Tags. Leer-Inhalte und reine Platzhalter
// ({{…}}) interessieren nicht.
const SICHTBAR = />([^<>{}]{2,200})</g;

// Attribute, die dem Nutzer ebenfalls PRÄSENTIERT werden: aria-label und
// title liest der Screenreader vor, placeholder steht im Eingabefeld.
// Ergänzt am 2026-08-13, nachdem die erste Korrekturrunde ein
// aria-label="Schritt zurueck" übrig liess — für blinde Nutzer ist das
// derselbe Fehler wie im sichtbaren Text, nur unsichtbar für den Prüfer.
// NICHT geprüft werden alt, name, id, href & Co: dort sind Kennungen und
// Pfade richtig ohne Umlaut.
const VORGELESEN = /\b(?:aria-label|title|placeholder)="([^"]{2,200})"/g;

/**
 * Prüft EINE Datei auf falsch geschriebene sichtbare Texte.
 *
 * @param {string} pfad
 * @param {string} inhalt
 * @returns {{pfad: string, funde: Array<{text: string, falsch: string, richtig: string}>}}
 */
export function pruefeSprache(pfad, inhalt = "") {
  const funde = [];
  let treffer;
  // Skript- und Stilbloecke zuerst herausnehmen: ihr Inhalt steht zwar
  // zwischen Tags, ist aber kein sichtbarer Text. Eine Variable namens
  // `zurueck` ist richtig geschrieben — ein Waechter, der sie anmahnt,
  // wird zu Recht ignoriert.
  const sichtbarerTeil = String(inhalt)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const pruefeStelle = (roh, herkunft) => {
    const text = String(roh || "").trim();
    if (!text || !/[a-zäöüß]/i.test(text)) return;
    const klein = text.toLowerCase();
    for (const [falsch, richtig] of ERSATZSCHREIBUNGEN) {
      if (!klein.includes(falsch)) continue;
      // Gegenprobe: steht die RICHTIGE Form auch drin, ist es kein Fehler
      // (z.B. eine Zeile, die beide Schreibweisen erklärt).
      if (klein.includes(richtig)) continue;
      funde.push({ text: text.slice(0, 60), falsch, richtig, herkunft });
      return; // ein Fund je Textstelle genügt
    }
  };

  SICHTBAR.lastIndex = 0;
  while ((treffer = SICHTBAR.exec(sichtbarerTeil)) !== null) pruefeStelle(treffer[1], "text");
  VORGELESEN.lastIndex = 0;
  while ((treffer = VORGELESEN.exec(sichtbarerTeil)) !== null) pruefeStelle(treffer[1], "vorgelesen");

  return { pfad, funde };
}

/**
 * Prüft alle übergebenen Dateien und fasst zusammen.
 *
 * @param {Array<{path: string, content: string}>} dateien
 */
export function pruefeSpracheAlle(dateien = []) {
  const berichte = dateien.map((d) => pruefeSprache(d.path, d.content)).filter((b) => b.funde.length);
  const gesamt = berichte.reduce((summe, b) => summe + b.funde.length, 0);
  return {
    geprueft: dateien.length,
    dateienMitFunden: berichte.length,
    funde: gesamt,
    berichte: berichte.slice(0, 20)
  };
}
