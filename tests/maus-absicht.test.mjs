// smejj.com — Tests fuer die Maus-Weiche im Chat (2026-08-18).
//
// Gemessen wird das, was schiefgehen KANN, nicht was leicht zu pruefen ist:
//   1. Erkennt die Weiche den Chip-Satz — auch uebersetzt?
//   2. Laesst sie alles andere in Ruhe? (Ein falsch positiver Treffer wuerde
//      einen normalen Chat-Auftrag in den Browser umleiten — schlimmer als
//      gar keine Erkennung.)
//   3. Findet sie die Seite, auf der die Maus anfangen soll — und erfindet
//      sie KEINE, wenn keine dasteht?
//   4. Haengen Markup, Offline-Vorrat und Modul wirklich zusammen?
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAUS_VORLAGE,
  baueZeilenschreiber,
  istMausAuftrag,
  kurzeAdresse,
  mausAufgabeAus,
  startAdresseAus,
  oeffneZiel,
  warteAufSitzung
} from "../public/maus-absicht.js";

const CHIP_SATZ = `${MAUS_VORLAGE} auf smejj.com das Impressum oeffnen`;

test("Chip-Satz wird erkannt — deutsch und uebersetzt", () => {
  assert.equal(istMausAuftrag(CHIP_SATZ), true);
  // Genau der Weg, den start-chips.js nimmt: t() liefert die uebersetzte
  // Vorlage, mausAuftragErledigt() reicht sie als zweite Vorlage durch.
  const englisch = "Do this with the mouse in the browser: open the imprint on smejj.com";
  assert.equal(istMausAuftrag(englisch, [MAUS_VORLAGE, "Do this with the mouse in the browser:"]), true);
  // Englisch faengt zusaetzlich schon das freie Muster ab — die Vorlage ist
  // also Guertel UND Hosenträger, nicht die einzige Chance.
  assert.equal(istMausAuftrag(englisch), true);
  // Tuerkisch dagegen kennt kein freies Muster: HIER traegt die Uebersetzung
  // allein. Faellt sammleVorlagen() aus, faellt genau dieser Fall aus.
  const tuerkisch = "Tarayıcıda fareyle hallet: smejj.com künye sayfasını aç";
  assert.equal(istMausAuftrag(tuerkisch), false);
  assert.equal(istMausAuftrag(tuerkisch, [MAUS_VORLAGE, "Tarayıcıda fareyle hallet:"]), true);
});

test("frei getippt zaehlt auch", () => {
  assert.equal(istMausAuftrag("Suche mit der Maus im Browser nach Kaffee auf amazon.de"), true);
});

test("normale Auftraege bleiben unberuehrt", () => {
  for (const satz of [
    "Generiere ein Video von: einem Leuchtturm",
    "Was ist der Unterschied zwischen Maus und Trackball?",
    "Schreibe Code für: eine Browser-Erweiterung",
    "Erkläre mir, wie eine Computermaus funktioniert",
    ""
  ]) assert.equal(istMausAuftrag(satz), false, satz);
});

test("eine zu kurze Vorlage darf NICHT alles einfangen", () => {
  // Kaeme aus einer luecklosen Uebersetzung nur ":" oder "" zurueck, wuerde
  // sonst JEDER Satz als Maus-Auftrag gelten und der Chat waere tot.
  assert.equal(istMausAuftrag("Wie spät ist es?", [":", "", "Los:"]), false);
});

test("die Aufgabe wird sauber herausgeschaelt", () => {
  assert.equal(mausAufgabeAus(CHIP_SATZ), "auf smejj.com das Impressum oeffnen");
  assert.equal(mausAufgabeAus(`${MAUS_VORLAGE}`), "");
  // Vollbreiter Doppelpunkt (CJK) — start-chips.js setzt ihn ohne Leerzeichen.
  assert.equal(mausAufgabeAus("Los mit der Maus：jetzt klicken", ["Los mit der Maus："]), "jetzt klicken");
});

