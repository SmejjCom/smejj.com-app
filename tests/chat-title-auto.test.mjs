// Prueft die Titel-Bereinigung aus public/chat-title-auto.js.
//
// Warum ein eigener Test: Der Titel kommt aus einem Sprachmodell und landet
// unveraendert in der Oberflaeche. Auf "Antworte NUR mit dem Titel" kommt
// gemessen trotzdem Vorrede ("Hier ist ein passender Titel:"), Markdown,
// Anfuehrungszeichen oder gleich ein ganzer Absatz. Ohne harte Grenzen zerlegt
// so eine Antwort die Kartenliste.
//
// Das Modul selbst laesst sich in Node nicht importieren (es zieht config.js
// und chat-stream.js aus dem Browser). Der Test liest darum die Quelle und
// wertet genau den Bereinigungsblock aus — schlaegt fehl, sobald der Block
// verschwindet oder umbenannt wird.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFileSync } from "node:fs";

const QUELLE = readFileSync(new URL("../public/chat-title-auto.js", import.meta.url), "utf8");

function ladeBereinige() {
  const start = QUELLE.indexOf("function istVorrede");
  const ende = QUELLE.indexOf("// Antwort der Bruecke");
  assert.ok(start > -1 && ende > start, "Bereinigungsblock in chat-title-auto.js nicht gefunden");
  const block = QUELLE.slice(start, ende);
  const fabrik = new Function(`
    const MAX_WOERTER = 6;
    const MAX_ZEICHEN = 60;
    ${block}
    return bereinige;
  `);
  return fabrik();
}

const bereinige = ladeBereinige();

test("die Grenzen halten, egal was das Modell schickt", () => {
  const eingaben = [
    "Bank of America Ueberweisung",
    "Eine sehr ausfuehrliche Zusammenfassung dieser Unterhaltung ueber Immobilienfinanzierung in Berlin",
    "Donaudampfschifffahrtsgesellschaftskapitaenswitwenrentenversicherungsanstalt",
    "Kurz\nZWEITE ZEILE\nDRITTE ZEILE",
    "",
    null,
    undefined
  ];
  for (const eingabe of eingaben) {
    const titel = bereinige(eingabe);
    assert.ok(titel.length <= 60, `zu lang: ${titel.length}`);
    assert.ok(titel.split(" ").filter(Boolean).length <= 6, `zu viele Woerter: ${titel}`);
    assert.ok(!titel.includes("\n"), "ein Titel darf nie mehrzeilig sein");
    assert.equal(typeof titel, "string");
  }
});

test("Markdown, Anfuehrungszeichen und Schlusspunkt fallen weg", () => {
  assert.equal(bereinige("**Buerosuche in Berlin**"), "Buerosuche in Berlin");
  assert.equal(bereinige("## Kontoeroeffnung bei der Bank"), "Kontoeroeffnung bei der Bank");
  assert.equal(bereinige("- Wetter morgen in Berlin"), "Wetter morgen in Berlin");
  assert.equal(bereinige('"Wetter in Silicon Valley"'), "Wetter in Silicon Valley");
  assert.equal(bereinige("“Immobilienfinanzierung Berlin”"), "Immobilienfinanzierung Berlin");
  assert.equal(bereinige("„Kontoeroeffnung pruefen“"), "Kontoeroeffnung pruefen");
  assert.equal(bereinige("Test von iMild Funktionen."), "Test von iMild Funktionen");
});

test("eine Vorrede ist kein Titel", () => {
  // Gemessenes Verhalten: das Modell schiebt gelegentlich eine Einleitung vor.
  assert.equal(bereinige("Hier ist ein passender Titel:\nBank of America Ueberweisung"), "Bank of America Ueberweisung");
  assert.equal(bereinige("Titel: Wetterabfrage Berlin"), "Wetterabfrage Berlin");
  // Steht NUR Vorrede da, gibt es keinen Titel — dann bleibt der Regel-Titel.
  assert.equal(bereinige("Hier ist der Titel:"), "");
  assert.equal(bereinige("Vorschlag:"), "");
});

