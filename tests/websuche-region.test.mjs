// smejj.com — Tests fuer Suchregion und Suchanfrage (Befund 2026-08-04).
//
// Der Befund in einem Satz: Auf die Frage nach einem Buero im Silicon Valley
// kamen ImmobilienScout24 und immobilo.de. Drei Ursachen, jede hier festgenagelt:
//   1. Der Markt stand fest im Code (kl=de-de, setlang=de, Accept-Language de).
//   2. Der ROHE Fragesatz ging als Suchbegriff hinaus (live: 0 Treffer).
//   3. Ein einziges gemeinsames Wort reichte als Relevanzbeleg — deshalb galten
//      acht spanische Microsoft-Office-Seiten als Immobilientreffer.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REGION,
  SEARCH_REGIONS,
  buildSearchQuery,
  detectSearchRegion,
  normalizeRegion,
  regionSearchParams
} from "../src/search/searchRegion.js";
import { looksBlocked, resultsLookRelevant, searchAttempts, searchWebDetailed } from "../src/search/webSearch.js";
import { AGENT_TOOLS, runAgentTool } from "../control-server/src/llm/toolLoop.js";

test("Ortsbezug schlaegt Sprache der Frage — der eigentliche Befund", () => {
  // Deutsche Frage, amerikanischer Markt. Genau dieser Fall ging schief.
  assert.equal(detectSearchRegion("ich suche eine buroe in Silikon Valley zum kaufen"), "us");
  assert.equal(detectSearchRegion("Büro kaufen Silicon Valley"), "us");
  assert.equal(detectSearchRegion("Wohnung mieten in San Jose, Kalifornien"), "us");
  assert.equal(detectSearchRegion("Was kostet ein Haus in New York?"), "us");
  // Und andersherum bleibt alles wie bisher.
  assert.equal(detectSearchRegion("Schlagzeilen Berlin heute"), "de");
  assert.equal(detectSearchRegion("Wetter in Hamburg"), "de");
});

test("ohne Ortsbezug bleibt es beim bisherigen Standard (kein Rueckschritt)", () => {
  assert.equal(DEFAULT_REGION, "de");
  assert.equal(detectSearchRegion("Wie funktioniert Photosynthese?"), "de");
  assert.equal(detectSearchRegion(""), "de");
  assert.equal(detectSearchRegion(null), "de");
});

test("bei zwei Orten gewinnt der zuletzt genannte — er nennt das Ziel", () => {
  assert.equal(detectSearchRegion("Flug von Berlin nach New York"), "us");
  assert.equal(detectSearchRegion("Flug von New York nach Berlin"), "de");
});

test("Wortgrenzen verhindern Fehltreffer in laengeren Woertern", () => {
  // "wien" darf nicht in "wiener", "rom" nicht in "roman" treffen.
  assert.equal(detectSearchRegion("Wiener Schnitzel Rezept"), "de");
  assert.equal(detectSearchRegion("Ein Roman von Kafka"), "de");
  assert.equal(detectSearchRegion("Urlaub in Wien"), "at");
});

test("weitere Maerkte werden erkannt", () => {
  assert.equal(detectSearchRegion("Hotels in London"), "uk");
  assert.equal(detectSearchRegion("Restaurant Zürich"), "ch");
  assert.equal(detectSearchRegion("Mietwagen Mallorca"), "es");
  assert.equal(detectSearchRegion("Wohnung Amsterdam"), "nl");
  assert.equal(detectSearchRegion("Immobilien Toronto"), "ca");
});

test("normalizeRegion nimmt Kuerzel, Sprachcodes und Landesnamen an", () => {
  assert.equal(normalizeRegion("US"), "us");
  assert.equal(normalizeRegion("us-en"), "us");
  assert.equal(normalizeRegion("usa"), "us");
  assert.equal(normalizeRegion("gb"), "uk");
  assert.equal(normalizeRegion("weltweit"), "wt");
  // Unbekanntes wird verworfen, nicht geraten — der Aufrufer faellt zurueck.
  assert.equal(normalizeRegion("mars"), "");
  assert.equal(normalizeRegion(""), "");
});

