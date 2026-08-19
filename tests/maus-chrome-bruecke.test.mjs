// smejj.com — die Maus im eigenen Chrome (Betreiber-Auftrag "1 zu 1 wie Claude").
//
// Geprueft wird, was schiefgehen KANN:
//   1. Antwortet die Bruecke nie, muss der Lauf ENDEN — nicht ewig stehen.
//   2. Fremde Nachrichten duerfen keine Antwort vortaeuschen.
//   3. Die Fehlerkennungen muessen zu einem HANDGRIFF werden, nicht zu Kauderwelsch.
//   4. Erweiterung und Seite muessen dasselbe Vokabular sprechen — sonst
//      klickt die Maus im eigenen Chrome anders als im fernen Browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { deuteChromeFehler } from "../public/maus-absicht.js";
import { sendeAnChrome } from "../public/maus-chrome.js";

// Ein Fenster, das sich wie das echte verhaelt: postMessage stellt zu,
// addEventListener/removeEventListener zaehlen mit.
function fensterAttrappe({ antwortet = true, fremd = false } = {}) {
  const horcher = new Set();
  const fenster = {
    location: { origin: "https://smejj.com" },
    gesendet: [],
    addEventListener: (_t, f) => horcher.add(f),
    removeEventListener: (_t, f) => horcher.delete(f),
    horcherAnzahl: () => horcher.size,
    postMessage(daten) {
      fenster.gesendet.push(daten);
      if (!antwortet) return;
      const quelle = fremd ? {} : fenster;
      queueMicrotask(() => {
        for (const f of [...horcher]) {
          f({ source: quelle, data: { marke: "smejj-maus-bruecke", antwortAuf: daten.ruf, antwort: { ok: true, beobachtung: { url: "https://smejj.com/" } } } });
        }
      });
    }
  };
  return fenster;
}

test("eine Aktion geht hin und die Antwort kommt zurueck", async () => {
  const fenster = fensterAttrappe();
  const antwort = await sendeAnChrome({ type: "observe" }, { fenster });
  assert.equal(antwort.ok, true);
  assert.equal(antwort.beobachtung.url, "https://smejj.com/");
  assert.equal(fenster.gesendet[0].nachricht.aktion.type, "observe");
  assert.equal(fenster.horcherAnzahl(), 0, "der Horcher muss wieder abgeraeumt werden");
});

test("antwortet die Bruecke nie, endet der Lauf ehrlich", async () => {
  // Ohne Zeitgrenze bliebe der freie Lauf fuer immer stehen — ohne Zeile,
  // ohne Fehler, ohne Ende. Das ist schlimmer als ein ehrlicher Abbruch.
  const fenster = fensterAttrappe({ antwortet: false });
  const antwort = await sendeAnChrome({ type: "observe" }, { fenster, grenzeMs: 20 });
  assert.deepEqual(antwort, { ok: false, error: "bruecke_antwortet_nicht" });
  assert.equal(fenster.horcherAnzahl(), 0);
});

test("eine Nachricht aus einem FREMDEN Fenster zaehlt nicht", async () => {
  const fenster = fensterAttrappe({ fremd: true });
  const antwort = await sendeAnChrome({ type: "observe" }, { fenster, grenzeMs: 30 });
  assert.equal(antwort.error, "bruecke_antwortet_nicht", "fremde Herkunft darf keine Antwort vortaeuschen");
});

test("Fehlerkennungen werden zu einem Handgriff", () => {
  const fehlt = deuteChromeFehler("herkunft_nicht_freigegeben: https://smejj.com", "https://smejj.com");
  assert.match(fehlt, /30 Minuten erlauben/, "der Nutzer muss erfahren, WAS er klicken soll");
  assert.match(fehlt, /smejj\.com/);
  assert.match(deuteChromeFehler("nur_https", "http://x.de"), /https/);
  assert.match(deuteChromeFehler("bruecke_antwortet_nicht", "https://a.de"), /chrome:\/\/extensions/);
  // Auch ein unbekannter Grund wird durchgereicht statt ersetzt — genau daran
  // ist die Fehlersuche am 2026-08-18 schon einmal gescheitert.
  assert.match(deuteChromeFehler("etwas_neues", "https://a.de"), /etwas_neues/);
});

test("Erweiterung und ferner Browser sprechen DASSELBE Vokabular", () => {
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Was der freie Lauf schickt (browser-pane-maus.js -> alsSitzungsAktion),
  // muss BEIDE Seiten erreichen. Ein Wort, das nur eine Seite kennt, faellt
  // still weg — und die Maus meldet "erledigt" fuer etwas, das nie lief.
  for (const wort of ["observe", "selectorClick", "selectorType", "selectorText", "navigate", "scroll"]) {
    assert.ok(hintergrund.includes(`"${wort}"`), `Erweiterung kennt ${wort} nicht`);
    assert.ok(engine.includes(`"${wort}"`), `ferner Browser kennt ${wort} nicht`);
  }
});

test("die Bruecke schreibt keine Passwoerter und fuehrt keinen Fremdtext aus", () => {
  const aktionen = fs.readFileSync("extensions/smejj-maus-bruecke/aktionen.js", "utf8");
  assert.match(aktionen, /passwortfeld_verboten/);
  assert.ok(!/\beval\s*\(|new Function\s*\(/.test(aktionen), "kein eval, keine Function-Fabrik");
  // xpath greift zu leicht quer durch fremde Dokumente — im ANGEMELDETEN
  // Chrome ein anderes Risiko als im Wegwerf-Browser des Servers.
  // Auf das WORT zu pruefen war falsch: es steht auch im Kommentar, der
  // erklaert, warum xpath fehlt. Geprueft wird die UMSETZUNG.
  assert.ok(!/case\s*["']xpath["']/.test(aktionen), "xpath bleibt im eigenen Chrome gesperrt");
  assert.ok(!/document\.evaluate/.test(aktionen), "auch nicht ueber document.evaluate");
});

test("die Erweiterung darf nur von smejj.com angesprochen werden", () => {
  const manifest = JSON.parse(fs.readFileSync("extensions/smejj-maus-bruecke/manifest.json", "utf8"));
  assert.deepEqual(manifest.externally_connectable.matches, ["https://smejj.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://smejj.com/*"]);
  // tabs wird gebraucht, um die HERKUNFT des Arbeits-Tabs gegen die Freigabe
  // zu pruefen. Ohne diese Berechtigung liefert Chrome keine URL.
  assert.ok(manifest.permissions.includes("tabs"));
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"], "Zielseiten bleiben OPTIONAL — der Nutzer gibt sie einzeln frei");
});

test("die Maus arbeitet in einem EIGENEN Tab, nicht im aktiven", () => {
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  // Der aktive Tab ist waehrend eines Auftrags fast immer smejj.com selbst.
  // Wer dort klickt, bedient die eigene App statt der Zielseite — und ein
  // Tabwechsel des Nutzers mitten im Lauf wuerde die Maus in eine fremde
  // Seite springen lassen.
  assert.match(hintergrund, /mausTabId/);
  assert.match(hintergrund, /chrome\.tabs\.create/);
});