test("Startadresse: gefunden, wenn genannt", () => {
  assert.equal(startAdresseAus("auf smejj.com das Impressum oeffnen"), "https://smejj.com");
  assert.equal(startAdresseAus("gehe zu https://www.amazon.de/dp/B01 und klicke"), "https://www.amazon.de/dp/B01");
  assert.equal(kurzeAdresse("https://www.amazon.de/dp/B01"), "amazon.de");
});

test("Startadresse: NICHT erfunden, wenn keine dasteht", () => {
  // Der gefaehrliche Fall: "z.B." oder "Mo.-Fr." als Adresse zu lesen haette
  // die Maus auf einer erfundenen Seite loslaufen lassen.
  assert.equal(startAdresseAus("klicke den ersten Treffer an, z.B. den obersten"), "");
  assert.equal(startAdresseAus("oeffne Mo.-Fr. den Kalender"), "");
  assert.equal(startAdresseAus(""), "");
});

test("auf die Sitzung wird gewartet, nicht sofort aufgegeben", async () => {
  let n = 0;
  const tab = () => (n++ >= 3 ? { sessionId: "s1" } : {});
  assert.deepEqual(await warteAufSitzung({ tab, warte: async () => {} }), { ok: true });

  const nie = await warteAufSitzung({ tab: () => ({}), warte: async () => {}, versuche: 2 });
  assert.equal(nie.ok, false);
  assert.match(nie.grund, /Live-Browser/);
});

test("Zeilenschreiber: Denkpunkte weg, keine Wiederholung", () => {
  const ausgabe = { dataset: { thinking: "true" }, textContent: "smejj denkt nach..." };
  const schreibe = baueZeilenschreiber(ausgabe);
  schreibe("Maus 1/10: sieht sich die Seite an ...");
  schreibe("Maus 1/10: sieht sich die Seite an ...");
  schreibe("Maus 1/10: klickt Suchen");
  assert.equal(ausgabe.dataset.thinking, undefined);
  assert.equal(ausgabe.textContent, "Maus 1/10: sieht sich die Seite an ...\nMaus 1/10: klickt Suchen");
});

test("Startseiten-Chip springt nicht mehr weg, sondern setzt die Vorlage", () => {
  const html = fs.readFileSync("public/index.html", "utf8");
  const reihe = html.match(/<div class="start-chips start-chipreihe"[\s\S]*?<\/div>/);
  assert.ok(reihe, "Werkzeug-Chipreihe der Startseite fehlt");
  const chip = reihe[0].match(/<button[^>]*aria-label="Maus[^"]*"[^>]*>/);
  assert.ok(chip, "Maus-Chip fehlt in der Chipreihe");
  assert.ok(!/data-jump/.test(chip[0]), "der Maus-Chip darf die Startseite nicht mehr verlassen");
  assert.match(chip[0], /data-chip="Erledige mit der Maus im Browser:"/);
  // Der Browser-Eintrag im rechten Panel bleibt ein Sprung — nur der
  // Startseiten-Chip nicht mehr.
  assert.ok(!/data-jump="websites"/.test(reihe[0]));
});

test("Kette haengt zusammen: app.js -> Modul -> Offline-Vorrat", () => {
  // Seit dem Sendepfad-Buendel (24.08.) laedt app.js die Weiche erst beim
  // Senden: app.js -> sendepfad-nachladen.js -> maus-absicht.js. Die Zusage
  // (Auftrag erkannt -> Maus uebernimmt -> offline vorraetig) ist dieselbe.
  const app = fs.readFileSync("public/app.js", "utf8");
  const sendepfad = fs.readFileSync("public/sendepfad-nachladen.js", "utf8");
  // Die Marke wird NICHT gepinnt (Lehre 2026-09-04): jede Aenderung tiefer in
  // der Kette zieht sie hoch, und ein gepinnter Test faerbt dann rot, obwohl
  // die Verdrahtung stimmt. Geprueft wird der Modulname, die Marke nur auf
  // Form — check-markenkette.mjs wacht ueber ihre Gleichheit.
  assert.match(app, /import \{ holeSendepfad \} from "\.\/sendepfad-nachladen\.js\?v=\d+"/);
  assert.match(app, /await M\.mausAuftragErledigt\(\{ task, output \}\)/);
  assert.match(sendepfad, /import\("\.\/maus-absicht\.js\?v=\d+"\)/);
  assert.match(fs.readFileSync("public/sw.js", "utf8"), /"\/assets\/maus-absicht\.js"/);
});

