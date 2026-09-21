// smejj ai radar — die Adminseite: zeigt sie wirklich, was der Auftrag verlangt?
// Geprueft wird das erzeugte HTML, nicht die Absicht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KONSOLE = path.join(WURZEL, "control-server/admin-ui");

function ladeAnsicht() {
  const fenster = {
    adminApi: {
      escapeHtml: (t) => String(t === null || t === undefined ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
      zeit: (z) => String(z).slice(0, 16)
    },
    adminViews: {
      panelBlock: (t, u, i, w) => `<section data-panel="${t}">${u}${i}${w || ""}</section>`,
      kachelBlock: (t, v, u) => `<div class="kpi">${t}: ${v} (${u || ""})</div>`,
      tabelleBlock: (spalten, zeilen) => `<table><thead>${spalten.join("|")}</thead><tbody>${zeilen.join("")}</tbody></table>`,
      pilleBlock: (t, ton) => `<span class="pill ${ton || ""}">${t}</span>`
    }
  };
  const quelle = readFileSync(path.join(KONSOLE, "views-ai-radar.js"), "utf8");
  new Function("window", `${quelle}\n;return window;`)(fenster);
  return fenster.adminViewsAiRadar;
}

const STAND = {
  eingeschaltet: true, zustand: "wartet", grund: null,
  letzterErfolgAm: "2026-09-21T12:00:00.000Z", naechsteFaelligkeitAm: "2026-09-21T18:00:00.000Z",
  wissenAktiv: 3, wissenGesamt: 4, laeufeLesbar: true, wissenLesbar: true,
  grenzen: { anfragenJeTag: 120, anfragenJeMonat: 2000, anfragenJeLauf: 6, kostenJeAnfrageUsd: 0, maxUsdJeMonat: 0 },
  verbrauch: { anfragenHeute: 2, anfragenMonat: 9 },
  themen: [{ id: "presse-ki", titel: "Presse und offizielle Ankuendigungen", bereich: "presse", intervallStunden: 12, prioritaet: 1 }]
};
const ERKENNTNIS = {
  id: "wissen_abc", bereich: "konkurrenz", themaId: "konkurrenz-preise",
  aussage: "Der Pro Tarif kostet jetzt 12 Euro pro Monat", pruefstatus: "geprueft", fassung: 2,
  quellen: [{ url: "https://openai.com/preise", host: "openai.com", guete: "primaerquelle", veroeffentlicht: "2026-09-20" }],
  aktualisiertAm: "2026-09-21T12:00:00.000Z", vorher: "Der Pro Tarif kostet 9 Euro pro Monat"
};
const BERICHT = {
  tag: "2026-09-21", ueberschrift: "Heute 0 neue und 1 aktualisierte Erkenntnisse aus 1 Lauf(en).",
  laeufe: 1, anfragen: 2, quellenGeprueft: 5,
  themen: [{ id: "konkurrenz-preise", titel: "Preise", grund: "faellig (alle 24 h)", anfragen: 1, funde: 6, geprueft: 5, gespeichert: 1, verworfen: 1 }],
  neu: [], aktualisiert: [ERKENNTNIS], widersprueche: [], zurueckgenommen: [], konkurrenz: [ERKENNTNIS],
  verworfen: [{ url: "https://werbung.example/x", titel: "Angebot", grund: "werbung" }],
  vorschlaege: [{ titel: "Preise pruefen", nutzen: "Preisnachteil erkennen", kostenRisiko: "Pruefzeit", test: "Vergleichsfrage im Chat", begruendung: [{ aussage: "Tarif 12 Euro", quellen: ["https://openai.com/preise"] }] }],
  offeneFragen: ["Gilt der Preis auch in Europa?"], fehler: [{ begonnenAm: "2026-09-21T06:00:00.000Z", grund: "tagesbudget_erschoepft" }]
};

test("Uebersicht zeigt Schalter, Jetzt-Knopf, Zustand, Laeufe und Budget", () => {
  const html = ladeAnsicht().seite({ stand: STAND, bericht: BERICHT, tageMitLaeufen: ["2026-09-21", "2026-09-20"] });
  for (const pflicht of [
    'data-radar="aus"', 'data-radar="jetzt"', "Zustand: wartet",
    "Letzter Erfolg", "Naechster Lauf", "Wissen aktiv: 3 von 4",
    "Suchanfragen heute", "Suchanfragen diesen Monat", "Ablage lesbar",
    'id="radarTag"', 'id="radarSuche"', 'id="radarThemaId"'
  ]) {
    assert.ok(html.includes(pflicht), `fehlt in der Ansicht: ${pflicht}`);
  }
  assert.ok(html.includes("kostenloser Weg"), "die Kostenzeile muss ehrlich sagen, dass nichts kostet");
});

test("Tagesbericht: jede Erkenntnis ist aufklappbar und zeigt Quelle, Datum und Pruefstatus", () => {
  const html = ladeAnsicht().bericht(BERICHT, ["2026-09-21"]);
  assert.ok(html.includes("Was hat smejj ai radar heute dazugelernt?"));
  assert.ok(html.includes("<details"), "Erkenntnisse muessen anklickbar sein");
  assert.ok(html.includes("https://openai.com/preise"), "die Quelle gehoert in die Detailansicht");
  assert.ok(html.includes("veroeffentlicht: 2026-09-20"));
  assert.ok(html.includes("geprueft"), "der Pruefstatus steht dran");
  assert.ok(html.includes("vorher: Der Pro Tarif kostet 9 Euro pro Monat"), "die Vorfassung ist sichtbar");
  assert.ok(html.includes("Verworfen (mit Grund)") && html.includes("werbung"));
  assert.ok(html.includes("Fehlgeschlagene Laeufe") && html.includes("tagesbudget_erschoepft"));
  assert.ok(html.includes("Verbesserungsvorschlaege") && html.includes("Preise pruefen"));
  assert.ok(html.includes("Offene Fragen"));
  assert.ok(html.includes('data-radar="zurueck"'), "Ruecknahme ist von der Erkenntnis aus moeglich");
});

test("leerer Tag: keine erfundenen Lernerfolge", () => {
  const leer = { tag: "2026-09-22", ueberschrift: "Heute lief keine Recherche.", laeufe: 0, anfragen: 0, quellenGeprueft: 0, themen: [], neu: [], aktualisiert: [], widersprueche: [], zurueckgenommen: [], konkurrenz: [], verworfen: [], vorschlaege: [], offeneFragen: [], fehler: [] };
  const html = ladeAnsicht().bericht(leer, ["2026-09-22"]);
  assert.ok(html.includes("Heute lief keine Recherche."));
  assert.ok(html.includes("heute kein Thema recherchiert"));
  assert.equal(html.includes("<details"), false, "ohne Erkenntnisse gibt es nichts zum Aufklappen");
});

test("Fremdtext wird escaped — eine Quelle kann kein HTML einschleusen", () => {
  const boese = { ...ERKENNTNIS, aussage: '<img src=x onerror="alert(1)">', quellen: [{ url: 'https://x/"><script>', host: "x", guete: "forum", veroeffentlicht: null }] };
  const html = ladeAnsicht().erkenntnis(boese, "neu");
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("veroeffentlicht: unbekannt"), "fehlendes Datum steht ausdruecklich da");
});

test("die Seite ist in der Konsole angemeldet und traegt den exakten Namen", () => {
  const bedienung = readFileSync(path.join(KONSOLE, "console-ai-radar.js"), "utf8");
  assert.ok(/"ai-radar":\s*\{[^}]*name:\s*"smejj ai radar"/.test(bedienung), "Name muss exakt 'smejj ai radar' sein");
  const konsole = readFileSync(path.join(KONSOLE, "console.js"), "utf8");
  assert.ok(konsole.includes("adminStageAiRadar"), "die Seite muss eingesammelt werden");
  assert.ok(konsole.includes('"ai-radar": "6.10"'), "die Seite braucht eine Nummer in der Schiene");
  const index = readFileSync(path.join(KONSOLE, "index.html"), "utf8");
  assert.ok(index.includes("views-ai-radar.js") && index.includes("console-ai-radar.js"), "beide Dateien muessen geladen werden");
});
