// smejj.com — Radar-Recherche: was die Konkurrenz seit dem letzten Stand dazubekam.
//
// WOZU DIESE DATEI: Der handgepflegte KONKURRENZ_STAND in
// missingFunctionDetector.js ist vom 14.08.2026. Der Radar (Nr. 04) findet
// seitdem nur Schlagzeilen — Zeitungstitel, keine geprueften Funktionen. Zwischen
// beidem klaffte die Luecke, die der Betreiber am 16.09. benannt hat: "Was gibt
// es Neues von der Konkurrenz, und was davon sollen wir uebernehmen?"
//
// Diese Liste ist die RECHERCHE dazu (16.09.2026, oeffentliche Quellen: Hersteller-
// Blogs, Release Notes, Herstellerdokumentation). Sie ist ausdruecklich KEIN
// bestaetigter Stand:
//
//   - Sie wandert NICHT automatisch in KONKURRENZ_STAND. Dort stehen nur
//     Funktionen, die der Betreiber bestaetigt hat — so war die Regel seit
//     Radar-Bericht 01, und sie bleibt.
//   - Sie erscheint als Vorschlag auf der Seite "Deine Entscheidungen". Erst ein
//     Ja macht daraus eine Aufgabe.
//
// EHRLICHKEIT ZUR QUELLENLAGE (Teil des Befunds, nicht Beiwerk): Beim Abruf
// antworteten help.openai.com, openai.com/index, perplexity.ai/changelog und
// techcommunity.microsoft.com mit 403. Die betroffenen Zeilen stuetzen sich auf
// Suchtreffer-Auszuege derselben Seiten. Das steht an jedem Eintrag, damit
// niemand eine Vermutung fuer eine Messung haelt.
export const RECHERCHE_STAND = Object.freeze({
  stand: "2026-09-16",
  zeitraum: "Juni bis Mitte September 2026",
  beobachtet: Object.freeze(["ChatGPT", "Gemini", "Claude", "Perplexity", "Copilot", "Grok", "Kimi"]),
  herkunft: "Recherche 16.09.2026 über öffentliche Quellen (Hersteller-Blogs, Release Notes, Herstellerdoku). "
    + "Kein Login, kein Scraping. Mehrere Anbieter-Seiten antworteten mit 403 — die betroffenen Zeilen sind "
    + "unten mit »Quelle war gesperrt« gekennzeichnet.",
  // Was die Recherche NICHT belegen konnte — steht hier, weil eine Fehlanzeige
  // mit Grund mehr wert ist als eine stille Luecke.
  unbelegt: Object.freeze([
    "ChatGPT »Pulse« (proaktiver Tagesbrief): keine erreichbare Erstquelle",
    "Perplexity »Model Council« und Modellwechsel mitten im Auftrag: nur Dritt-Zusammenfassungen",
    "Grok: nichts Nutzersichtbares Neues belegbar",
    "Kimi: keine offizielle Release-Note-Seite mit Datum für neue Oberflächenfunktionen"
  ])
});

/**
 * Die Kandidaten. `art` passt zu den Arten im Konkurrenz-Stand, damit ein Ja
 * spaeter ohne Umbau dort eingetragen werden kann.
 */