test("spitze Klammern bleiben nicht im Titel stehen", () => {
  // Angezeigt wird ohnehin nur Text (textContent), das ist kein Ausfuehrungs-
  // risiko — aber ein Titel soll nicht wie kaputtes Markup aussehen.
  const titel = bereinige("<img src=x onerror=alert(1)>");
  assert.ok(!titel.includes("<") && !titel.includes(">"), titel);
});

test("das Modul bleibt fail-safe und ruecksichtsvoll", () => {
  // Diese Zusagen tragen den Betrieb: ohne sie wuerde ein Ansturm von Anfragen
  // das geteilte Kontingent der Bruecke aufbrauchen.
  assert.match(QUELLE, /const MIN_NACHRICHTEN = 2/, "Frage und Antwort genuegen fuer einen Titel");
  // Eine kurze, vollstaendige Frage IST der beste Titel — gemessen wurde
  // "Was ist 7 mal 8?" sonst zu "Mathematische Multiplikationsergebnisse".
  assert.match(QUELLE, /const KURZ_GENUG_ZEICHEN = \d+/, "kurze Fragen duerfen ihren Titel behalten");
  assert.match(QUELLE, /frage\.length <= KURZ_GENUG_ZEICHEN && !BALLAST\.test\(frage\)/, "Sparfilter fehlt");
  // Nur erste Frage + erste Antwort. Mit mehr Kontext mischte das Modell
  // gemessen ein Nebenthema in den Titel ("Fahrradfahren und Code" fuer einen
  // Chat ueber parseBudget) — die Chats wechseln das Thema oft ab Nachricht 2.
  assert.match(QUELLE, /const NACHRICHTEN_JE_ANFRAGE = 2/, "mehr Kontext schleppt Nebenthemen ein");
  assert.match(QUELLE, /const MAX_JE_RUNDE = \d+/, "Obergrenze je Runde fehlt");
  assert.match(QUELLE, /signal: abbruch\.signal/, "Anfrage ohne Zeitbudget");
  assert.match(QUELLE, /document\.hidden/, "im Hintergrund muss die Arbeit ruhen");
  assert.match(QUELLE, /chat\.titleEdited === true/, "von Hand vergebene Titel muessen geschuetzt sein");
});

test("Kennungen der Importe passen zu den uebrigen Modulen (Befund F-07)", () => {
  // Ein abweichender Spezifizierer erzeugt eine ZWEITE Modulinstanz.
  //
  // GEAENDERT 2026-08-20: Die Marke stand hier als fester Wert ("b52"). Damit
  // pruefte der Test nicht die EIGENSCHAFT ("ueberall dieselbe Kennung"),
  // sondern eine Zahl — und jede noetige Markenerhoehung machte ihn rot,
  // obwohl nichts kaputt war. Genau das ist am 2026-08-09 dreimal passiert.
  // Jetzt wird gegen den Stand der anderen Module verglichen: der Test bleibt
  // wahr, wenn die Kette sauber nachgezogen wurde, und wird rot, sobald zwei
  // Kennungen auseinanderlaufen.
  const andersWo = fs.readFileSync("public/chat-history-view.js", "utf8");
  const marke = /from "\/assets\/chat-store\.js(\?v=[^"]*)?"/.exec(andersWo)?.[1] || "";
  assert.ok(marke, "Vergleichsmodul laedt chat-store.js nicht mehr — Test anpassen");
  assert.ok(QUELLE.includes(`from "/assets/chat-store.js${marke}"`),
    `chat-store.js wird hier unter einer ANDEREN Kennung geladen als in chat-history-view.js (${marke})`);
  // GEAENDERT 2026-09-04: Geprueft wurde die statische Form `from "…"`. Beim
  // Abspecken der Startseite wurde der Import bewusst dynamisch
  // (`await import("/assets/ai/chat-stream.js")`), damit die Kette nicht mehr
  // beim Start mitkommt — der Test wurde davon rot, obwohl nichts kaputt war.
  // Er prueft jetzt wieder die EIGENSCHAFT: derselbe Pfad, ohne Kennung,
  // gleich in welcher Importform.
  assert.match(QUELLE, /(?:from|import\()\s*"\/assets\/ai\/chat-stream\.js"/,
    "chat-stream.js muss unter genau diesem Pfad geladen werden (statisch oder dynamisch)");
  assert.ok(!/chat-stream\.js\?/.test(QUELLE), "chat-stream.js wird ohne Kennung importiert");
});