test("jede Region liefert vollstaendige Parameter fuer alle drei Quellen", () => {
  for (const [schluessel, eintrag] of Object.entries(SEARCH_REGIONS)) {
    assert.match(eintrag.ddg, /^[a-z]{2}-[a-z]{2}$/, `${schluessel}: DuckDuckGo-kl fehlt oder ist ungueltig`);
    assert.match(eintrag.cc, /^[A-Z]{2}$/, `${schluessel}: Bing-cc fehlt`);
    assert.ok(eintrag.lang.length >= 2, `${schluessel}: Sprache fehlt`);
    assert.ok(eintrag.accept.includes(";q="), `${schluessel}: Accept-Language fehlt`);
  }
  // Unbekannte Region faellt fail-safe auf den Standard, nie auf undefined.
  assert.equal(regionSearchParams("mars").region, "de");
  assert.equal(regionSearchParams("us").ddg, "us-en");
});

// Die eigentliche Regressionsbremse: fehlt an EINER Quelle der Parameter,
// antwortet sie nach der IP des Servers. Genau so kamen spanische Treffer.
test("alle drei Suchmaschinen bekommen den Markt mitgegeben", () => {
  const versuche = searchAttempts("office for sale San Jose", regionSearchParams("us"));
  assert.equal(versuche.length, 3);
  assert.ok(versuche[0].url.includes("kl=us-en"), "DuckDuckGo HTML ohne Markt");
  assert.ok(versuche[1].url.includes("kl=us-en"), "DuckDuckGo Lite ohne Markt — das war die Luecke");
  assert.ok(versuche[2].url.includes("setlang=en"), "Bing ohne Sprache");
  assert.ok(versuche[2].url.includes("cc=US"), "Bing ohne Land");
  assert.ok(!versuche.some((v) => /kl=de-de|setlang=de/.test(v.url)), "kein fest verdrahtetes Deutsch mehr");
});

test("Suchanfrage wird aus dem Satz gebaut, nicht der Satz gesucht", () => {
  const roh = "ich suche eine buroe: 1 oder 2 Zimmer in Eine Neue Buorohaus, in Silikon Valley zum kaufen. Kannst du mir finden";
  const anfrage = buildSearchQuery(roh);
  assert.ok(!/ich|suche|kannst|mir|finden/i.test(anfrage), `Floskeln blieben stehen: ${anfrage}`);
  assert.ok(/Silikon/i.test(anfrage) && /Valley/i.test(anfrage), "der Ort muss erhalten bleiben");
  assert.ok(/kaufen/i.test(anfrage), "die Absicht muss erhalten bleiben");
  assert.ok(anfrage.split(" ").length <= 12, "lange Saetze verwaessern jede Suchmaschine");
});

test("Suchanfrage ist fail-safe und verhindert nie eine Suche", () => {
  // Nur Floskeln: dann lieber die Originalworte als gar nichts.
  assert.ok(buildSearchQuery("kannst du mir bitte").length > 0);
  assert.equal(buildSearchQuery(""), "");
  assert.equal(buildSearchQuery(null), "");
  // Fachbegriffe und Zahlen bleiben unangetastet.
  assert.equal(buildSearchQuery("Bitcoin Kurs heute"), "Bitcoin Kurs heute");
});

// Genau der live gemessene Fehlfall: acht microsoft.com-Treffer auf eine
// Immobilienfrage, durchgelassen wegen des einen Wortes "office".
test("ein einziges gemeinsames Wort reicht nicht mehr als Relevanzbeleg", () => {
  const microsoft = [
    { title: "Office 365 Login", url: "https://www.office.com/?omkt=es-mx", snippet: "Inicia sesion" },
    { title: "Microsoft Office", url: "https://www.microsoft.com/es-es/microsoft-365", snippet: "Descargar" }
  ];
  assert.equal(resultsLookRelevant("office condo for sale San Jose CA", microsoft), false);

  const echt = [
    { title: "Office Space for Sale - San Jose, CA", url: "https://www.loopnet.com/search/office/san-jose-ca/for-sale/", snippet: "12 listings" }
  ];
  assert.equal(resultsLookRelevant("office condo for sale San Jose CA", echt), true);
});

test("kurze Anfragen bleiben bei einem Treffer — sonst faellt Bewaehrtes durch", () => {
  // Zwei pruefbare Begriffe: ein Treffer genuegt weiterhin (Bestandsverhalten).
  assert.equal(
    resultsLookRelevant("Schlagzeilen Berlin", [{ title: "rbb24 Berlin", url: "https://rbb24.de/", snippet: "" }]),
    true
  );
  assert.equal(
    resultsLookRelevant("Zoo Berlin", [{ title: "Tierpark", url: "https://x.de/", snippet: "Der Zoo in Berlin oeffnet" }]),
    true
  );
});

