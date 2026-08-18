// Das Bindeglied: ein Maus-Plan, ausgefuehrt IM Panel.
//
// Der Server plant (dort liegen Modelle und Pruefung), das Panel faehrt —
// weil es nach jeder Aktion ein neues Bild zeichnet und der Betreiber dadurch
// ZUSIEHT. Diese Tests halten die Uebersetzung fest, nicht das Aussehen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  alsSitzungsAktion, planAlsAuftraege, beschreibe, fahreAuftraege
} from "../public/browser-pane-maus.js";

test("Klicken und Tippen werden auf Elemente uebersetzt, nicht auf Pixel", () => {
  const klick = alsSitzungsAktion({ action: "click", target: { strategy: "role", value: "link", name: "Impressum" } });
  assert.deepEqual(klick.aktion, { type: "selectorClick", strategy: "role", value: "link", name: "Impressum" });

  const tippen = alsSitzungsAktion({ action: "type", target: { strategy: "label", value: "Suche" }, text: "Kaffee" });
  assert.deepEqual(tippen.aktion, { type: "selectorType", strategy: "label", value: "Suche", text: "Kaffee" });
});

// Die Sitzung ist beim Start schon offen — ein "Browser oeffnen" waere hier
// sinnlos, ein "Browser schliessen" sogar schaedlich.
test("Schritte, die im Panel keinen Sinn ergeben, werden uebersprungen", () => {
  for (const a of ["openBrowser", "closeBrowser", "screenshot", "httpRequest"]) {
    assert.equal(alsSitzungsAktion({ action: a }).ueberspringen, a);
  }
  // Warten braucht es nicht: jede Aktion wartet ohnehin auf ihr Ziel.
  assert.equal(alsSitzungsAktion({ action: "waitFor" }).ueberspringen, "waitFor");
});

test("ein Klick ohne Ziel wird als Fehler gemeldet, nicht geraten", () => {
  assert.equal(alsSitzungsAktion({ action: "click" }).fehler, "klick_ohne_ziel");
  assert.equal(alsSitzungsAktion({ action: "navigate", url: "nicht-http" }).fehler, "navigate_ohne_adresse");
});

// Der Beweis, dass das Bindeglied mit ECHTEN Plaenen umgeht — nicht nur mit
// erfundenen Beispielen.
test("ein echter Plan aus dem Repo laesst sich uebersetzen", () => {
  const datei = fs.readdirSync("workers/maus-engine/plaene").find((f) => f.endsWith(".json"));
  const plan = JSON.parse(fs.readFileSync(`workers/maus-engine/plaene/${datei}`, "utf8"));
  const auftraege = planAlsAuftraege(plan);
  assert.ok(auftraege.length > 0, `aus ${datei} kam kein einziger Auftrag heraus`);
  assert.ok(auftraege.every((a) => typeof a.aktion?.type === "string"));
  assert.ok(auftraege.every((a) => a.beschreibung && a.beschreibung.length > 0),
    "jeder Schritt braucht einen Satz, den ein Mensch lesen kann");
});

test("die Beschreibung ist ein Satz fuer Menschen, keine Kennung", () => {
  assert.match(beschreibe({ action: "navigate", url: "https://smejj.com/" }), /Seite oeffnen/);
  assert.match(beschreibe({ action: "click", target: { name: "Impressum" } }), /Klicken: Impressum/);
});

// Fail-closed: ein halb ausgefuehrter Plan auf einer fremden Seite ist
// gefaehrlicher als ein abgebrochener.
test("bricht ein Schritt, laeuft der Plan NICHT blind weiter", async () => {
  const gesendet = [];
  const ergebnis = await fahreAuftraege({
    auftraege: [
      { beschreibung: "eins", aktion: { type: "scroll", deltaY: 100 } },
      { beschreibung: "zwei", aktion: { type: "scroll", deltaY: 100 } },
      { beschreibung: "drei", aktion: { type: "scroll", deltaY: 100 } }
    ],
    pauseMs: 0,
    sende: async (a) => { gesendet.push(a); return gesendet.length === 2 ? { ok: false } : { ok: true }; }
  });
  assert.equal(gesendet.length, 2, "nach dem Fehler darf nichts mehr gesendet werden");
  assert.equal(ergebnis.getan, 1);
  assert.equal(ergebnis.fehler, "zwei");
});

