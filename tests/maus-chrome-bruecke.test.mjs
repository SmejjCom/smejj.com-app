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

// --- Aus einer Ablehnung lernen ----------------------------------------------
// Live gemessen 2026-08-18: die Maus kam bis "ueberlegt", der Server lehnte
// ihren Schritt als Formfehler ab (openLink mit "url" statt "target"), und der
// ganze Auftrag endete. Das Modell haette sich korrigieren koennen — es erfuhr
// den Grund nur nie.
test("eine abgelehnte Entscheidung beendet den Auftrag nicht mehr", async () => {
  const { fuehreFreienLaufAus, VERWURF_GRENZE } = await import("../public/browser-pane-maus.js");
  const gesagt = [];
  let anfragen = 0;
  const antworten = [
    { status: 422, leib: { ok: false, error: "entscheidung_abgelehnt", gruende: ["$.steps[0]: Pflichtfeld fehlt: target"] } },
    { status: 200, leib: { ok: true, entscheidung: { decision: "done", reason: "Impressum ist offen" } } }
  ];
  globalThis.fetch = async (_url, o) => {
    const koerper = JSON.parse(o.body);
    anfragen += 1;
    // Der zweite Anlauf MUSS den Grund im Verlauf mitbekommen — sonst wiederholt
    // das Modell denselben Fehler und das Ganze ist nur eine teure Schleife.
    if (anfragen === 2) {
      assert.ok(
        koerper.verlauf.some((z) => /VERWORFEN/.test(z) && /target/.test(z)),
        "der Ablehnungsgrund fehlt im zweiten Anlauf"
      );
    }
    const a = antworten[anfragen - 1];
    return { ok: a.status === 200, status: a.status, json: async () => a.leib };
  };
  const ergebnis = await fuehreFreienLaufAus({
    auftrag: "Impressum oeffnen",
    tab: { url: "https://smejj.com/", sessionId: "s1" },
    schrittUrl: "https://beispiel.test/api/maus/run",
    sende: async () => ({ ok: true, beobachtung: { url: "https://smejj.com/", elements: [] } }),
    zeige: (t) => gesagt.push(t)
  });
  assert.equal(ergebnis.ok, true, "nach der Korrektur muss der Lauf durchgehen");
  assert.equal(anfragen, 2);
  assert.match(gesagt.join(" "), /versucht es anders/);
  assert.ok(VERWURF_GRENZE >= 1);
});