// Messung 2026-08-04: Vier von sechs Standardfragen lieferten live null Treffer,
// und nirgends war zu sehen warum. Eine Sperrseite sah aus wie "nichts gefunden".
test("eine Sperrseite wird als Sperre erkannt, nicht als leeres Ergebnis", () => {
  assert.equal(looksBlocked("<html><body>Our systems have detected unusual traffic</body></html>"), true);
  assert.equal(looksBlocked("<html><body>anomaly detected, please try again</body></html>"), true);
  assert.equal(looksBlocked("<html><body>Are you a robot?</body></html>"), true);
  assert.equal(looksBlocked("<html><body>Treffer eins, Treffer zwei</body></html>"), false);
  // Grosse Seiten sind echte Trefferlisten — der Sperrhinweis darf dort nicht
  // durch ein zufaellig vorkommendes Wort ("captcha") ausloesen.
  assert.equal(looksBlocked("x".repeat(50_000) + "captcha"), false);
  assert.equal(looksBlocked(""), false);
});

test("der Suchbefund nennt Markt und Quelle, nicht nur die Trefferzahl", async () => {
  const leer = await searchWebDetailed("");
  assert.deepEqual(leer.results, []);
  assert.equal(leer.source, "");
  assert.equal(leer.cached, false);
  assert.ok(Array.isArray(leer.attempts));
});

test("jeder Suchversuch traegt einen Quellennamen", () => {
  const namen = searchAttempts("test", regionSearchParams("de")).map((a) => a.source);
  assert.deepEqual(namen, ["duckduckgo-html", "duckduckgo-lite", "bing"]);
});

test("web_suche nimmt den Markt als Parameter entgegen", async () => {
  assert.equal(AGENT_TOOLS[1].function.name, "web_suche");
  const eigenschaften = AGENT_TOOLS[1].function.parameters.properties;
  assert.ok(eigenschaften.region, "ohne region-Parameter kann das Modell den Markt nicht waehlen");
  assert.ok(/us/.test(eigenschaften.region.description), "die Kuerzel muessen in der Beschreibung stehen");
  assert.ok(
    /Sprache und im Markt des ZIELS/.test(AGENT_TOOLS[1].function.description),
    "die Regel 'Markt des Ziels, nicht Sprache der Frage' ist die eigentliche Korrektur"
  );

  let gesehen = null;
  await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"office for sale San Jose","region":"us"}' } },
    {
      sucheImpl: async (anfrage, optionen) => {
        gesehen = { anfrage, optionen };
        return [{ title: "LoopNet", url: "https://www.loopnet.com/x", snippet: "office for sale san jose" }];
      }
    }
  );
  assert.equal(gesehen.optionen.region, "us");
  assert.equal(gesehen.anfrage, "office for sale San Jose");
});

test("eine unbekannte Regionsangabe des Modells verhindert keine Suche", async () => {
  let gesehen = null;
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"Schlagzeilen Berlin","region":"mars"}' } },
    {
      sucheImpl: async (anfrage, optionen) => {
        gesehen = optionen;
        return [{ title: "rbb24", url: "https://rbb24.de/", snippet: "Berlin" }];
      }
    }
  );
  assert.equal(gesehen.region, undefined, "unbekannte Region wird verworfen, nicht durchgereicht");
  assert.match(ergebnis, /rbb24/);
});

// Befund 2026-08-04, live: Lieferte keine Quelle etwas, formulierte das Modell
// die Anfrage immer wieder um, verbrauchte alle drei Runden und brach mitten im
// Satz ab. Der Nutzer sah eine angefangene Antwort und dachte, es haenge.
test("sind alle Quellen gesperrt, wird das Modell zum Aufhoeren angewiesen", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"office san jose","region":"us"}' } },
    {
      sucheImpl: async () => ({
        results: [],
        attempts: [
          { source: "duckduckgo-html", parsed: 0, status: "gesperrt" },
          { source: "duckduckgo-lite", parsed: 0, status: "gesperrt" },
          { source: "bing", parsed: 0, status: "keine antwort" }
        ]
      })
    }
  );
  assert.match(ergebnis, /nicht verfuegbar/);
  assert.match(ergebnis, /Suche NICHT erneut/, "ein anderer Suchbegriff hilft gegen eine Sperre nicht");
  assert.match(ergebnis, /duckduckgo-html/, "die geprueften Quellen muessen benannt sein");
});

