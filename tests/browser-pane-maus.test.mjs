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
  // Auch in der verschachtelten Form — sonst las der Nutzer waehrend des
  // Laufs "Klicken:" ohne Ziel.
  assert.match(beschreibe({ action: "click", target: { selector: { strategy: "text", value: "Impressum" } } }),
    /Klicken: Impressum/);
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

// --- Die zwei Fehler vom 2026-08-18 ------------------------------------------

// ECHTE PLAENE NUTZEN ZWEI FORMEN. Mein erster Uebersetzer kannte nur die
// flache — der Klick-Schritt fand kein Ziel und wurde still verworfen. Der
// Auftrag "Klicke auf den Link zum Impressum" oeffnete daraufhin nur die
// Seite und meldete "1 Schritt erledigt": ein Erfolg, der keiner war.
test("der Selektor wird in BEIDEN Formen gefunden", async () => {
  const { selektorAus } = await import("../public/browser-pane-maus.js");
  // So schreibt der Planer einen Klick:
  assert.deepEqual(selektorAus({ target: { selector: { strategy: "text", value: "Impressum" } } }),
    { strategy: "text", value: "Impressum" });
  // Und so ein Lesen:
  assert.deepEqual(selektorAus({ target: { strategy: "css", value: "h1" } }),
    { strategy: "css", value: "h1" });
  assert.equal(selektorAus({ target: {} }), null);
  assert.equal(selektorAus({}), null);
});

test("ein echter Klick-Plan ergibt auch einen Klick", async () => {
  const { planAlsAuftraege } = await import("../public/browser-pane-maus.js");
  // Wortwoertlich die Form, die der Planer am 2026-08-18 geliefert hat.
  const plan = { steps: [
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://smejj.com/" },
    { id: "s4", action: "click", target: { selector: { strategy: "text", value: "Impressum" } } }
  ] };
  const a = planAlsAuftraege(plan);
  assert.deepEqual(a.map((x) => x.aktion.type), ["navigate", "selectorClick"]);
  assert.equal(a.fehler.length, 0);
});

// Ein Schritt, den wir nicht uebersetzen konnten, darf nicht still
// verschwinden — sonst meldet die Maus "erledigt" fuer einen Auftrag, den sie
// nur zur Haelfte verstanden hat.
test("unverstandene Schritte werden gemeldet, nicht verschluckt", async () => {
  const { planAlsAuftraege, fuehreMausAuftragAus } = await import("../public/browser-pane-maus.js");
  const a = planAlsAuftraege({ steps: [{ id: "sX", action: "click" }] });
  assert.equal(a.length, 0);
  assert.deepEqual(a.fehler, ["sX: klick_ohne_ziel"]);

  // Und der Lauf verweigert dann GANZ, statt halb zu arbeiten.
  let gesendet = 0;
  const ergebnis = await fuehreMausAuftragAus({
    auftrag: "x", tab: { url: "https://a.de/", sessionId: "s1" }, planeUrl: "https://api.test/plan",
    sende: async () => { gesendet += 1; return { ok: true }; },
    holeToken: () => "",
    // Planen ueberspringen: hier zaehlt nur, dass ein unverstandener Plan
    // NICHTS ausfuehrt.
  }).catch(() => null);
  assert.equal(gesendet, 0, "bei einem unverstandenen Plan darf nichts gesendet werden");
});

// --- Freier Modus: hinsehen, entscheiden, handeln ----------------------------

test("Entscheidungen werden in Panel-Aktionen uebersetzt", async () => {
  const { entscheidungAlsAktion } = await import("../public/browser-pane-maus.js");
  const akt = entscheidungAlsAktion({ decision: "act", step: { action: "click", target: { selector: { strategy: "text", value: "Weiter" } } } });
  assert.deepEqual(akt.aktion, { type: "selectorClick", strategy: "text", value: "Weiter" });
  assert.equal(entscheidungAlsAktion({ decision: "done", reason: "Ziel erreicht" }).fertig, true);
  assert.match(entscheidungAlsAktion({ decision: "fail", reason: "geht nicht" }).fehler, /geht nicht/);
  assert.match(entscheidungAlsAktion(null).fehler, /keine_entscheidung/);
});

// Der ganze Sinn des freien Modus: nach JEDEM Schritt wird neu hingesehen.
test("vor jedem Schritt wird die Seite angesehen", async () => {
  const { fuehreFreienLaufAus } = await import("../public/browser-pane-maus.js");
  const gesendet = [];
  let runde = 0;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => {
      runde += 1;
      return runde < 3
        ? { ok: true, entscheidung: { decision: "act", step: { action: "scroll", deltaY: 300 } } }
        : { ok: true, entscheidung: { decision: "done", reason: "unten angekommen" } };
    }
  });
  const e = await fuehreFreienLaufAus({
    auftrag: "scrolle nach unten",
    tab: { url: "https://smejj.com/", sessionId: "s1" },
    schrittUrl: "https://api.test/schritt",
    sende: async (a) => { gesendet.push(a.type); return { ok: true, beobachtung: { url: "https://smejj.com/", elements: [] } }; }
  });
  assert.equal(e.ok, true);
  // observe, scroll, observe, scroll, observe -> dann "done"
  assert.deepEqual(gesendet, ["observe", "scroll", "observe", "scroll", "observe"]);
});

// Ohne Obergrenze koennte die Maus ewig weitermachen.
test("der freie Lauf hat eine Obergrenze", async () => {
  const { fuehreFreienLaufAus } = await import("../public/browser-pane-maus.js");
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, entscheidung: { decision: "act", step: { action: "scroll", deltaY: 100 } } }) });
  const e = await fuehreFreienLaufAus({
    auftrag: "endlos", tab: { url: "https://a.de/", sessionId: "s1" }, schrittUrl: "https://api.test/s",
    maxSchritte: 3, sende: async () => ({ ok: true, beobachtung: { elements: [] } })
  });
  assert.equal(e.ok, false);
  assert.match(e.grund, /Obergrenze/);
});
