// smejj.com — Zusicherungen fuer die Hilfeseite (/hilfe.html).
//
// Der grosse Risikofaktor einer Hilfeseite ist nicht die Technik, sondern dass
// sie Dinge beschreibt, die es nicht gibt — oder Namen nennt, die in der
// Oberflaeche anders heissen. Deshalb pruefen die Tests unten die INHALTE
// gegen den echten Quelltext: jeder genannte Arbeitsbereich, jedes Modell und
// jeder Schalter muss in public/index.html tatsaechlich vorkommen.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hilfe = fs.readFileSync("public/hilfe.html", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");
const gate = fs.readFileSync("public/auth-gate.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const css = fs.readFileSync("public/static-pages.css", "utf8");
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");
const aktionen = fs.readFileSync("public/chat-actions-menu.js", "utf8");

test("die Hilfeseite ist ohne Anmeldung erreichbar", () => {
  // Wer nicht hineinkommt, braucht die Hilfe am dringendsten.
  assert.match(gate, /\/\^\\\/hilfe\\\.html\$\//);
});

test("die Hilfeseite liegt im Precache", () => {
  assert.ok(sw.includes('"/hilfe.html"'), "hilfe.html fehlt im Precache");
  assert.match(css, /html\.p-hilfe/);
});

test("jeder genannte Arbeitsbereich existiert wirklich", () => {
  const bereiche = ["Neu", "Suche", "Coding", "Projekte", "Dateien", "Verlauf", "Einstellungen"];
  for (const name of bereiche) {
    assert.ok(hilfe.includes(`<dt>${name}</dt>`), `Hilfe nennt "${name}" nicht`);
    assert.ok(
      new RegExp(`title="${name}"`).test(index),
      `Hilfe beschreibt "${name}", aber index.html hat keinen solchen Knopf`
    );
  }
});

test("jedes genannte Modell existiert wirklich", () => {
  for (const modell of ["smejj 1.0", "GLM-5.2", "Kimi K2.7", "Cline"]) {
    assert.ok(hilfe.includes(modell), `Hilfe nennt "${modell}" nicht`);
    assert.ok(index.includes(`data-model="${modell}"`), `Modell "${modell}" gibt es in der App nicht`);
  }
});

test("die genannten Schalter heissen in der App genauso", () => {
  for (const schalter of ["Mikrofon", "Audio", "Stimme"]) {
    assert.ok(hilfe.includes(`<strong>${schalter}</strong>`), `Hilfe nennt den Schalter "${schalter}" nicht`);
    assert.ok(index.includes(`aria-label="${schalter}"`), `Schalter "${schalter}" heisst in index.html anders`);
  }
});

test("die genannten Nachrichten-Aktionen heissen in der App genauso", () => {
  for (const aktion of ["Kopieren", "Neu generieren", "Bearbeiten", "Vorlesen", "Ab hier löschen"]) {
    assert.ok(hilfe.includes(`<em>${aktion}</em>`), `Hilfe nennt "${aktion}" nicht`);
    assert.ok(aktionen.includes(`"${aktion}"`), `Aktion "${aktion}" gibt es im Menue nicht`);
  }
});

test("die Hilfe verspricht keine Anmeldeart, die abgeschaltet ist", () => {
  // Apple-Login ist im Quelltext angelegt, aber live aus (fail-closed).
  // Nur der sichtbare Inhalt zaehlt — im Kopf steht "apple-touch-icon".
  const sichtbar = hilfe.slice(hilfe.indexOf("<main>"), hilfe.indexOf("</main>"));
  assert.doesNotMatch(sichtbar, /Apple/i, "Apple-Anmeldung ist nicht aktiv und darf nicht versprochen werden");
  for (const weg of ["Passkey", "Google", "GitHub"]) {
    assert.ok(hilfe.includes(weg), `Anmeldeweg "${weg}" fehlt in der Hilfe`);
  }
});

test("die Hilfe verweist auf Status, Impressum und Datenschutz", () => {
  for (const ziel of ["/status.html", "/impressum.html", "/datenschutz.html"]) {
    assert.ok(hilfe.includes(ziel), `Verweis auf ${ziel} fehlt`);
  }
});

test("die Hilfe steht in der Sitemap, der Status bewusst nicht", () => {
  assert.ok(sitemap.includes("/hilfe.html"), "Hilfe fehlt in der Sitemap");
  assert.ok(!sitemap.includes("/status.html"), "Der Status ist ein Momentwert und gehoert nicht in den Index");
});