test("themenfremde Treffer sind KEINE Sperre — hier darf umformuliert werden", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"office san jose","region":"us"}' } },
    {
      sucheImpl: async () => ({
        results: [],
        attempts: [{ source: "bing", parsed: 10, status: "themenfremd" }]
      })
    }
  );
  assert.match(ergebnis, /Keine Treffer/);
  assert.ok(!/Suche NICHT erneut/.test(ergebnis));
});

test("eine blosse Trefferliste bleibt gueltig (Non-Regression der Schnittstelle)", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"Bitcoin Kurs"}' } },
    { sucheImpl: async () => [{ title: "finanzen.net", url: "https://www.finanzen.net/x", snippet: "Bitcoin Euro" }] }
  );
  assert.match(ergebnis, /finanzen\.net/);
});

test("das Werkzeugergebnis fordert anklickbare Trefferadressen", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"office san jose","region":"us"}' } },
    { sucheImpl: async () => [{ title: "LoopNet", url: "https://www.loopnet.com/x", snippet: "" }] }
  );
  assert.match(ergebnis, /Markt us/);
  assert.match(ergebnis, /anklicken/, "ohne diese Anweisung nennt das Modell nur die Portal-Startseiten");
  assert.match(ergebnis, /Erfinde keine Adressen/);
});

// Befund 2026-08-04, zweiter Livedurchlauf: Auf "commercial office for sale
// Santa Clara" lieferte Bing acht Treffer — LoopNet und Crexi (richtig), aber
// auch das Merriam-Webster-Woerterbuch, das Cambridge Dictionary und eine
// TV-Werbeseite. ALLE acht gingen ans Modell.
//
// Ursache war nicht der Schwellwert, sondern die Bauart: die Pruefung war ein
// Tor fuer die GANZE Liste. Ein guter Treffer machte sie gueltig, der Muell fuhr
// als blinder Passagier mit.
test("ein guter Treffer zieht keine themenfremden mit", async () => {
  const { relevanteTreffer } = await import("../src/search/webSearch.js");
  const echteBingAntwort = [
    { title: "COMMERCIAL Definition & Meaning - Merriam-Webster", url: "https://www.merriam-webster.com/dictionary/commercial", snippet: "the meaning of commercial" },
    { title: "Browse TV Commercials & TV Ads - iSpot", url: "https://www.ispot.tv/browse", snippet: "TV commercials" },
    { title: "LoopNet: #1 in Commercial Real Estate for Sale & Lease", url: "https://www.loopnet.com/", snippet: "properties for sale" },
    { title: "COMMERCIAL | English meaning - Cambridge Dictionary", url: "https://dictionary.cambridge.org/dictionary/english/commercial", snippet: "commercial definition" },
    { title: "Santa Clara, CA Commercial Real Estate For Sale", url: "https://www.crexi.com/properties/CA/Santa_Clara", snippet: "office space for sale" }
  ];
  const behalten = relevanteTreffer("commercial office for sale Santa Clara", echteBingAntwort);
  const adressen = behalten.map((t) => t.url);
  assert.ok(adressen.some((u) => u.includes("loopnet")), "der richtige Treffer bleibt");
  assert.ok(adressen.some((u) => u.includes("crexi")), "der zweite richtige Treffer bleibt");
  assert.ok(!adressen.some((u) => u.includes("merriam-webster")), "das Woerterbuch faellt raus");
  assert.ok(!adressen.some((u) => u.includes("cambridge")), "das zweite Woerterbuch faellt raus");
  assert.ok(!adressen.some((u) => u.includes("ispot")), "die Werbeseite faellt raus");
  // Das Tor selbst bleibt unveraendert: die Quelle gilt weiter als brauchbar.
  assert.equal(resultsLookRelevant("commercial office for sale Santa Clara", echteBingAntwort), true);
});

test("bei ein bis zwei Begriffen bleibt alles Passende erhalten (Non-Regression)", async () => {
  const { relevanteTreffer } = await import("../src/search/webSearch.js");
  const treffer = [
    { title: "rbb24 - Nachrichten aus Berlin", url: "https://www.rbb24.de/", snippet: "" },
    { title: "Voellig anderes Thema", url: "https://beispiel.de/", snippet: "nichts davon" }
  ];
  const behalten = relevanteTreffer("Schlagzeilen Berlin", treffer);
  assert.equal(behalten.length, 1);
  assert.equal(behalten[0].url, "https://www.rbb24.de/");
  // Ohne pruefbare Begriffe wird NICHT gefiltert — sonst fiele eine gueltige
  // Suche komplett durch. ("2026" waere UEBRIGENS einer: vier Zeichen, kein
  // Stoppwort. Nur zu kurze Woerter zaehlen nicht.)
  assert.equal(relevanteTreffer("wie ist das", treffer).length, 2);
  assert.equal(relevanteTreffer("2026", treffer).length, 0, "eine Jahreszahl IST ein pruefbarer Begriff");
  assert.deepEqual(relevanteTreffer("test", []), []);
  assert.deepEqual(relevanteTreffer("test", null), []);
});

