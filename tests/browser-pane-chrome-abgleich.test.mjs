// Abgleich mit Chrome: die Verhalten, an denen der Betreiber gemessen hat.
// Jeder Test haelt EINE Chrome-Eigenschaft fest, die unser Panel vorher nicht
// hatte — damit sie beim naechsten Umbau nicht still wieder verschwindet.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TAB_MAX_BREITE, TAB_MIN_BREITE,
  tabBreite, zeigtTitel, tabMarke, hostVon, umsortiert
} from "../public/browser-pane-tableiste.js";
import { bewerte, vorschlaege } from "../public/browser-pane-vorschlaege.js";
import { fehlerArt, buildErrorPageHtml } from "../public/browser-pane-render.js";

// --- Tableiste ---------------------------------------------------------------

// DER AUSGANGSBEFUND: Das Panel zeigte immer nur den AKTIVEN Tab
// (`visibleTabs = active ? [active] : []`). Deshalb gab es Blaetter-Pfeile,
// die Chrome nicht hat. Tabs muessen schrumpfen statt zu verschwinden.
test("Tabs schrumpfen wie in Chrome, statt zu verschwinden", () => {
  assert.equal(tabBreite(1, 800), TAB_MAX_BREITE, "ein Tab wird nicht breiter als das Maximum");
  assert.equal(tabBreite(4, 800), 200, "vier Tabs teilen sich den Platz");
  assert.equal(tabBreite(20, 800), TAB_MIN_BREITE, "viele Tabs schrumpfen nur bis zur Mindestbreite");
});

test("schmale Tabs zeigen nur noch das Icon", () => {
  assert.equal(zeigtTitel(TAB_MAX_BREITE), true);
  assert.equal(zeigtTitel(TAB_MIN_BREITE), false);
});

// Ohne echtes Favicon braucht es eine Marke, die Tabs unterscheidbar macht —
// die Sicherheitsregel der Seite (img-src 'self' data: blob:) verbietet
// fremde Icon-Adressen, ein Google-Favicon-Dienst waere stumm blockiert.
test("Tab-Marke ist je Host stabil und unterscheidbar", () => {
  const a = tabMarke("https://www.amazon.com/ref=nav");
  const b = tabMarke("https://amazon.com/anderer/pfad");
  const c = tabMarke("https://smejj.com/");
  assert.equal(a.buchstabe, "A");
  assert.deepEqual(a, b, "derselbe Host ergibt immer dieselbe Marke");
  assert.notEqual(a.farbton, c.farbton, "verschiedene Hosts sind auseinanderzuhalten");
});

test("hostVon kuerzt www. weg und faellt bei Unsinn leise zurueck", () => {
  assert.equal(hostVon("https://www.amazon.com/x"), "amazon.com");
  assert.equal(hostVon("kein-url"), "");
});