export const RECHERCHE_FUNKTIONEN = Object.freeze([
  {
    id: "browser-agent",
    name: "Eingebauter Browser, den die KI selbst bedient",
    anbieter: ["Claude", "ChatGPT", "Perplexity", "Copilot"],
    art: "agent",
    seit: "08/2026",
    quelle: "https://claude.com/blog/cowork-built-in-browser",
    warum: "Erledigt Aufgaben auf Webseiten ohne Schnittstelle: klicken, Formulare füllen, Portale bedienen."
  },
  {
    id: "agenten-modus",
    name: "Agentenmodus: liefert fertige Arbeit statt einer Antwort",
    anbieter: ["ChatGPT", "Claude", "Perplexity", "Kimi", "Gemini", "Copilot"],
    art: "agent",
    seit: "07/2026",
    quelle: "https://openai.com/index/chatgpt-for-your-most-ambitious-work/",
    quelleGesperrt: true,
    warum: "Arbeitet länger an einem Auftrag und gibt Tabelle, Folien, Bericht oder kleine Web-App zurück."
  },
  {
    id: "app-aktionen-buchen",
    name: "Buchen und reservieren über verbundene Dienste",
    anbieter: ["Gemini", "Copilot"],
    art: "agent",
    seit: "08/2026",
    quelle: "https://blog.google/innovation-and-ai/products/gemini-app/new-connected-apps-services-gemini-august-2026/",
    warum: "Tisch, Tickets, Mietwagen oder Termin direkt aus dem Chat, ohne App-Wechsel."
  },
  {
    id: "persoenlicher-kontext",
    name: "Antworten kennen eigene Mails, Fotos und Verlauf",
    anbieter: ["Gemini", "Copilot"],
    art: "werkzeug",
    seit: "08/2026",
    quelle: "https://blog.google/innovation-and-ai/products/gemini-app/productivity-features-gemini-live/",
    warum: "Man muss den eigenen Alltag nicht jedes Mal von vorn erklären."
  },
  {
    id: "taeglicher-brief",
    name: "Gesprochene Tagesübersicht aus Mail und Kalender",
    anbieter: ["Gemini"],
    art: "automation",
    seit: "08/2026",
    quelle: "https://blog.google/innovation-and-ai/products/gemini-app/productivity-features-gemini-live/",
    warum: "Morgens in 30 Sekunden hören, was heute ansteht."
  },
  {
    id: "postfach-per-stimme",
    name: "Postfach freihändig per Sprache verwalten",
    anbieter: ["Gemini"],
    art: "audio",
    seit: "08/2026",
    quelle: "https://blog.google/innovation-and-ai/products/gemini-app/productivity-features-gemini-live/",
    warum: "Suchen, zusammenfassen, archivieren und löschen im Gehen oder Fahren."
  },
  {
    id: "bildschirm-und-kamera-teilen",
    name: "Bildschirm oder Kamera im Sprachmodus zeigen",
    anbieter: ["Gemini", "ChatGPT", "Copilot", "Grok"],
    art: "audio",
    seit: "2025, inzwischen für alle Nutzer",
    quelle: "https://www.android.com/articles/gemini-on-android/",
    warum: "Man zeigt das Problem, statt es zu beschreiben."
  },
  {
    id: "systemweites-diktieren",
    name: "In jedes Fenster sprechen: Text, Umschreiben, Bilder",
    anbieter: ["Gemini"],
    art: "audio",
    seit: "07/2026 (macOS), 09/2026 (Windows)",
    quelle: "https://blog.google/products-and-platforms/products/gemini/gemini-drop-july-2026/",
    warum: "Der Assistent sitzt an der Schreibstelle, kein Kopieren in ein Chatfenster."
  },
  {
    id: "lern-notizbuch",
    name: "Lern-Notizbuch mit Test, Lernplan und Karteikarten",
    anbieter: ["Gemini"],
    art: "werkzeug",
    seit: "08/2026",
    quelle: "https://gemini.google/release-notes/",
    warum: "Prüft Wissenslücken ab und macht daraus einen Lernplan in Häppchen."
  },
  {
    id: "office-dateien-erstellen",
    name: "Excel, Word, PowerPoint und PDF erzeugen und ändern",
    anbieter: ["Claude", "ChatGPT", "Copilot"],
    art: "dokument",
    seit: "09/2025, für alle Nutzer seit 02/2026",
    quelle: "https://claude.com/blog/create-files",
    warum: "Man bekommt die fertige Datei mit Formeln, nicht eine Anleitung dazu."
  },
  {
    id: "webseite-veroeffentlichen",
    name: "Ergebnis mit einem Klick als Webseite online stellen",
    anbieter: ["Perplexity", "Kimi", "ChatGPT"],
    art: "code",
    seit: "08/2026",
    quelle: "https://www.perplexity.ai/changelog",
    quelleGesperrt: true,
    warum: "Aus dem Chat entsteht eine teilbare Adresse mit wählbarem Zugriffsrecht."
  },
  {
    id: "denkaufwand-waehlen",
    name: "Denkaufwand stufenweise wählen (Tempo gegen Tiefe)",
    anbieter: ["Copilot", "ChatGPT", "Kimi", "Grok"],
    art: "werkzeug",
    seit: "08/2026",
    quelle: "https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-models",
    warum: "Alltagsfragen schnell, harte Fälle tief — der Nutzer steuert Wartezeit und Kosten."
  }
]);

/**
 * Nur die Funktionen, die der bestaetigte Stand und das eigene Register noch
 * NICHT kennen. Ohne diesen Filter stuende eine Funktion doppelt auf der
 * Entscheidungsseite, sobald der Betreiber sie eingetragen hat.
 *
 * @param {{bekannteIds?: Set<string>|Array<string>}} [optionen]
 */
export function offeneRechercheFunktionen({ bekannteIds = [] } = {}) {
  const bekannt = bekannteIds instanceof Set ? bekannteIds : new Set(bekannteIds);
  return RECHERCHE_FUNKTIONEN.filter((f) => !bekannt.has(f.id));
}