// ---------------------------------------------------------------------------
// persistActive() ersetzt den gespeicherten Chat VOLLSTAENDIG. Was im
// Objektliteral fehlt, ist nach dem naechsten Speichern weg. Genau daran ging
// bis 2026-08-09 die Anheftung verloren (bestehender Fehler) und haette auch
// jeder von der Bruecke geholte Titel verloren gehen muessen.
const STORE = readFileSync(new URL("../public/chat-store.js", import.meta.url), "utf8");

test("persistActive traegt Anheftung und Auto-Titel weiter", () => {
  const block = STORE.slice(STORE.indexOf("async function persistActive"), STORE.indexOf("function safeModelName"));
  assert.match(block, /pinned:\s*existing\?\.pinned === true/, "pinned faellt beim Speichern weg");
  assert.match(block, /titleAuto:\s*Boolean\(existing && existing\.titleAuto\)/, "titleAuto faellt beim Speichern weg");
  assert.match(
    block,
    /title:\s*existing && \(existing\.titleEdited \|\| existing\.titleAuto\)/,
    "ein geholter Titel wird sonst wieder durch die erste Frage ersetzt"
  );
});

test("setAutoTitle laesst von Hand vergebene Titel in Ruhe", () => {
  const block = STORE.slice(STORE.indexOf("export async function setAutoTitle"), STORE.indexOf("export async function renameChat"));
  assert.match(block, /if \(!chat \|\| chat\.titleEdited === true\) return false/);
  assert.ok(!/updatedAt/.test(block), "Umbenennen ist keine inhaltliche Aenderung — updatedAt bleibt");
});

// ---------------------------------------------------------------------------
// Die Verlauf-Ansicht spritzt ihr CSS zur Laufzeit ein. app-surfaces.css bringt
// ".premium-view button" mit (Spezifitaet 0,2,0) — eine blosse Klasse verliert
// dagegen, egal in welcher Reihenfolge die Stylesheets stehen. Live gemessen
// am 2026-08-09: der Knopf "Neuer Chat" war 249 px statt 74 px breit, weil die
// Handy-Regel nie ankam. Auf einer Teststrecke ohne die App-Stylesheets faellt
// das NICHT auf.
const ANSICHT = readFileSync(new URL("../public/chat-history-view.js", import.meta.url), "utf8");
// Beide Aufteilungen vom 2026-08-10: Textaufbereitung/Export in
// chat-history-text.js, Karten-Bausteine in chat-history-cards.js.
const TEXTMODUL = readFileSync(new URL("../public/chat-history-text.js", import.meta.url), "utf8");
const KARTEN = readFileSync(new URL("../public/chat-history-cards.js", import.meta.url), "utf8");

function cssBlock() {
  const start = ANSICHT.indexOf("style.textContent = `") + "style.textContent = `".length;
  const ende = ANSICHT.indexOf("`;\n  document.head.append(style);");
  assert.ok(start > 20 && ende > start, "CSS-Block nicht gefunden");
  return ANSICHT.slice(start, ende);
}

