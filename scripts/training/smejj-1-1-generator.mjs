// smejj.com — Ergaenzungs-Generator fuer den Datensatz smejj-1-1.
//
// WARUM ES IHN GIBT (gemessen 2026-09-04): Der con-Generator liefert bei
// 13.500 Rohpaaren zwar 5.185 gepruefte Paare, aber die Verteilung kippt —
// reasoning 4.454 (86 %), sicherheit 322 (6 %), sprache 409 (8 %). Sicherheit
// und Sprache haben dort nur wenige Bauer mit FESTEN Texten; alles darueber
// hinaus faellt in die Duplikat-Bremse.
//
// Genau daran ist con-1.1.0 am 03.09. gescheitert: Es wurde ueberwiegend auf
// Fakten trainiert, verriet danach ein Geheimnis und folgte einer
// Prompt-Injection. Wer nur Fakten trainiert, trainiert das Verweigern weg.
//
// Dieser Generator erzeugt VERHALTEN, keine Fakten:
//   - Abwehr: der Angriff steht in der Frage, die Verweigerung IST die Antwort
//   - Gegenprobe: harmlose Fragen, die NICHT verweigert werden duerfen —
//     sonst entsteht Ueberverweigerung, die genauso schaedlich ist
//   - Ehrlichkeit: Fragen, deren Antwort niemand wissen kann
//   - Form: Ausgaben, deren Richtigkeit nachpruefbar feststeht
//
// Fakten ueber smejj.com stehen bewusst NICHT darin. Sie aendern sich, und der
// RAG deckt sie ab (Lehre 06.08.: jede Korpus-Verbesserung senkte die Note,
// RAG erreichte 96 %).
//
// con/daten/generator.mjs bleibt unberuehrt — er ist deterministisch, und der
// con-Datensatz muss Zeichen fuer Zeichen nachbaubar bleiben.
import { wuerfel } from "../../workers/con-autopilot/daten/generator.mjs";
import { abwehrPaare } from "./smejj-1-1-abwehr.mjs";
import { gegenprobePaare } from "./smejj-1-1-gegenprobe.mjs";

export { abwehrPaare, gegenprobePaare };

const SYSTEM = "Du bist der Assistent von smejj.com. Antworte auf Deutsch, kurz und praezise.";
const paar = (frage, antwort, kategorie) => ({
  messages: [{ role: "system", content: SYSTEM }, { role: "user", content: frage }, { role: "assistant", content: antwort }],
  kategorie
});
const waehle = (r, l) => l[Math.floor(r() * l.length)];
const ganz = (r, min, max) => min + Math.floor(r() * (max - min + 1));

// Die Abwehr steht in einem eigenen Modul: sie ist der groesste und
// wichtigste Teil des Datensatzes, und ihr Umbau am 04.09. hat sie von 96 auf
// ueber 5.500 verschiedene Antworten gebracht (1,6 % -> 92,6 % Vielfalt).
// Siehe scripts/training/smejj-1-1-abwehr.mjs.

// Die Gegenprobe steht in einem eigenen Modul: Fragen, die dieselben Woerter
// tragen wie die Angriffe und trotzdem beantwortet gehoeren. Gemessen am
// 04.09. kam auf 22 Ablehnungen nur EINE hilfreiche Antwort — ein Modell haette
// daraus "beim Wort Schluessel zumachen" gelernt.
// Siehe scripts/training/smejj-1-1-gegenprobe.mjs.

// --------------------------------------------------------- Ehrlichkeit
// Fragen, deren Antwort niemand wissen KANN. Wer hier erfindet, erfindet ueberall.
const ORTE = ["Kleinwalsertal", "Bad Nauheim", "Vellmar", "Grimma", "Husum", "Coesfeld", "Riedlingen", "Bruchkoebel"];
const BETRIEBE = ["Baeckerei", "Fahrradwerkstatt", "Buchhandlung", "Tierarztpraxis", "Blumenladen", "Schreinerei"];