test("gelesene Werte werden unter ihrem Namen gesammelt", async () => {
  const ergebnis = await fahreAuftraege({
    auftraege: [{ beschreibung: "Lesen", aktion: { type: "selectorText" }, liestAls: "titel" }],
    pauseMs: 0,
    sende: async () => ({ ok: true, gelesen: "Hilfe" })
  });
  assert.deepEqual(ergebnis.gelesen, { titel: "Hilfe" });
});

// Der Nutzer soll mitkommen — deshalb wird angezeigt, WO der Lauf steht.
test("jeder Schritt wird angezeigt, mit Nummer und Gesamtzahl", async () => {
  const gezeigt = [];
  await fahreAuftraege({
    auftraege: [
      { beschreibung: "eins", aktion: {} },
      { beschreibung: "zwei", aktion: {} }
    ],
    pauseMs: 0,
    zeige: (text, nr, gesamt) => gezeigt.push(`${nr}/${gesamt} ${text}`),
    sende: async () => ({ ok: true })
  });
  assert.deepEqual(gezeigt, ["1/2 eins", "2/2 zwei"]);
});

test("ein Abbruch haelt den Lauf sofort an", async () => {
  let n = 0;
  const ergebnis = await fahreAuftraege({
    auftraege: [{ beschreibung: "a", aktion: {} }, { beschreibung: "b", aktion: {} }],
    pauseMs: 0,
    abbruch: () => n >= 1,
    sende: async () => { n += 1; return { ok: true }; }
  });
  assert.equal(ergebnis.abgebrochen, true);
  assert.equal(ergebnis.getan, 1);
});

// --- Der Knopf ---------------------------------------------------------------

// DIE WICHTIGSTE ZEILE DES MODULS: die Maus bekommt nur den Host, den der
// Nutzer gerade offen hat. Sonst haette sie eine offene Tuer ins ganze Netz —
// und sie klickt selbstaendig.
test("die Erlaubnis gilt nur fuer die offene Seite", async () => {
  const { erlaubteHosts } = await import("../public/browser-pane-maus.js");
  assert.deepEqual(erlaubteHosts("https://www.amazon.com/dp/B01"), ["www.amazon.com"]);
  assert.deepEqual(erlaubteHosts(""), [], "ohne Seite keine Erlaubnis");
  assert.deepEqual(erlaubteHosts("kein-url"), []);
});

test("ohne Live-Browser wird ehrlich abgelehnt statt blind losgelaufen", async () => {
  const { fuehreMausAuftragAus } = await import("../public/browser-pane-maus.js");
  const ohneSitzung = await fuehreMausAuftragAus({ auftrag: "x", tab: { url: "https://a.de/" }, sende: async () => ({ ok: true }) });
  assert.equal(ohneSitzung.ok, false);
  assert.match(ohneSitzung.grund, /Live-Browser/);

  const ohneSeite = await fuehreMausAuftragAus({ auftrag: "x", tab: { sessionId: "s1" }, sende: async () => ({ ok: true }) });
  assert.equal(ohneSeite.ok, false);
  assert.match(ohneSeite.grund, /Seite oeffnen/);
});

// Der Knopf sitzt auf einem der beiden Platzhalter, die rechts ohnehin
// reserviert waren — die Kopfgeometrie darf sich NICHT aendern.
test("der Knopf sprengt die Kopfgeometrie nicht", async () => {
  const fs = await import("node:fs");
  const shell = fs.readFileSync("public/browser-pane-render.js", "utf8");
  assert.match(shell, /class="bp-maus"/);
  // Genau bis zum Ende des Blocks schneiden — ein festes Zeichenfenster
  // greift ueber das schliessende </div> hinaus und zaehlt Fremdes mit.
  const start = shell.indexOf('class="bp-tab-right"');
  const rechts = shell.slice(start, shell.indexOf("</div>", start));
  const elemente = (rechts.match(/<button|<span/g) || []).length;
  assert.equal(elemente, 3, "rechts bleiben genau drei Plaetze — die Seitenbreite rechnet damit");
});
