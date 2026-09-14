// smejj.com — Befunde F12 + F13 der A-bis-Z-Pruefung vom 14.09.2026.
//
// F12: das Browser-Panel oeffnete mit ~20 verwaisten Tabs (nur Anfangsbuchstabe
//      sichtbar), der aktive zeigte Googles Anmeldefehler. Die Tab-Liste
//      entsteht NICHT auf dem Server, sondern in localStorage
//      (smejj.browser.tabs.v1): jeder Maus-Auftrag mit neuer Adresse legt einen
//      Tab an, restoreTabs() holt bis zu 100 zurueck. Fix: Aufraeumen beim
//      Start (maus-panel.js) + Anmelde-Sackgasse serverseitig abfangen.
// F13: "Maus beauftragen" oeffnete einen nativen prompt(); im automatisierten
//      Chrome wird er mit Escape weggedrueckt, und dieses Escape schliesst ueber
//      panel-backdrop.js Panel UND Spur (live gemessen). Fix: Vorlage ins
//      Chat-Feld, wie die Kachel in start-chips.js.
//
// Ohne den Fix fehlen die Exporte — die Datei ist dann rot.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bereinigeTabListe, TABS_BEIM_START, bereinigeGespeicherteTabs } from "../public/maus-panel.js";
import { belegeStartfeldMitMausVorlage, MAUS_VORLAGE } from "../public/browser-pane-maus.js";
import { parseBrowserTarget, ANMELDE_SACKGASSE_TEXT } from "../control-server/src/routes/browserProxyRoutes.js";