test("Knopf-Regeln haengen an #chatHistory, sonst gewinnt .premium-view button", () => {
  const css = cssBlock();
  const knopfRegeln = css
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter((zeile) => /^[.#][\w .:\[\]="-]*\{/.test(zeile) || /^[.#][\w .:\[\]="-]*$/.test(zeile))
    .filter((zeile) => /\.ch-(neu|chip|mehr)\b/.test(zeile) || /\.ch-(menu|umbenennen) button/.test(zeile));
  assert.ok(knopfRegeln.length >= 6, `zu wenige Knopf-Regeln gefunden: ${knopfRegeln.length}`);
  const ohneAnker = knopfRegeln.filter((zeile) => !zeile.includes("#chatHistory"));
  assert.deepEqual(ohneAnker, [], "diese Knopf-Regeln verlieren live gegen .premium-view button");
});

test("kein Backtick im CSS-Block — er steht selbst in einem Template-Literal", () => {
  // Beim Schreiben des Kommentars zur Spezifitaet passiert: ein Backtick um
  // ".premium-view button" beendete das Template-Literal und machte die ganze
  // Datei ungueltig. Ohne node --check waere sie so live gegangen.
  assert.equal(cssBlock().includes("`"), false);
});

test("ein offenes Menue ueberlebt ein verzoegertes Neuzeichnen", () => {
  // Live auf dem Handy gemessen: nach dem Oeffnen eines Chats und der Rueckkehr
  // in den Verlauf verschwand das gerade angetippte "⋯"-Menue nach gut 100 ms.
  // Das Menue haengt IN der Karte und ueberlebt kein replaceChildren. Welcher
  // der verzoegerten Ausloeser genau trifft, ist ein Rennen — behandelt wird
  // darum die Wirkung, nicht die Quelle.
  assert.match(ANSICHT, /if \(offenesMenu\) \{\s*\n\s*zeichnenAusstehend = true;\s*\n\s*return;/,
    "zeichne() muss ein offenes Menue respektieren");
  assert.match(ANSICHT, /if \(zeichnenAusstehend\) \{\s*\n\s*zeichnenAusstehend = false;\s*\n\s*zeichne\(\);/,
    "das zurueckgestellte Zeichnen muss beim Schliessen nachgeholt werden");
});

test("der leere Verlauf bleibt keine Sackgasse", () => {
  // Beim Loeschen-Test auf dem Handy gefunden: mit dem letzten Chat verschwand
  // auch der Kopf — und damit der einzige Knopf, der von dieser Ansicht aus
  // weiterfuehrt.
  assert.match(KARTEN, /function bausteinNeuKnopf/, "der Knopf braucht einen eigenen Baustein");
  const leerZweig = ANSICHT.slice(ANSICHT.indexOf("if (!alleChats.length)"), ANSICHT.indexOf("const aufbereitet"));
  assert.match(leerZweig, /bausteinNeuKnopf\(\)/, "im leeren Verlauf fehlt der Weg zum neuen Chat");
  assert.ok(!/ch-suche/.test(leerZweig), "ein Suchfeld ohne Chats waere sinnlos");
});

test("der Ansichts-Container darf schrumpfen (Grid-Item mit min-width auto)", () => {
  // Live gemessen: der Container liegt in einem Grid. Ohne min-width: 0 waechst
  // er mit seinem breitesten Kind — die Chip-Leiste steht auf nowrap und war
  // 372 px breit, der Container damit 406 px bei 375 px Fenster. Karten und
  // Ueberschrift ragten hinaus, und die Leiste wischte NIE, weil sie nie zu
  // eng wurde. Auf einer Teststrecke ohne die App faellt das nicht auf.
  assert.match(cssBlock(), /#chatHistory \.output \{ min-width: 0; \}/,
    "ohne min-width: 0 sprengt die Chip-Leiste die Ansicht");
});

test("die Trefferzahl steht nicht nur im Platzhalter", () => {
  // Der Platzhalter ist verdeckt, sobald etwas eingetippt ist — also genau
  // dann, wenn die Zahl gebraucht wird. Live gesehen: "berlin" im Feld, zwei
  // Karten, und nirgends stand "2 von 5".
  assert.match(ANSICHT, /if \(\(nadel \|\| themenFilter\) && treffer\.length\)/,
    "die Zaehlerzeile fehlt oder erscheint zur falschen Zeit");
  assert.match(ANSICHT, /\$\{treffer\.length\} von \$\{aufbereitet\.length\} Unterhaltungen/);
  assert.match(cssBlock(), /\.ch-zaehler \{/, "die Zaehlerzeile braucht eine Regel");
});

test("die Chip-Leiste behaelt ihre Wischposition", () => {
  // Auf dem Handy passen nur drei von acht Chips ins Bild. Ohne diese Nachsorge
  // sprang die Leiste beim Neuzeichnen zurueck an den Anfang — der gerade
  // angetippte Chip war aus dem Blick, zum Abwaehlen musste man erneut wischen.
  assert.match(ANSICHT, /const wischPosition = alteLeiste \? alteLeiste\.scrollLeft : 0/);
  assert.match(ANSICHT, /neueLeiste\.scrollLeft = wischPosition/);
});

test("Filter-Chips sind auf dem Handy 44 px hoch", () => {
  // min-height: 0 ist noetig gegen ".premium-view button", nimmt den Chips aber
  // auch die Touch-Groesse. Gemessen waren sie 34 px.
  const handy = cssBlock().slice(cssBlock().indexOf("@media (max-width: 600px)"));
  assert.match(handy, /#chatHistory \.ch-chip \{[^}]*min-height: 44px/,
    "die Chips fallen sonst unter die Touch-Grenze");
});

// ---------------------------------------------------------------------------
// Der Dateiname des Markdown-Exports entsteht aus dem Chat-Titel — und der kann
// alles enthalten: Schraegstriche, Doppelpunkte, Emoji, oder nur Sonderzeichen.
function ladeDateiname() {
  const start = TEXTMODUL.indexOf("function dateiname(titel)");
  const ende = TEXTMODUL.indexOf("// Sichern als Markdown");
  assert.ok(start > -1 && ende > start, "dateiname() nicht gefunden");
  return new Function(`${TEXTMODUL.slice(start, ende)} return dateiname;`)();
}

test("der Export-Dateiname bleibt brauchbar und sicher", () => {
  const dateiname = ladeDateiname();
  // Live gemessen: "Rate 25 % / Zins: 3,8 % Uebersicht" wurde zu
  // "Rate 25   Zins 38   Uebersicht" — Sonderzeichen fielen ersatzlos weg.
  assert.equal(dateiname("Rate 25 % / Zins: 3,8 % 🏦 Übersicht"), "Rate 25 Zins 3,8 Übersicht");
  assert.equal(dateiname("Bürokauf Finanzierung berechnen"), "Bürokauf Finanzierung berechnen");
  // Kein Ausbruch aus dem Zielordner, kein leerer Name.
  assert.ok(!dateiname("../../etc/passwd").includes(".."));
  for (const leer of ["", "   ", "🏦🏦🏦", "%%% ///"]) {
    assert.equal(dateiname(leer), "unterhaltung");
  }
  for (const eingabe of ["a".repeat(200), "Datei.md.md", "x/y\\z:q*?<>|"]) {
    const name = dateiname(eingabe);
    assert.ok(name.length <= 50, `zu lang: ${name.length}`);
    assert.ok(!/[/\\:*?"<>|]/.test(name), `unsicheres Zeichen in: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Nachladen beim Scrollen statt aller Karten auf einmal.
test("die Liste laedt blockweise nach und bleibt dabei vollstaendig", () => {
  assert.match(ANSICHT, /const ERSTER_BLOCK = \d+/, "erster Block fehlt");
  assert.match(ANSICHT, /const NACHLADE_BLOCK = \d+/, "Nachladeblock fehlt");
  // Angehaengt wird VOR die Marke — niemals neu gezeichnet, sonst springt die
  // Scrollposition weg.
  assert.match(ANSICHT, /marke\.before\(naechsteKarten\(NACHLADE_BLOCK\)\)/);
  // Die Gruppen-Ueberschrift darf beim Anhaengen nicht doppelt erscheinen:
  // der Zustand merkt sich die zuletzt geschriebene.
  assert.match(ANSICHT, /nachladeZustand\.letzteGruppe = gruppe/);
  // Ist die Liste kuerzer als der Bildschirm, wird nie gescrollt — dann muss
  // der naechste Block von selbst kommen.
  assert.match(ANSICHT, /requestAnimationFrame\(pruefeNachladen\)/);
});

test("das Nachladen haengt nicht am IntersectionObserver", () => {
  // Beim Test am 2026-08-09 feuerte der Observer im eingebetteten Browser
  // ueberhaupt nicht — auch nicht in einem Kontrollversuch ausserhalb des
  // Moduls. Wo er stillbleibt, waere die Liste bei 30 Karten abgeschnitten.
  // Auf die VERWENDUNG pruefen, nicht auf das Wort: es darf in Kommentaren
  // stehen (dort steht, warum der Observer hier nicht taugt).
  assert.ok(!/new IntersectionObserver/.test(ANSICHT), "Nachladen darf nicht am Observer haengen");
  assert.match(ANSICHT, /addEventListener\("scroll", pruefeNachladen, \{ passive: true \}\)/);
  assert.match(ANSICHT, /removeEventListener\("scroll", pruefeNachladen\)/, "der Listener muss auch wieder weg");
});