test("aus dem Lernen wird keine Endlosschleife", async () => {
  const { fuehreFreienLaufAus, VERWURF_GRENZE } = await import("../public/browser-pane-maus.js");
  let anfragen = 0;
  globalThis.fetch = async () => {
    anfragen += 1;
    return { ok: false, status: 422, json: async () => ({ ok: false, error: "entscheidung_abgelehnt", gruende: ["immer derselbe Fehler"] }) };
  };
  const ergebnis = await fuehreFreienLaufAus({
    auftrag: "x",
    tab: { url: "https://smejj.com/", sessionId: "s1" },
    schrittUrl: "https://beispiel.test/api/maus/run",
    sende: async () => ({ ok: true, beobachtung: { url: "https://smejj.com/", elements: [] } }),
    zeige: () => {}
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(anfragen, VERWURF_GRENZE + 1, "nach der Grenze muss Schluss sein");
  // Und der Grund muss beim Nutzer ankommen, nicht nur die Kennung.
  assert.match(ergebnis.grund, /immer derselbe Fehler/);
});

// --- Der Weg, den die Seite WIRKLICH nimmt ----------------------------------
test("die Bruecke horcht auf BEIDE Eingaenge", () => {
  // Gefunden 2026-08-19, vor dem ersten echten Einsatz: die Bruecke hatte nur
  // onMessageExternal. Eine Nachricht aus dem EIGENEN Inhaltsskript kommt dort
  // nie an — chrome.runtime.sendMessage aus einem Inhaltsskript landet immer
  // bei onMessage. Der Weg, den die Seite tatsaechlich nimmt, war also tot,
  // und zwar lautlos: die Seite haette bis zur Zeitgrenze gewartet und dann
  // gemeldet, die Bruecke antworte nicht — als waere sie nicht installiert.
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  assert.match(hintergrund, /onMessageExternal\?\.addListener/);
  assert.match(hintergrund, /onMessage\?\.addListener/);
  // Beide muessen DIESELBE Pruefung durchlaufen, sonst ist einer die Hintertuer.
  assert.equal((hintergrund.match(/baueEmpfang\(\)/g) || []).length, 2, "ein Eingang benutzt eine eigene Pruefung");
  assert.match(hintergrund, /absender\?\.origin \|\| absender\?\.url/);
});

test("ein Freigabeziel wird streng gelesen", async () => {
  const { alsHerkunft } = await import("../extensions/smejj-maus-bruecke/adresse.js");
  assert.equal(alsHerkunft("mail.google.com"), "https://mail.google.com");
  assert.equal(alsHerkunft("https://mail.google.com/mail/u/0"), "https://mail.google.com");
  // http bleibt gesperrt: im ANGEMELDETEN Chrome waere das ein Klartext-Leck.
  assert.equal(alsHerkunft("http://mail.google.com"), null);
  // Ein Wort ohne Punkt ist ein Vertipper, kein Ziel.
  assert.equal(alsHerkunft("mail"), null);
  assert.equal(alsHerkunft(""), null);
  assert.equal(alsHerkunft("   "), null);
});

// --- Aussetzer des Planers ---------------------------------------------------
// Gemessen 2026-08-19 am Live-Server: dieselbe Anfrage dreimal hintereinander
// ergab 200 (fertige Entscheidung), 502, 502. Das Modell schweigt manchmal bei
// gleicher Eingabe. Ohne Wiederholung endet ein Auftrag an so einem Zufall.
test("ein Aussetzer beendet den Auftrag nicht — und kostet keinen Schritt", async () => {
  const { fuehreFreienLaufAus, AUSSETZER_GRENZE } = await import("../public/browser-pane-maus.js");
  const zeilen = [];
  let anfragen = 0;
  globalThis.fetch = async (_u, o) => {
    anfragen += 1;
    if (anfragen === 1) return { ok: false, status: 502, json: async () => ({ ok: false, error: "planer_leere_antwort" }) };
    // Der zweite Anlauf darf dem Modell den Aussetzer NICHT vorhalten — das
    // wuerde seine naechste Antwort nur verwirren.
    const koerper = JSON.parse(o.body);
    assert.ok(!koerper.verlauf.some((z) => /VERWORFEN|leere/i.test(z)), "der Aussetzer gehoert nicht in den Verlauf");
    return { ok: true, status: 200, json: async () => ({ ok: true, entscheidung: { decision: "done", reason: "fertig" } }) };
  };
  const ergebnis = await fuehreFreienLaufAus({
    auftrag: "x",
    tab: { url: "https://smejj.com/", sessionId: "s1" },
    schrittUrl: "https://beispiel.test/api/maus/run",
    sende: async () => ({ ok: true, beobachtung: { url: "https://smejj.com/", elements: [] } }),
    zeige: (t) => zeilen.push(t)
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(anfragen, 2);
  assert.match(zeilen.join(" "), /fragt noch einmal/);
  // Der Aussetzer darf keinen Schritt verbrauchen: sonst schrumpft das Budget
  // fuer echte Arbeit, obwohl nichts getan wurde.
  assert.ok(zeilen.filter((z) => /^Maus 1\//.test(z)).length >= 2, "der Schritt muss derselbe bleiben");
  assert.ok(AUSSETZER_GRENZE >= 1);
});

test("auch das Wiederholen hat eine Grenze", async () => {
  const { fuehreFreienLaufAus, AUSSETZER_GRENZE } = await import("../public/browser-pane-maus.js");
  let anfragen = 0;
  globalThis.fetch = async () => {
    anfragen += 1;
    return { ok: false, status: 502, json: async () => ({ ok: false, error: "planer_leere_antwort" }) };
  };
  const ergebnis = await fuehreFreienLaufAus({
    auftrag: "x",
    tab: { url: "https://smejj.com/", sessionId: "s1" },
    schrittUrl: "https://beispiel.test/api/maus/run",
    sende: async () => ({ ok: true, beobachtung: { url: "https://smejj.com/", elements: [] } }),
    zeige: () => {}
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(anfragen, AUSSETZER_GRENZE + 1);
  assert.match(ergebnis.grund, /planer_leere_antwort/);
});

// --- Fehlende Freigabe ist ein Umweg, kein Abbruch --------------------------
test("ohne Freigabe weicht die Maus auf den fernen Browser aus", async () => {
  // Gemessen 2026-08-20: sobald die Bruecke installiert war, endete JEDER
  // Auftrag auf einer nicht freigegebenen Seite — obwohl der ferne Browser sie
  // ohne Weiteres haette oeffnen koennen. Die Bruecke ist fuer Seiten da, auf
  // denen der Nutzer angemeldet ist; fuer alles Oeffentliche genuegt der ferne.
  const quelle = fs.readFileSync("public/maus-absicht.js", "utf8");
  const stelle = quelle.slice(quelle.indexOf("herkunft_nicht_freigegeben"));
  // Genau dieser Fall muss `false` liefern — nur dann laeuft der Panel-Weg an.
  assert.match(stelle.slice(0, 800), /return false;/);
  // Und der Nutzer muss erfahren, wie er den angemeldeten Weg bekommt.
  assert.match(stelle.slice(0, 800), /30 Minuten erlauben/);
  // Alle ANDEREN Bruecken-Fehler bleiben ein Abbruch mit Grund: bei einem
  // stummen Dienst oder http:// waere ein stiller Umweg irrefuehrend.
  assert.match(quelle, /schreibe\(deuteChromeFehler\(auf\?\.error, ziel\)\);\s*\n\s*return true;/);
});

// --- Die Freigabe darf nicht mit dem Fenster sterben ------------------------
test("die Freigabe wird im Hintergrund gemerkt, nicht im Fenster", () => {
  // Gefunden 2026-08-20 beim ersten echten Freigabe-Versuch des Betreibers:
  // chrome.permissions.request() laesst Chrome seinen Dialog zeigen, dabei
  // verliert das Popup den Fokus und WIRD GESCHLOSSEN — mitsamt Skript. Die
  // Zeile danach, die die Freigabe in den Speicher schrieb, lief nie. Chrome
  // hatte die Berechtigung erteilt, die Bruecke wusste nichts davon. Fuer den
  // Betreiber sah es aus, als haette sein Klick nichts genuetzt.
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  const fenster = fs.readFileSync("extensions/smejj-maus-bruecke/freigabe.js", "utf8");

  assert.match(hintergrund, /permissions\.onAdded/, "der Hintergrund muss die Erteilung selbst mitbekommen");
  assert.match(hintergrund, /permissions\.onRemoved/, "und den Entzug ebenso — sonst bleibt ein zurueckgenommenes Recht stehen");
  // Das Fenster darf die Freigabe NICHT mehr selbst schreiben.
  assert.ok(!/liste\[herkunft\]\s*=/.test(fenster), "das Fenster schreibt wieder selbst — genau das stirbt mit ihm");
  // Und eine Ablehnung muss sichtbar werden statt still zu verschwinden.
  assert.match(fenster, /Chrome hat die Berechtigung nicht erteilt/);
});

test("aus einem Berechtigungsmuster wird die richtige Herkunft", () => {
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  // "https://www.alibaba.com/*" -> "https://www.alibaba.com"
  assert.match(hintergrund, /replace\(\/\\\/\\\*\$\/, ""\)/);
  // Nur https zaehlt: im angemeldeten Chrome waere http ein Klartext-Leck.
  assert.match(hintergrund, /startsWith\("https:\/\/"\)/);
});

// --- Die Zustandsauskunft: gebaut UND angeschlossen -------------------------
//
// Der Hintergrund verstand "zustand" und "hallo" schon, bevor die Seite die
// Woerter aussprechen konnte: sendeAnChrome verpackte alles fest als
// { aktion }. Beide Wege waren damit tot — lautlos, wie immer bei dieser
// Falle. Diese Tests halten beide Enden zusammen.
test("die Zustandsfrage kommt als 'zustand' heraus, nicht als Aktion", async () => {
  const { frageZustand } = await import("../public/maus-chrome.js");
  const fenster = fensterAttrappe();
  await frageZustand({ fenster, grenzeMs: 50 });

  const raus = fenster.gesendet.at(-1);
  assert.equal(raus.nachricht.zustand, true, "der Hintergrund erkennt die Frage nur an diesem Wort");
  assert.ok(!("aktion" in raus.nachricht), "als Aktion verpackt landet sie im falschen Weg");
});

test("der Anklopf-Test nimmt den Hallo-Weg", async () => {
  const { brueckeAntwortet } = await import("../public/maus-chrome.js");
  const vorher = globalThis.document;
  globalThis.document = { documentElement: { dataset: { smejjMausBruecke: "0.5.0" } } };
  try {
    const fenster = fensterAttrappe();
    await brueckeAntwortet({ fenster, grenzeMs: 50 });
    assert.equal(fenster.gesendet.at(-1).nachricht.hallo, true);
  } finally {
    if (vorher === undefined) delete globalThis.document; else globalThis.document = vorher;
  }
});

test("der Hintergrund kennt beide Woerter und hat sie VOR dem alten Weg", () => {
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  assert.match(hintergrund, /nachricht\?\.zustand/);
  assert.match(hintergrund, /nachricht\?\.hallo/);
  // Reihenfolge zaehlt: fuehreAus(nachricht?.befehl) ist der Auffangzweig und
  // muss zuletzt stehen, sonst schluckt er die neuen Woerter.
  assert.ok(
    hintergrund.indexOf("nachricht?.zustand") < hintergrund.indexOf("fuehreAus(nachricht?.befehl)"),
    "der Auffangzweig steht vor der Zustandsfrage und verschluckt sie"
  );
});

test("die Zustandsauskunft nennt BEIDE Seiten nebeneinander", () => {
  const hintergrund = fs.readFileSync("extensions/smejj-maus-bruecke/hintergrund.js", "utf8");
  const auskunft = hintergrund.slice(hintergrund.indexOf("export async function zustandZeigen"));
  // Genau darum geht es: gemerkte Freigabe UND tatsaechliches Chrome-Recht.
  // Nur eine der beiden Zahlen zu zeigen war der Fehler vom 2026-08-20.
  assert.match(auskunft, /freigaben:/);
  assert.match(auskunft, /chromeRechte:/);
  // Und sie darf nichts ausfuehren — nur lesen.
  assert.ok(!/fuehreAktionAus|chrome\.scripting/.test(auskunft.slice(0, auskunft.indexOf("\n}"))));
});

test("das Panel zeigt den Zustand NACH dem Rendern — und ohne gesperrte Datei", () => {
  const panel = fs.readFileSync("public/maus-panel.js", "utf8");
  // render() baut das Panel neu auf. Wer vorher schreibt, schreibt ins Leere.
  const nachRender = panel.indexOf("render();", panel.indexOf("export function openMausReplay"));
  assert.ok(nachRender > 0, "openMausReplay rendert nicht mehr?");
  assert.ok(
    panel.indexOf("zeigeBrueckenZustand()", nachRender) > nachRender,
    "der Zustand wird vor render() geschrieben und sofort wieder weggewischt"
  );
  // Die Zeile muss aus dem Modul kommen: index.html steht unter dem Start-Lock.
  assert.match(panel, /document\.createElement\("p"\)/);
  // Und sie darf bei einem Fehler nicht leer bleiben — leer sieht aus wie "alles gut".
  assert.match(panel, /Zustand der Bruecke nicht lesbar/);
});

// Gefunden 2026-09-05: Recht in Chrome erteilt, Bruecke wusste nichts davon
// (alter Hintergrund ohne onAdded lief weiter). Der Start-Abgleich holt das nach.
test("Bruecke uebernimmt beim Start bereits erteilte Chrome-Rechte als Freigabe", async () => {
  const speicher = { freigaben: { "https://alt.example": Date.now() + 60_000 } };
  globalThis.chrome = {
    storage: { local: { get: async () => ({ freigaben: speicher.freigaben }), set: async (o) => { Object.assign(speicher, o); } } },
    permissions: { getAll: async () => ({ origins: ["https://de.wikipedia.org/*", "https://alt.example/*", "http://unsicher.example/*"] }) },
    runtime: { getManifest: () => ({ version: "test" }) }
  };
  try {
    const { uebernimmErteilteRechte } = await import("../extensions/smejj-maus-bruecke/hintergrund.js");
    // Der Hintergrund gleicht schon beim Laden ab; ein ausdruecklicher Aufruf
    // danach darf nichts doppelt eintragen.
    const uebernommen = await uebernimmErteilteRechte();
    assert.ok(uebernommen.length <= 1 && (!uebernommen.length || uebernommen[0] === "https://de.wikipedia.org"));
    assert.ok(speicher.freigaben["https://de.wikipedia.org"] > Date.now(), "als Freigabe mit Ablauf eingetragen");
    assert.ok(!("http://unsicher.example" in speicher.freigaben), "http bleibt draussen");
    assert.deepEqual(await uebernimmErteilteRechte(), [], "zweiter Lauf aendert nichts");
  } finally {
    delete globalThis.chrome;
  }
  const manifest = JSON.parse(fs.readFileSync("extensions/smejj-maus-bruecke/manifest.json", "utf8"));
  assert.notEqual(manifest.version, "0.5.0", "neuer Stand braucht eine neue Versionsnummer");
});