// --- Deutsche Komposita (Befund 2026-08-05) ---------------------------------
//
// GEMESSEN gegen die Live-Kette, Frage "Vergleiche die Einwohnerzahl von Wien
// und Zuerich": die ersten VIER Suchen lieferten 0 Treffer, die fuenfte und
// sechste (auf Englisch) je 6. Das Modell schoepfte alle Runden aus, nur um
// schliesslich die Sprache zu wechseln — rund 6 von 16 Sekunden verschenkt.
//
//   4324 ms  suche  treffer=0  Einwohnerzahl Wien 2024
//   4743 ms  suche  treffer=0  Einwohnerzahl Zuerich 2024
//   6979 ms  suche  treffer=0  Wien Bevoelkerung 2024
//   7358 ms  suche  treffer=0  Zuerich Bevoelkerung 2024
//   9344 ms  suche  treffer=6  Wien population
//   9818 ms  suche  treffer=6  Zurich population
//
// Nicht die Suchquelle war schuld, sondern relevanteTreffer: bei 3 Begriffen
// muessen 2 wortgleich stehen, und "Einwohnerzahl" steht nie so im Text.

const WIEN_TREFFER = [
  { title: "Wien – Wikipedia", url: "https://de.wikipedia.org/wiki/Wien", snippet: "Wien ist die Hauptstadt Oesterreichs und zaehlt rund 2,0 Millionen Einwohner." },
  { title: "Microsoft 365", url: "https://microsoft.com/de/microsoft-365", snippet: "Office-Apps und Cloud-Dienste im Abonnement." }
];

test("ein deutsches Kompositum findet seinen Treffer ueber den Wortstamm", async () => {
  const { relevanteTreffer } = await import("../src/search/webSearch.js");
  // Vor dem Fix: 0 Treffer. "wien" traf, "einwohnerzahl" nicht — 1 von 2 noetigen.
  const behalten = relevanteTreffer("Einwohnerzahl Wien 2024", WIEN_TREFFER);
  assert.equal(behalten.length, 1, "der Wikipedia-Treffer beantwortet die Frage und muss bleiben");
  assert.match(behalten[0].url, /wikipedia\.org\/wiki\/Wien/);
});

test("die Mindestpunktzahl bleibt: Muell faellt weiter durch", async () => {
  const { relevanteTreffer, resultsLookRelevant } = await import("../src/search/webSearch.js");
  // Der Schutz gegen blinde Passagiere ist NICHT gelockert worden — nur die
  // Frage, wann ein einzelner Begriff als getroffen gilt.
  assert.equal(relevanteTreffer("Einwohnerzahl Wien 2024", WIEN_TREFFER).some((e) => /microsoft/.test(e.url)), false);
  assert.equal(resultsLookRelevant("office condo for sale San Jose CA", [
    { title: "Microsoft 365", url: "https://microsoft.com/de/microsoft-365", snippet: "Office-Apps im Abonnement." }
  ]), false);
});

test("kurze Woerter treffen NUR wortgleich — ein Stamm waere Zufall", async () => {
  const { begriffTrifft } = await import("../src/search/webSearch.js");
  // "sale" duerfte sonst ueber "sales" hinaus alles Moegliche treffen.
  assert.equal(begriffTrifft("salzburg tourismus", "sale"), false);
  assert.equal(begriffTrifft("condo for sale", "sale"), true);
});

test("der Stamm ist lang genug, um zwei fremde Woerter zu trennen", async () => {
  const { begriffTrifft } = await import("../src/search/webSearch.js");
  // 60 % des Wortes, mindestens 6 Zeichen.
  assert.equal(begriffTrifft("wien zaehlt 2 millionen einwohner", "einwohnerzahl"), true);
  assert.equal(begriffTrifft("die bevoelkerung waechst", "bevoelkerungszahl"), true);
  // "einwohnerzahl" darf NICHT ueber einen zu kurzen Anfang irgendwo treffen.
  assert.equal(begriffTrifft("ein haus am see", "einwohnerzahl"), false);
});
