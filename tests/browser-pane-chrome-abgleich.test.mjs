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