test("?v=-Marken zeigen auf DIESELBE Kopie wie index.html", () => {
  // Eine abweichende Marke ist fuer den Browser eine zweite Datei mit eigenem
  // Zustand — die Maus fande dann nie einen Tab. Nichts waere zu sehen.
  const modul = fs.readFileSync("public/maus-absicht.js", "utf8");
  // Seit 2026-08-23 laedt nicht mehr index.html das Pane, sondern
  // browser-nachladen.js (63,3 KB weniger beim ersten Aufbau). Die Referenz
  // fuer die Marke ist damit der Nachlader — die Zusage selbst ist dieselbe.
  const html = fs.readFileSync("public/browser-nachladen.js", "utf8");
  const pane = fs.readFileSync("public/browser-pane.js", "utf8");
  const marke = (text, datei) => text.match(new RegExp(`${datei}(\\?v=[^"']*)`))?.[1];
  assert.equal(marke(modul, "browser-pane\\.js"), marke(html, "browser-pane\\.js"));
  assert.equal(marke(modul, "browser-pane-maus\\.js"), marke(pane, "browser-pane-maus\\.js"));
});

test("alle 14 Sprachen kennen die Vorlage", () => {
  for (const code of ["en", "es", "fr", "it", "pt", "ru", "tr", "id", "hi", "bn", "ar", "ja", "ko", "zh"]) {
    const datei = fs.readFileSync(`public/i18n/${code}.js`, "utf8");
    assert.ok(datei.includes('"Erledige mit der Maus im Browser:"'), `${code} fehlt`);
  }
});

test("volles Panel blockiert die Maus nicht mehr — und die Meldung luegt nicht", () => {
  // Live gemessen im Browser des Betreibers: sieben Tabs offen, addTab() gab
  // nichts zurueck, openBrowserRequest() meldete false — und die alte Fassung
  // schrieb "es geht nur https" fuer https://smejj.com. Der falsche Grund hat
  // die Fehlersuche in die Irre geschickt.
  const gesagt = [];
  const ereignisse = [];
  const adresszeile = { value: "", dispatchEvent: (e) => ereignisse.push(e.key) };
  const vollesPanel = {
    openBrowserRequest: () => false,
    normalizeAgentBrowserUrl: (u) => u,
    openPane: () => {},
    refs: { address: adresszeile },
    state: { tabs: new Array(7) }
  };
  const ergebnis = oeffneZiel("https://smejj.com", vollesPanel, (t) => gesagt.push(t));
  assert.equal(ergebnis.ok, true, "bei vollem Panel muss der aktive Tab einspringen");
  assert.equal(adresszeile.value, "https://smejj.com");
  assert.deepEqual(ereignisse, ["Enter"]);
  assert.match(gesagt.join(" "), /7 Tabs/, "der Nutzer muss erfahren, dass sein aktiver Tab benutzt wird");
  assert.ok(!gesagt.join(" ").includes("https"), "kein falscher https-Grund");
});

test("eine wirklich unbrauchbare Adresse nennt den richtigen Grund", () => {
  const panel = { openBrowserRequest: () => false, normalizeAgentBrowserUrl: () => "" };
  const ergebnis = oeffneZiel("http://unsicher.example", panel, () => {});
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.grund, /nur https/);
});