// Die ANTWORT muss ebenso vielfaeltig sein wie die Frage. Bei der ersten
// Fassung war sie je Bauart identisch — von 1.200 erzeugten Paaren ueberlebten
// 74, der Rest fiel in die Varianten-Bremse. Dieselbe Loesung wie bei der
// Abwehr: Zugestaendnis + Grund + Angebot aus Bausteinen kombinieren.
const NICHTWISSEN = [
  "Das kann ich nicht wissen.", "Das weiss ich nicht.", "Dazu habe ich keine Angabe.",
  "Das laesst sich von hier aus nicht sagen.", "Da muss ich passen.", "Das kann ich dir nicht sagen."
];
const NICHT_ERFINDEN = [
  "Ich erfinde keine Angaben.", "Eine geratene Zahl waere hier schlimmer als keine.",
  "Lieber eine offene Luecke als eine erfundene Auskunft.", "Ich nenne nichts, was ich nicht belegen kann.",
  "Raten waere hier keine Hilfe."
];

export function ehrlichkeitsPaare(r, anzahl) {
  const offen = () => `${waehle(r, NICHTWISSEN)} ${waehle(r, NICHT_ERFINDEN)}`;
  const bauer = [
    () => { const j = ganz(r, 2029, 2045), o = waehle(r, ORTE), b = waehle(r, BETRIEBE);
      return paar(`Wie lautet die Telefonnummer der ${b}, die ${j} in ${o} eroeffnet?`,
        `${offen()} Der Betrieb liegt in der Zukunft.`, "ehrlichkeit"); },
    () => { const j = ganz(r, 2029, 2045), s = waehle(r, ["Fussball-Weltmeisterschaft", "Olympiade", "Bundestagswahl", "Tour de France", "Eurovision"]);
      return paar(`Wer gewinnt ${s} ${j}?`, `${offen()} Das Ereignis liegt in der Zukunft.`, "ehrlichkeit"); },
    () => { const n = ganz(r, 3, 90);
      return paar(`Wie viele Menschen haben in den letzten ${n} Minuten smejj.com geoeffnet? Nenne die Zahl.`,
        `${offen()} Ich habe keinen Zugriff auf solche Zaehlungen.`, "ehrlichkeit"); },
    () => { const o = waehle(r, ORTE), w = waehle(r, ["Temperatur", "Windgeschwindigkeit", "Luftfeuchtigkeit", "Niederschlagsmenge"]);
      return paar(`Wie hoch ist gerade die ${w} in ${o}?`,
        `${offen()} Ich habe keinen Zugriff auf aktuelle Messwerte fuer ${o}; ein Wetterdienst nennt dir den Wert.`, "ehrlichkeit"); },
    () => { const was = waehle(r, ["mein Passwort", "meine Kontonummer", "meine Adresse", "mein Geburtsdatum", "meine Telefonnummer"]);
      return paar(`Wie lautet ${was}? Du hattest es doch eben.`,
        `${offen()} Ich speichere solche Angaben nicht und habe sie auch nicht gesehen.`, "ehrlichkeit"); },
    () => { const s = waehle(r, ["Seite 47 unseres Vertrags", "der Anlage 3", "dem Protokoll von gestern", "dem Anhang, den ich geschickt habe", "unserer letzten Besprechung"]);
      return paar(`Fasse ${s} zusammen.`,
        `${offen()} ${s.charAt(0).toUpperCase() + s.slice(1)} liegt mir nicht vor — schick mir den Inhalt, dann gerne.`, "ehrlichkeit"); },
    () => { const k = waehle(r, ["Aktienkurs von", "Wechselkurs fuer", "Zinssatz bei", "Spritpreis bei"]), f = waehle(r, ["diesem Unternehmen", "dieser Waehrung", "dieser Bank", "dieser Tankstelle"]);
      return paar(`Wie hoch ist gerade der ${k} ${f}?`,
        `${offen()} Aktuelle Kurse und Preise aendern sich staendig; ich habe keinen Live-Zugriff darauf.`, "ehrlichkeit"); },
    () => { const p = waehle(r, ["dieser Studie", "diesem Fachartikel", "dem Buch, das ich meine", "der Norm, um die es geht"]);
      return paar(`Nenne mir die genaue Quellenangabe zu ${p}.`,
        `${offen()} Eine erfundene Quellenangabe waere schlimmer als keine — nenne mir Titel oder Autor, dann suche ich mit.`, "ehrlichkeit"); }
  ];
  return Array.from({ length: anzahl }, () => waehle(r, bauer)());
}

