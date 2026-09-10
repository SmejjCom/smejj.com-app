// smejj.com — die Bedienzonen der Sprachwelle, als Zahlen statt als Meinung.
//
// Betreiber-Auftrag 2026-09-10 im Wortlaut:
//   "Das Logo darf niemals abgeschnitten werden. Es darf nicht unter die obere
//    Bildschirmkante rutschen. Safe Area beruecksichtigen."
//   "Das X zum Schliessen muss oben rechts sitzen. Dadurch bleibt unten
//    maximaler Platz fuer die Interaktion."
//   "Die UI soll auf dem Telefon bis zur unteren Safe Area reichen. Der Home
//    Indicator darf nicht verdeckt werden. Keine unnoetigen Leerflaechen."
//
// GEMESSEN VORHER (375x812): X bei 303,732 — in der unteren Leiste, wo es
// 48 px Breite wegnahm; 32 px ungenutzt unter der Leiste; Hinweis 59 px hoch
// mit weiteren 28 px Luft; drei Knoepfe 36x42 statt 44x44.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/composer-tools.css", import.meta.url), "utf8");
const ui = readFileSync(new URL("../public/voice-overlay-ui.js", import.meta.url), "utf8");
const gate = readFileSync(new URL("../public/auth-gate.js", import.meta.url), "utf8");

/** Holt einen Regelblock als Text — sonst prueft man versehentlich die Nachbarregel. */
function block(selektor) {
  const i = css.indexOf(`${selektor} {`);
  assert.ok(i >= 0, `Regel ${selektor} fehlt`);
  return css.slice(i, css.indexOf("\n}", i));
}

test("das X ist oben rechts verankert, nicht in der unteren Leiste", () => {
  const b = block(".voice-mode-close");
  assert.match(b, /position:\s*absolute/);
  assert.match(b, /top:/);
  assert.match(b, /right:/);
  assert.doesNotMatch(b, /bottom:/, "unten verankert waere die alte Lage");
  // Und das Modul darf es nicht wieder wegschieben.
  assert.doesNotMatch(ui, /bar\.appendChild\(close\)/,
    "voice-overlay-ui.js schiebt das X wieder in die Bedienleiste");
});

test("das X weicht dem Hinweisstreifen aus, statt darunter zu verschwinden", () => {
  // Der Streifen "Deine Anmeldung ist abgelaufen" traegt z-index 2147483000 —
  // mehr als jedes Overlay. Sein "Spaeter"-Knopf lag am 10.09. genau auf dem X:
  // die Sprachwelt liess sich nicht mehr schliessen. Kein z-index-Wettruesten,
  // sondern eine gemeldete Hoehe.
  assert.match(block(".voice-mode-close"), /var\(--hinweis-hoehe/,
    "das X rechnet die Streifenhoehe nicht ein");
  assert.match(gate, /--hinweis-hoehe/, "auth-gate.js meldet seine Hoehe nicht");
  assert.match(gate, /meldeHoehe\(dok, 0\)/, "beim Schliessen muss die Hoehe zurueck auf 0");
  assert.match(gate, /ResizeObserver/, "bei einer Drehung aendert sich die Hoehe");
});

test("Logo und Bedienzone respektieren die Safe Areas", () => {
  const b = block(".voice-mode-overlay");
  assert.match(b, /padding:\s*calc\(env\(safe-area-inset-top/, "oben: Dynamic Island");
  assert.match(b, /padding-bottom:\s*max\(env\(safe-area-inset-bottom/, "unten: Home Indicator");
  // Die Tastatur muss weiter gewinnen, wenn sie offen ist.
  assert.match(b, /--tastatur-hoehe/, "die offene Tastatur darf das Feld nicht verdecken");
});

test("die Bedienzone reicht bis an die Kante — keine unnoetige Leerflaeche", () => {
  const b = block('.voice-mode-overlay[data-upgraded="true"] .voice-mode-bar');
  assert.match(b, /margin-bottom:\s*0/, "8 px Rand schoben die Leiste wieder von der Kante weg");
});

test("jedes Ziel in der Bedienzone haelt 44 px", () => {
  // Betreiber-Untergrenze. Gemessen waren Anhaengen, Kamera und Senden 36x42.
  const b = block(".voice-mode-input-wrap button");
  assert.match(b, /width:\s*44px/);
  assert.match(b, /height:\s*44px/);
});

test("der Hinweis unter der Sprachwelle bleibt kurz", () => {
  // Der alte Satz nannte jeden Knopf einzeln und brauchte drei Zeilen (59 px)
  // direkt ueber der Bedienzone. Was die Knoepfe tun, sagen ihre eigenen
  // Beschriftungen.
  const treffer = /hint\.textContent = "([^"]+)"/.exec(ui);
  assert.ok(treffer, "der Hinweistext wurde nicht gefunden");
  assert.ok(treffer[1].length <= 60, `Hinweis ist ${treffer[1].length} Zeichen lang: "${treffer[1]}"`);
});

test("die Kamera legt sich NICHT ueber die Bedienzone", () => {
  // Betreiber 2026-09-10: "Video darf niemals wichtige Bedienelemente
  // verdecken." GEMESSEN (375x812, Kamera im Sprachmodus): #kameraOverlay steht
  // auf fixed/inset:0/z-index 200 — genau wie das Sprach-Overlay, und es kommt
  // spaeter ins Dokument. elementFromPoint auf die Mitte JEDES der sechs
  // Bedienelemente lieferte "kameraOverlay", auch beim X: die Sprachwelt liess
  // sich nicht mehr schliessen, solange die Kamera lief.
  const flaechen = readFileSync(new URL("../public/design-v11-flaechen.css", import.meta.url), "utf8");
  assert.match(flaechen, /body\.voice-mode-open #kameraOverlay\s*\{[^}]*bottom:\s*calc\(var\(--voice-bedienzone/,
    "das Kamera-Overlay muss im Sprachmodus ueber der Bedienzone enden");
  assert.match(flaechen, /body\.voice-mode-open #voiceModeClose\s*\{[^}]*z-index/,
    "das X muss in jedem Fall erreichbar bleiben");
  // Und die Hoehe muss gemeldet werden, sonst rechnet die Regel mit 0.
  assert.match(ui, /--voice-bedienzone/, "voice-overlay-ui.js meldet die Hoehe nicht");
  assert.match(ui, /ResizeObserver/, "bei Umbruch oder Drehung aendert sich die Hoehe");
});

test("eine Aufnahme im Sprachmodus landet im SPRACH-Feld", () => {
  // Bis 2026-09-10 ging das Bild immer an #startMessage — das Feld der
  // Startseite, das im Sprachmodus verdeckt ist. Fuer den Nutzer sah es aus,
  // als sei nichts passiert.
  const kamera = readFileSync(new URL("../public/kamera.js", import.meta.url), "utf8");
  assert.match(kamera, /voice-mode-open/, "kamera.js unterscheidet die Modi nicht");
  assert.match(kamera, /imSprachmodus \? "voiceModeInput" : "startMessage"/,
    "das Ziel-Feld haengt nicht am Modus");
});