test("Tabs lassen sich umsortieren, ohne die Liste zu verlieren", () => {
  const liste = ["a", "b", "c", "d"];
  assert.deepEqual(umsortiert(liste, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(umsortiert(liste, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(liste, ["a", "b", "c", "d"], "die Ursprungsliste bleibt unberuehrt");
  assert.deepEqual(umsortiert(liste, 1, 1), liste, "gleiche Position aendert nichts");
  assert.deepEqual(umsortiert(liste, -1, 9), liste, "unsinnige Indizes aendern nichts");
});

// --- Adressvorschlaege -------------------------------------------------------

// Chrome gewichtet einen Treffer am Hostanfang hoeher als irgendwo im Pfad.
test("Vorschlaege: Hostanfang schlaegt Treffer im Pfad", () => {
  assert.ok(bewerte("https://amazon.com/", "amaz") > bewerte("https://example.com/amaz", "amaz"));
  assert.equal(bewerte("https://amazon.com/", "zzz"), 0);
  assert.equal(bewerte("https://amazon.com/", ""), 0, "leere Eingabe schlaegt nie an");
});

test("Vorschlaege: keine Doppelten, hoechstens sechs", () => {
  const verlauf = [
    "https://amazon.com/", "https://amazon.com", "https://www.amazon.com/",
    "https://amazon.de/", "https://amazon.fr/", "https://amazon.it/",
    "https://amazon.es/", "https://amazon.nl/", "https://amazon.se/"
  ];
  const treffer = vorschlaege(verlauf, "amazon");
  assert.ok(treffer.length <= 6, `hoechstens 6, waren ${treffer.length}`);
  assert.equal(new Set(treffer.map((u) => u.replace(/\/$/, ""))).size, treffer.length, "keine Doppelten");
});

test("Vorschlaege: ohne Eingabe wird nichts vorgeschlagen", () => {
  assert.deepEqual(vorschlaege(["https://amazon.com/"], "   "), []);
  assert.deepEqual(vorschlaege(null, "amazon"), []);
});

// --- Fehlerseite -------------------------------------------------------------

test("Fehlerseite ordnet technische Gruende verstaendlichen Texten zu", () => {
  assert.equal(fehlerArt("getaddrinfo ENOTFOUND gibtsnicht.example"), "dns");
  assert.equal(fehlerArt("The operation was aborted due to timeout"), "zeit");
  assert.equal(fehlerArt("fetch failed"), "netz");
  assert.equal(fehlerArt("irgendwas anderes"), "allgemein");
});

test("Fehlerseite nennt Grund, Adresse und bietet erneutes Laden", () => {
  const html = buildErrorPageHtml({ url: "https://www.beispiel.de/x", grund: "fetch failed" });
  assert.match(html, /Keine Verbindung/);
  assert.match(html, /beispiel\.de/);
  assert.match(html, /Erneut laden/);
  assert.match(html, /smejj\.browser\.reload/);
});

// Der Grund kommt aus einer fremden Antwort — er darf kein Markup einschleusen.
test("Fehlerseite escaped den technischen Grund", () => {
  const html = buildErrorPageHtml({ url: "https://x.de/", grund: '</script><img src=x onerror=alert(1)>' });
  assert.ok(!html.includes("<img src=x"), "roher Tag darf nicht durchkommen");
  assert.match(html, /&lt;img/);
});

// --- Adressanzeige -----------------------------------------------------------

// Der auffaelligste Unterschied im direkten Nebeneinander (Bildschirmfoto
// 2026-08-17): Chrome zeigt "smejj.com", wir zeigten "https://www.amazon.com/".
test("Adresse wird wie in Chrome gekuerzt angezeigt", async () => {
  const { anzeigeAdresse } = await import("../public/browser-pane-vorschlaege.js");
  assert.equal(anzeigeAdresse("https://www.amazon.com/"), "amazon.com");
  assert.equal(anzeigeAdresse("https://smejj.com/"), "smejj.com");
  assert.equal(anzeigeAdresse(""), "");
});

// Ein Pfad ist kein Schmuck — er muss stehen bleiben, sonst fuehrt die
// angezeigte Adresse woanders hin als die echte.
test("Adressanzeige kuerzt Pfad und Abfrage NICHT weg", async () => {
  const { anzeigeAdresse } = await import("../public/browser-pane-vorschlaege.js");
  assert.equal(anzeigeAdresse("https://amazon.com/dp/B01?ref=x"), "amazon.com/dp/B01?ref=x");
  assert.equal(anzeigeAdresse("https://amazon.com/gp/cart/"), "amazon.com/gp/cart");
});

// Eine unverschluesselte Verbindung darf NICHT aussehen wie eine sichere.
test("http:// bleibt sichtbar", async () => {
  const { anzeigeAdresse } = await import("../public/browser-pane-vorschlaege.js");
  assert.equal(anzeigeAdresse("http://alt.example.com/"), "http://alt.example.com/");
});

// --- Sicherheitsanzeige ------------------------------------------------------

// Seit die Adresse ohne "https://" angezeigt wird, ist dieses Zeichen die
// EINZIGE Auskunft ueber die Verschluesselung. Ohne es waere das Kuerzen ein
// Rueckschritt: weniger Text UND weniger Wissen.
test("Sicherheitszustand wird aus der Adresse erkannt", async () => {
  const { sicherheitsZustand, ZUSTAende } = await import("../public/browser-pane-sicherheit.js");
  assert.equal(sicherheitsZustand("https://amazon.com/"), ZUSTAende.SICHER);
  assert.equal(sicherheitsZustand("http://alt.example.com/"), ZUSTAende.UNSICHER);
  assert.equal(sicherheitsZustand("about:blank"), ZUSTAende.INTERN);
  assert.equal(sicherheitsZustand(""), ZUSTAende.LEER);
});

// Die Warnung muss konkret sagen, was zu lassen ist — "nicht sicher" allein
// hilft niemandem beim Entscheiden.
test("die Warnung nennt die Folge, nicht nur den Zustand", async () => {
  const { sicherheitsText, ZUSTAende } = await import("../public/browser-pane-sicherheit.js");
  const unsicher = sicherheitsText(ZUSTAende.UNSICHER);
  assert.match(unsicher.kurz, /Nicht sicher/);
  assert.match(unsicher.hinweis, /Passwoerter|Zahlungsdaten/);
  // Der sichere Fall traegt bewusst KEINEN Text: ein Schloss, das immer da
  // ist, sieht niemand mehr.
  assert.equal(sicherheitsText(ZUSTAende.SICHER).kurz, "");
});

// --- Lesezeichen -------------------------------------------------------------

test("Stern merkt und vergisst dieselbe Seite", async () => {
  const { umschalten, istGemerkt } = await import("../public/browser-pane-lesezeichen.js");
  const a = umschalten("https://amazon.com/", "Amazon", []);
  assert.equal(a.gemerkt, true);
  assert.equal(istGemerkt("https://amazon.com/", a.liste), true);
  const b = umschalten("https://amazon.com/", "Amazon", a.liste);
  assert.equal(b.gemerkt, false);
  assert.deepEqual(b.liste, []);
});

// Der abschliessende Schraegstrich darf keine zweite Merkung erzeugen —
// sonst sammelt man dieselbe Seite doppelt und der Stern zeigt Unsinn.
test("Schraegstrich am Ende macht kein zweites Lesezeichen", async () => {
  const { umschalten, istGemerkt } = await import("../public/browser-pane-lesezeichen.js");
  const { liste } = umschalten("https://amazon.com/", "Amazon", []);
  assert.equal(istGemerkt("https://amazon.com", liste), true, "mit und ohne Schraegstrich ist dieselbe Seite");
  const zurueck = umschalten("https://amazon.com", "Amazon", liste);
  assert.equal(zurueck.gemerkt, false);
  assert.deepEqual(zurueck.liste, []);
});

test("neueste Lesezeichen stehen vorn", async () => {
  const { umschalten } = await import("../public/browser-pane-lesezeichen.js");
  const eins = umschalten("https://a.de/", "A", []);
  const zwei = umschalten("https://b.de/", "B", eins.liste);
  assert.equal(zwei.liste[0].url, "https://b.de/");
});

// Ein gesperrter Speicher (Privatmodus) darf das Panel nicht aufhalten.
test("gesperrter Speicher liefert eine leere Liste statt zu werfen", async () => {
  const { ladeLesezeichen, speichereLesezeichen } = await import("../public/browser-pane-lesezeichen.js");
  const gesperrt = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  assert.deepEqual(ladeLesezeichen(gesperrt), []);
  assert.equal(speichereLesezeichen([{ url: "https://a.de/" }], gesperrt), false);
});

test("beschaedigter Speicherinhalt wirft nicht", async () => {
  const { ladeLesezeichen } = await import("../public/browser-pane-lesezeichen.js");
  assert.deepEqual(ladeLesezeichen({ getItem: () => "{kein json" }), []);
  assert.deepEqual(ladeLesezeichen({ getItem: () => '{"nicht":"liste"}' }), []);
});

// --- Tastenkuerzel -----------------------------------------------------------

test("die Chrome-Kuerzel werden erkannt", async () => {
  const { tastenBefehl } = await import("../public/browser-pane-tasten.js");
  const cmd = (key, shift = false) => tastenBefehl({ metaKey: true, shiftKey: shift, key });
  assert.deepEqual(cmd("t"), { befehl: "neuerTab" });
  assert.deepEqual(cmd("w"), { befehl: "tabSchliessen" });
  assert.deepEqual(cmd("l"), { befehl: "adresseFokus" });
  assert.deepEqual(cmd("r"), { befehl: "neuLaden" });
  assert.equal(cmd("q"), null, "fremde Kombinationen gehoeren uns nicht");
  assert.equal(tastenBefehl({ key: "t" }), null, "ohne Cmd/Ctrl passiert nichts");
});

// Cmd+Shift+T MUSS vor der Pruefung auf "t" stehen — sonst gewinnt
// "neuer Tab" und der geschlossene Tab bleibt fuer immer weg.
test("Cmd+Shift+T holt zurueck und wird nicht von Cmd+T geschluckt", async () => {
  const { tastenBefehl } = await import("../public/browser-pane-tasten.js");
  assert.deepEqual(tastenBefehl({ metaKey: true, shiftKey: true, key: "T" }), { befehl: "tabZurueckholen" });
});

// Chrome-Eigenheit: Cmd+9 springt zum LETZTEN Tab, nicht zum neunten.
test("Cmd+1..8 waehlt den n-ten, Cmd+9 den letzten Tab", async () => {
  const { tastenBefehl } = await import("../public/browser-pane-tasten.js");
  assert.deepEqual(tastenBefehl({ metaKey: true, key: "1" }), { befehl: "tabWaehlen", wert: 0 });
  assert.deepEqual(tastenBefehl({ metaKey: true, key: "8" }), { befehl: "tabWaehlen", wert: 7 });
  assert.deepEqual(tastenBefehl({ metaKey: true, key: "9" }), { befehl: "tabWaehlen", wert: -1 });
});

test("geschlossene Tabs kommen in umgekehrter Reihenfolge zurueck", async () => {
  const { merkeGeschlossen, holeZurueck, MAX_GESCHLOSSEN } = await import("../public/browser-pane-tasten.js");
  let stapel = merkeGeschlossen([], { url: "https://a.de/", title: "A" });
  stapel = merkeGeschlossen(stapel, { url: "https://b.de/", title: "B" });
  const erst = holeZurueck(stapel);
  assert.equal(erst.eintrag.url, "https://b.de/", "der zuletzt geschlossene kommt zuerst zurueck");
  assert.equal(holeZurueck(erst.stapel).eintrag.url, "https://a.de/");
  assert.deepEqual(holeZurueck([]), { eintrag: null, stapel: [] }, "leerer Stapel wirft nicht");

  let voll = [];
  for (let i = 0; i < MAX_GESCHLOSSEN + 5; i += 1) voll = merkeGeschlossen(voll, { url: `https://x${i}.de/` });
  assert.equal(voll.length, MAX_GESCHLOSSEN, "der Stapel waechst nicht unbegrenzt");
});

test("ein Tab ohne Adresse wird nicht gemerkt", async () => {
  const { merkeGeschlossen } = await import("../public/browser-pane-tasten.js");
  assert.deepEqual(merkeGeschlossen([], { url: "", title: "Neuer Tab" }), []);
});

// --- Tab-Kontextmenue und Zoom-Anzeige ---------------------------------------

test("Menue graut aus, was gerade nicht geht — statt es zu verstecken", async () => {
  const { menueEintraege } = await import("../public/browser-pane-tableiste.js");
  const einer = menueEintraege([{ id: "a" }], "a");
  const nach = (liste, id) => liste.find((e) => e.id === id);
  assert.equal(nach(einer, "andereSchliessen").aktiv, false, "es gibt keine anderen");
  assert.equal(nach(einer, "rechteSchliessen").aktiv, false, "rechts steht nichts");
  assert.equal(nach(einer, "schliessen").aktiv, true);
  // Chrome versteckt sie nicht: ein Menue, dessen Eintraege springen, kann
  // man sich nicht merken.
  // Die ZAHL darf nicht springen — darum geht es. Sie wuchs von 4 auf 5, als
  // "Tab anpinnen" dazukam; das ist eine bewusste Erweiterung, kein Rutschen.
  const drei = menueEintraege([{ id: "a" }, { id: "b" }, { id: "c" }], "b");
  assert.equal(einer.length, drei.length, "gleich viele Eintraege, egal wie die Lage ist");
  assert.deepEqual(einer.map((e) => e.id), drei.map((e) => e.id), "und in derselben Reihenfolge");
});

test("bei mehreren Tabs sind die Sammelbefehle aktiv", async () => {
  const { menueEintraege } = await import("../public/browser-pane-tableiste.js");
  const drei = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const beiA = menueEintraege(drei, "a");
  assert.equal(beiA.find((e) => e.id === "andereSchliessen").aktiv, true);
  assert.equal(beiA.find((e) => e.id === "rechteSchliessen").aktiv, true);
  // Beim letzten Tab steht rechts nichts mehr.
  const beiC = menueEintraege(drei, "c");
  assert.equal(beiC.find((e) => e.id === "rechteSchliessen").aktiv, false);
  assert.equal(beiC.find((e) => e.id === "andereSchliessen").aktiv, true);
});

// --- Suche in der Seite (Cmd+F) ----------------------------------------------

test("Cmd+F oeffnet die Suche", async () => {
  const { tastenBefehl } = await import("../public/browser-pane-tasten.js");
  assert.deepEqual(tastenBefehl({ metaKey: true, key: "f" }), { befehl: "suchen" });
});

// Chrome laeuft vom letzten Treffer zum ersten um — wer am Ende ist, will
// weitersuchen, nicht anhalten.
test("Treffer laufen um, in beide Richtungen", async () => {
  const { naechsterTreffer } = await import("../public/browser-pane-suche.js");
  assert.equal(naechsterTreffer(2, 3, 1), 0, "vom letzten zum ersten");
  assert.equal(naechsterTreffer(0, 3, -1), 2, "vom ersten zum letzten");
  assert.equal(naechsterTreffer(0, 3, 1), 1);
  assert.equal(naechsterTreffer(-1, 3, 1), 0, "ohne vorherigen Treffer beginnt es vorn");
  assert.equal(naechsterTreffer(-1, 3, -1), 2, "rueckwaerts beginnt es hinten");
  assert.equal(naechsterTreffer(0, 0, 1), -1, "ohne Treffer gibt es nichts anzuspringen");
});

test("Trefferanzeige zaehlt ab 1, wie in Chrome", async () => {
  const { trefferText } = await import("../public/browser-pane-suche.js");
  assert.equal(trefferText(0, 12), "1/12", "der erste Treffer heisst 1, nicht 0");
  assert.equal(trefferText(11, 12), "12/12");
  assert.equal(trefferText(-1, 0), "0/0", "nichts gefunden ist eine Aussage, keine Leere");
});

// Eine Suchleiste, die nie etwas findet, ist schlimmer als keine — man sucht
// den Fehler dann bei sich.
test("in nicht durchsuchbaren Ansichten wird ehrlich abgelehnt", async () => {
  const { sucheMoeglich } = await import("../public/browser-pane-suche.js");
  assert.equal(sucheMoeglich("proxy"), true);
  assert.equal(sucheMoeglich("live-browser"), true);
  assert.equal(sucheMoeglich("direct"), false, "fremder Rahmen: kein Zugriff auf das Dokument");
  assert.equal(sucheMoeglich("error"), false);
  assert.equal(sucheMoeglich(""), false);
});

// Der Live-Browser zeigt nur ein Bild — dort muss der ECHTE Browser suchen.
// Die Leiste selbst weiss davon nichts: sie fragt nach dem Weg. Sonst muesste
// jede kuenftige Ansicht die Leiste wieder anfassen.
test("die Suche waehlt den Weg nach Ansicht", async () => {
  const { sucheWeg, sucheMoeglich } = await import("../public/browser-pane-suche.js");
  assert.equal(sucheWeg("proxy"), "rahmen", "im Proxy liegt das Dokument im Rahmen");
  assert.equal(sucheWeg("live-browser"), "sitzung", "im Live-Browser sehen wir nur ein Bild");
  assert.equal(sucheWeg("direct"), null, "fremder Rahmen: kein Zugriff");
  assert.equal(sucheWeg("error"), null);
  // sucheMoeglich leitet sich daraus ab — eine Wahrheit, nicht zwei.
  assert.equal(sucheMoeglich("live-browser"), true);
  assert.equal(sucheMoeglich("direct"), false);
});

// --- Seitenmenue (Rechtsklick auf den Inhalt) --------------------------------

// Ein Menue, das unten rechts halb aus dem Fenster ragt, ist genau dort am
// wahrscheinlichsten, wo man zuletzt geklickt hat.
test("das Menue bleibt im sichtbaren Bereich", async () => {
  const { menuePosition } = await import("../public/browser-pane-menue.js");
  const eng = menuePosition(1260, 700, 220, 180, 1280, 720);
  assert.ok(eng.links + 220 <= 1280, "rechter Rand bleibt drin");
  assert.ok(eng.oben + 180 <= 720, "unterer Rand bleibt drin");
  const normal = menuePosition(100, 120, 220, 180, 1280, 720);
  assert.deepEqual(normal, { links: 100, oben: 120 }, "in der Mitte wird nichts verschoben");
});

// Was hier nicht geht, steht gar nicht erst drin. Ein Menue voller toter
// Eintraege ("Drucken", "Uebersetzen") sieht nach Browser aus und ist keiner.
test("das Seitenmenue graut aus, was die Lage nicht hergibt", async () => {
  const { seitenEintraege } = await import("../public/browser-pane-menue.js");
  const leer = seitenEintraege({});
  assert.equal(leer.every((e) => e.aktiv === false), true, "ohne Adresse und Verlauf geht nichts");
  const voll = seitenEintraege({ kannZurueck: true, kannVor: true, hatAdresse: true });
  assert.equal(voll.every((e) => e.aktiv === true), true);
  assert.deepEqual(voll.map((e) => e.id),
    ["zurueck", "vor", "neuLaden", "adresseKopieren", "externOeffnen"]);
});

// --- Angepinnte Tabs ---------------------------------------------------------

test("angepinnte Tabs stehen vorn, Reihenfolge bleibt sonst erhalten", async () => {
  const { sortiertNachPinnung } = await import("../public/browser-pane-tableiste.js");
  const tabs = [
    { id: "a" }, { id: "b", angepinnt: true }, { id: "c" }, { id: "d", angepinnt: true }
  ];
  assert.deepEqual(sortiertNachPinnung(tabs).map((t) => t.id), ["b", "d", "a", "c"],
    "beide Gruppen behalten ihre innere Reihenfolge — sonst findet man Tabs nicht wieder");
  assert.deepEqual(tabs.map((t) => t.id), ["a", "b", "c", "d"], "das Original bleibt unberuehrt");
  assert.deepEqual(sortiertNachPinnung(null), []);
});

// Das ist der ganze Sinn des Anpinnens: der Tab soll nicht versehentlich
// verschwinden. Ein Versprechen, das das Menue bricht, waere keins.
test("ein angepinnter Tab laesst sich nicht schliessen, ohne ihn zu loesen", async () => {
  const { menueEintraege } = await import("../public/browser-pane-tableiste.js");
  const tabs = [{ id: "a", angepinnt: true }, { id: "b" }];
  const beiA = menueEintraege(tabs, "a");
  assert.equal(beiA.find((e) => e.id === "schliessen").aktiv, false);
  assert.equal(beiA.find((e) => e.id === "pinnen").text, "Tab loesen", "der Eintrag zeigt, was ein Klick TUT");
  const beiB = menueEintraege(tabs, "b");
  assert.equal(beiB.find((e) => e.id === "schliessen").aktiv, true);
  assert.equal(beiB.find((e) => e.id === "pinnen").text, "Tab anpinnen");
});

// Angepinnt muss den Neustart ueberleben — sonst ist das Anpinnen wertlos.
// Die Feldliste in persistTabs ist die bekannte Falle.
test("angepinnt steht in der Speicherliste", async () => {
  const fs = await import("node:fs");
  const pane = fs.readFileSync("public/browser-pane.js", "utf8");
  const liste = pane.slice(pane.indexOf("export function persistTabs"));
  assert.match(liste, /angepinnt: Boolean\(tab\.angepinnt\)/);
});

test("Cmd+W schliesst keinen angepinnten Tab", async () => {
  const fs = await import("node:fs");
  const tasten = fs.readFileSync("public/browser-pane-tasten.js", "utf8");
  assert.match(tasten, /tabSchliessen:[\s\S]*!t\.angepinnt/);
});

// --- Links im neuen Tab, Verlaufsliste ---------------------------------------

// Vorher navigierte JEDER Klick an Ort und Stelle. Wer eine Trefferliste
// durchgehen wollte, musste nach jedem Link zurueck.
test("Cmd/Strg-Klick, Mausrad und _blank oeffnen im neuen Tab", async () => {
  const { rewriteBrowserHtml } = await import("../control-server/src/routes/browserProxyRoutes.js");
  const html = rewriteBrowserHtml("<html><body><a href='/x'>L</a></body></html>", "https://x.de/");
  assert.match(html, /neuerTabGewuenscht/);
  assert.match(html, /event\.metaKey \|\| event\.ctrlKey \|\| event\.button === 1/);
  assert.match(html, /_blank/);
  // Die mittlere Maustaste loest KEIN click aus — ohne auxclick bliebe die
  // gewohnteste Art, einen Link nebenbei zu oeffnen, wirkungslos.
  assert.match(html, /addEventListener\("auxclick"/);
});

test("die Verlaufsliste zeigt die Stationen in Sprungweite", async () => {
  const { verlaufEintraege, MAX_VERLAUF_EINTRAEGE } = await import("../public/browser-pane-menue.js");
  const history = ["https://a.de/", "https://b.de/", "https://c.de/", "https://d.de/"];
  const zurueck = verlaufEintraege(history, 2, -1);
  assert.deepEqual(zurueck.map((e) => e.text), ["b.de", "a.de"], "neueste zuerst");
  assert.deepEqual(zurueck.map((e) => e.id), ["-1", "-2"], "der n-te Eintrag ist n Schritte entfernt");
  const vor = verlaufEintraege(history, 2, 1);
  assert.deepEqual(vor.map((e) => e.text), ["d.de"]);
  assert.deepEqual(vor.map((e) => e.id), ["1"]);
});

test("die Verlaufsliste bleibt kurz und faellt leer nicht um", async () => {
  const { verlaufEintraege, MAX_VERLAUF_EINTRAEGE } = await import("../public/browser-pane-menue.js");
  const lang = Array.from({ length: 40 }, (_, i) => `https://s${i}.de/`);
  assert.equal(verlaufEintraege(lang, 39, -1).length, MAX_VERLAUF_EINTRAEGE);
  assert.deepEqual(verlaufEintraege([], 0, -1), []);
  assert.deepEqual(verlaufEintraege(null, 0, -1), []);
  assert.deepEqual(verlaufEintraege(["https://a.de/"], -1, -1), [], "ohne Station kein Eintrag");
});