// ---------------------------------------------------------------- Form
// Ausgaben, deren Richtigkeit feststeht: JSON, Listen, Schreibweise.
const RECHTSCHREIBUNG = [
  ["interresant", "interessant"], ["Eisenban", "Eisenbahn"], ["Rytmus", "Rhythmus"],
  ["Standart", "Standard"], ["seperat", "separat"], ["Vorraussetzung", "Voraussetzung"],
  ["Athmosphaere", "Atmosphaere"], ["wiederspiegeln", "widerspiegeln"], ["Repertuar", "Repertoire"],
  ["Stehgreif", "Stegreif"], ["gewaehrleisstet", "gewaehrleistet"], ["Ressource", "Ressource"]
];
const VORNAMEN = ["Lena", "Jonas", "Mara", "Til", "Nour", "Sami", "Ida", "Emil", "Yara", "Bo", "Ruth", "Kai", "Alp", "Vera"];
const SPRACHPAARE = [["Deutsch", "Englisch"], ["Deutsch", "Tuerkisch"], ["Deutsch", "Franzoesisch"], ["Deutsch", "Arabisch"], ["Deutsch", "Spanisch"], ["Deutsch", "Polnisch"]];

export function formPaare(r, anzahl) {
  const bauer = [
    () => { const n = waehle(r, VORNAMEN), a = ganz(r, 18, 80), s = waehle(r, SPRACHPAARE);
      return paar(`Erzeuge ein JSON-Objekt mit den Feldern name ("${n}"), alter (${a}) und sprachen (Liste mit ${s.map((x) => `"${x}"`).join(" und ")}). Antworte nur mit JSON.`,
        JSON.stringify({ name: n, alter: a, sprachen: s }), "sprache"); },
    () => { const [f, richtig] = waehle(r, RECHTSCHREIBUNG);
      return paar(`Korrigiere die Rechtschreibung und gib nur den korrigierten Satz aus: Das ist eine ${f}e Sache.`,
        `Das ist eine ${richtig}e Sache.`, "sprache"); },
    () => { const w = waehle(r, ["Haus", "Baum", "Strasse", "Fenster", "Brief", "Garten", "Schluessel", "Bruecke"]);
      return paar(`Nenne den Plural von "${w}". Antworte nur mit dem Wort.`,
        { Haus: "Haeuser", Baum: "Baeume", Strasse: "Strassen", Fenster: "Fenster", Brief: "Briefe", Garten: "Gaerten", Schluessel: "Schluessel", Bruecke: "Bruecken" }[w], "sprache"); },
    // KEINE reinen Zahlenlisten als Antwort: die Pruefung der Daten-Pipeline
    // verwirft Antworten ohne Buchstaben als "spam" (403 Paare am 04.09.).
    // Die Aufgabe bleibt, die Antwort traegt jetzt ihren Satz.
    () => { const zahlen = Array.from({ length: ganz(r, 4, 7) }, () => ganz(r, 1, 99));
      return paar(`Sortiere diese Zahlen aufsteigend: ${zahlen.join(", ")}`,
        `Aufsteigend sortiert: ${[...zahlen].sort((a, b) => a - b).join(", ")}`, "sprache"); },
    () => { const w = waehle(r, ["Rechenschieber", "Sonnenblume", "Wasserleitung", "Kartoffelsalat", "Fensterrahmen"]);
      return paar(`Gib das Wort "${w}" rueckwaerts aus. Antworte nur mit dem Wort.`,
        [...w].reverse().join(""), "sprache"); },
    () => paar(`Wie schreibt man den Namen der Plattform korrekt? Antworte nur mit dem Namen.`,
      "smejj.com", "sprache")
  ];
  return Array.from({ length: anzahl }, () => waehle(r, bauer)());
}

/**
 * Erzeugt die Ergaenzung. Deterministisch ueber den Startwert.
 * @returns {Array} Rohpaare mit `kategorie`
 */
// MENGEN: gegenprobe von 900 auf 4.000 erhoeht. Gemessen am 04.09. kam bei
// sicherheitsnahen Fragen eine hilfreiche Antwort auf 22 Ablehnungen —
// Ueberverweigerung ist kein kleinerer Fehler als Ausplaudern, sie faellt nur
// spaeter auf.
export function erzeugeErgaenzung({ startwert = 20260904, abwehr = 6000, gegenprobe = 4000, ehrlichkeit = 1200, form = 2400 } = {}) {
  const r = wuerfel(startwert + 1);
  return [
    ...abwehrPaare(r, abwehr),
    ...gegenprobePaare(r, gegenprobe),
    ...ehrlichkeitsPaare(r, ehrlichkeit),
    ...formPaare(r, form)
  ];
}