test("der Rat beim fehlenden Live-Browser schickt niemanden im Kreis", async () => {
  const nie = await warteAufSitzung({ tab: () => ({}), warte: async () => {}, versuche: 1 });
  assert.ok(!/neu laden/i.test(nie.grund), "Neuladen hilft nicht, also darf es nicht empfohlen werden");
  assert.match(nie.grund, /Server/);
});

// --- Der Zustand der Bruecke: die zwei Seiten muessen sich WIDERSPRECHEN duerfen
//
// Am 2026-08-20/21 sind mehrere Runden daran verlorengegangen, dass das
// Erweiterungsfenster "Freigegeben noch 30 Minuten" zeigte, der Speicher der
// Bruecke aber leer war. Wer nur EINE der beiden Zahlen anzeigt, baut die
// Falle wieder auf. Diese Tests halten fest, dass der Unterschied auffaellt.
const { deuteBrueckenZustand } = await import("../public/maus-absicht.js");

test("ohne Bruecke sagt es das, statt zu schweigen", () => {
  const befund = deuteBrueckenZustand(null, { installiert: false });
  assert.equal(befund.ton, "fehlt");
  assert.match(befund.text, /nicht installiert/);
});

test("antwortet die Bruecke nicht, folgt daraus ein Handgriff", () => {
  const befund = deuteBrueckenZustand({ ok: false, error: "bruecke_antwortet_nicht" });
  assert.equal(befund.ton, "warnung");
  assert.match(befund.text, /chrome:\/\/extensions/);
});

test("DER FALL VOM 20.08.: gemerkt, aber Chrome haelt das Recht nicht", () => {
  const befund = deuteBrueckenZustand({
    ok: true, version: "0.5.0",
    freigaben: [{ herkunft: "https://mail.google.com", restMinuten: 28 }],
    chromeRechte: []
  });
  assert.equal(befund.ton, "warnung");
  assert.match(befund.text, /mail\.google\.com/);
  // Der sichtbare Text traegt inzwischen echte Umlaute ("hält"); die Probe darf
  // nicht an der Schreibweise haengen, sondern an der Aussage.
  assert.match(befund.text, /Chrome h(ä|ae)lt das Recht NICHT/);
});

test("der umgekehrte Fall faellt ebenso auf", () => {
  const befund = deuteBrueckenZustand({
    ok: true, version: "0.5.0",
    freigaben: [],
    chromeRechte: ["https://www.alibaba.com/*"]
  });
  assert.equal(befund.ton, "warnung");
  assert.match(befund.text, /nicht kennt/);
});

test("eine ABGELAUFENE Freigabe zaehlt nicht als offen", () => {
  const befund = deuteBrueckenZustand({
    ok: true, freigaben: [{ herkunft: "https://mail.google.com", restMinuten: 0 }], chromeRechte: []
  });
  assert.equal(befund.ton, "gut");
  assert.match(befund.text, /keine Freigabe aktiv/);
});

test("sind sich beide Seiten einig, steht die Restzeit da", () => {
  const befund = deuteBrueckenZustand({
    ok: true, version: "0.5.0",
    freigaben: [{ herkunft: "https://mail.google.com", restMinuten: 28 }],
    chromeRechte: ["https://mail.google.com/*"]
  });
  assert.equal(befund.ton, "gut", befund.text);
  assert.match(befund.text, /noch 28 min/);
});

test("Muster und Herkunft meinen dasselbe — kein erfundener Unterschied", () => {
  for (const recht of ["https://mail.google.com/*", "https://mail.google.com/", "https://mail.google.com"]) {
    const befund = deuteBrueckenZustand({
      ok: true, freigaben: [{ herkunft: "https://mail.google.com", restMinuten: 5 }], chromeRechte: [recht]
    });
    assert.equal(befund.ton, "gut", `${recht} wurde als Unterschied gelesen: ${befund.text}`);
  }
});