const mausPanel = fs.readFileSync("public/maus-panel.js", "utf8");
const mausKnopf = fs.readFileSync("public/browser-pane-maus.js", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");

const tab = (id, url, extra = {}) => ({ id, url, title: url || "Neuer Tab", ...extra });

// --- F12 ---------------------------------------------------------------------

test("F12: aus 20 verwaisten Tabs bleiben hoechstens TABS_BEIM_START, der aktive bleibt", () => {
  const tabs = Array.from({ length: 20 }, (_, i) => tab(`tab-${i + 1}`, `https://beispiel.de/seite-${i + 1}`));
  const ergebnis = bereinigeTabListe(tabs, "tab-3");
  assert.equal(TABS_BEIM_START, 8);
  assert.equal(ergebnis.tabs.length, 8);
  assert.equal(ergebnis.activeId, "tab-3");
  assert.equal(ergebnis.entfernt, 12);
  // Der aktive plus die sieben juengsten — in der alten Reihenfolge.
  assert.deepEqual(ergebnis.tabs.map((t) => t.id), ["tab-3", "tab-14", "tab-15", "tab-16", "tab-17", "tab-18", "tab-19", "tab-20"]);
});

test("F12: leere Tabs fliegen, doppelte Adressen bleiben nur einmal (die juengste), angepinnte bleiben", () => {
  const tabs = [
    tab("tab-1", "https://smejj.com/impressum.html"),
    tab("tab-2", ""),
    tab("tab-3", "https://smejj.com/impressum.html"),
    tab("tab-4", "https://de.wikipedia.org/wiki/Ada_Lovelace", { angepinnt: true }),
    tab("tab-5", ""),
    tab("tab-6", "https://smejj.com/impressum.html"),
    tab("tab-7", "https://duckduckgo.com/")
  ];
  const ergebnis = bereinigeTabListe(tabs, "tab-7");
  assert.deepEqual(ergebnis.tabs.map((t) => t.id), ["tab-4", "tab-6", "tab-7"]);
  assert.equal(ergebnis.activeId, "tab-7");
  assert.equal(ergebnis.entfernt, 4);
});

test("F12: ein aktiver leerer Tab bleibt — das Panel braucht einen Tab zum Weiterarbeiten", () => {
  const ergebnis = bereinigeTabListe([tab("tab-1", ""), tab("tab-2", "")], "tab-2");
  assert.deepEqual(ergebnis.tabs.map((t) => t.id), ["tab-2"]);
  assert.equal(ergebnis.activeId, "tab-2");
});

test("F12: die Google-Anmeldung ist eine Sackgasse — auch als aktiver Tab; der Fokus wandert auf den juengsten Rest", () => {
  const tabs = [
    tab("tab-1", "https://de.wikipedia.org/wiki/Ada_Lovelace"),
    tab("tab-2", "https://accounts.google.com/v3/signin/identifier?continue=x"),
    tab("tab-3", "https://smejj.com/")
  ];
  const ergebnis = bereinigeTabListe(tabs, "tab-2");
  assert.deepEqual(ergebnis.tabs.map((t) => t.id), ["tab-1", "tab-3"]);
  assert.equal(ergebnis.activeId, "tab-3");
  // Nichts kaputtes: Unsinn in der Liste wird ignoriert, ohne zu werfen; ein
  // Tab mit unlesbarer Adresse bleibt (er ist keine Sackgasse, nur unbekannt).
  assert.deepEqual(bereinigeTabListe([null, 3, tab("tab-9", "kein url")], "").tabs.map((t) => t.id), ["tab-9"]);
  assert.equal(bereinigeTabListe(undefined, "").activeId, "");
});

test("F12: das Aufraeumen laeuft beim Start NACH dem Leeren der Maus-Tabs, speichert und zeichnet neu", () => {
  const leeren = mausPanel.indexOf("vergessenerMausTabAufraeumen();");
  const aufraeumen = mausPanel.indexOf("verwaisteTabsAufraeumen();");
  assert.ok(leeren > -1 && aufraeumen > leeren, "erst leeren, dann aufraeumen");
  assert.match(mausPanel, /state\.tabs\.splice\(0, state\.tabs\.length, \.\.\.ergebnis\.tabs\)/, "dieselbe Array-Instanz");
  assert.match(mausPanel, /persistTabs\(\);\s*\n\s*if \(state\.mounted\) render\(\);/);
});

test("F12 (Server): accounts.google.com wird mit klarer Ansage abgefangen, alles andere wie bisher", () => {
  const google = parseBrowserTarget("https://accounts.google.com/signin/v2/identifier");
  assert.equal(google.ok, false);
  assert.equal(google.error, ANMELDE_SACKGASSE_TEXT);
  assert.match(google.error, /eigenen Browser/);
  assert.equal(parseBrowserTarget("https://www.google.com/search?q=smejj").ok, true);
  assert.equal(parseBrowserTarget("https://smejj.com/").ok, true);
  assert.equal(parseBrowserTarget("http://localhost:3000").ok, false);
});

// --- F13 ---------------------------------------------------------------------

function feldAttrappe({ sichtbar = true } = {}) {
  const feld = {
    value: "", ereignisse: [], fokussiert: false,
    dispatchEvent(ereignis) { this.ereignisse.push(ereignis.type); return true; },
    focus() { this.fokussiert = true; },
    getClientRects() { return sichtbar ? [{ width: 300, height: 44 }] : []; }
  };
  return { feld, dokument: { getElementById: (id) => (id === "startMessage" ? feld : null) } };
}

test("F13: der Klick belegt das Chat-Feld mit der Vorlage vor und fokussiert es — wie die Kachel", () => {
  const { feld, dokument } = feldAttrappe();
  assert.equal(belegeStartfeldMitMausVorlage({ dokument, uebersetze: (s) => s }), true);
  assert.equal(feld.value, "Erledige mit der Maus im Browser: ");
  assert.equal(feld.fokussiert, true);
  assert.deepEqual(feld.ereignisse, ["input"]);
  // Dieselbe Vorlage wie die Kachel in index.html — eine Quelle, ein Satz.
  assert.ok(index.includes(`data-chip="${MAUS_VORLAGE}"`), "Vorlage stimmt mit der Kachel ueberein");
});

test("F13: nach dem vollbreiten Doppelpunkt (CJK) kein Leerzeichen — wie in start-chips.js", () => {
  const { feld, dokument } = feldAttrappe();
  belegeStartfeldMitMausVorlage({ dokument, uebersetze: () => "用鼠标在浏览器中完成：" });
  assert.equal(feld.value, "用鼠标在浏览器中完成：");
});

test("F13: ohne sichtbares Chat-Feld meldet die Funktion ehrlich false (dann greift der Rueckfall)", () => {
  assert.equal(belegeStartfeldMitMausVorlage({ dokument: { getElementById: () => null }, uebersetze: (s) => s }), false);
  const { feld, dokument } = feldAttrappe({ sichtbar: false });
  assert.equal(belegeStartfeldMitMausVorlage({ dokument, uebersetze: (s) => s }), false);
  assert.equal(feld.value, "");
});

test("F13: im Klick-Handler kommt das Chat-Feld VOR dem prompt()-Dialog, der nur noch Rueckfall ist", () => {
  const handler = mausKnopf.slice(mausKnopf.indexOf("knopf.addEventListener(\"click\""));
  const feld = handler.indexOf("belegeStartfeldMitMausVorlage()");
  const dialog = handler.indexOf("globalThis.prompt?.(");
  assert.ok(feld > -1 && dialog > feld, "erst Chat-Feld, dann Dialog");
  assert.match(handler, /if \(belegeStartfeldMitMausVorlage\(\)\) \{[\s\S]*?return;\s*\}/);
});

test("F12: beim Modul-Start ist state.tabs leer — der Speicher selbst muss bereinigt werden", () => {
  const ablage = new Map();
  const tabs = Array.from({ length: 20 }, (_, i) => ({ id: `tab-${i + 1}`, url: i === 2 ? "https://accounts.google.com/signin" : `https://beispiel.de/s${i + 1}`, history: [], historyIndex: -1 }));
  ablage.set("smejj.browser.tabs.v1", JSON.stringify({ activeId: "tab-3", tabs }));
  const speicher = { getItem: (k) => ablage.get(k) ?? null, setItem: (k, v) => ablage.set(k, v) };
  assert.equal(bereinigeGespeicherteTabs(speicher), 12);
  const danach = JSON.parse(ablage.get("smejj.browser.tabs.v1"));
  assert.equal(danach.tabs.length, 8);
  assert.ok(!danach.tabs.some((t) => t.url.includes("accounts.google.com")));
  assert.equal(danach.activeId, "tab-20");
  assert.equal(bereinigeGespeicherteTabs({ getItem: () => "{kaputt", setItem: () => { throw new Error("nein"); } }), 0);
  assert.match(mausPanel, /entfernt \+= bereinigeGespeicherteTabs\(\);/, "init raeumt auch localStorage");
});
