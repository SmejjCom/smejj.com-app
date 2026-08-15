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
  // Die Hilfe folgt der Oberflaeche, nicht umgekehrt. Seit dem Klartext-
  // Tausch (Design V11, Freigabe 2026-08-15) heisst "Coding" -> "Programmieren"
  // und "Arbeitsbereich" -> "Meine Sachen": beides Fachjargon, den ein
  // Anfaenger nicht deuten kann. Genau dieser Test hat die Luecke gefunden.
  // Seit der Vier-Gruppen-Spur (Mockup V11, Bildschirm 19, 2026-08-15):
  // Reden / Arbeiten / Meine Sachen / Betrieb, 13 Eintraege plus das
  // Einstellungen-Zahnrad unten.
  const bereiche = ["Chat", "Sprechen", "Im Netz suchen", "Bilder erstellen", "Programmieren", "Browser bedienen", "Aufträge", "Verlauf", "Meine Dateien", "Dateien", "Systemzustand", "KI-Modelle", "Speicher", "Einstellungen"];
  for (const name of bereiche) {
    assert.ok(hilfe.includes(`<dt>${name}</dt>`), `Hilfe nennt "${name}" nicht`);
    assert.ok(
      new RegExp(`title="${name}"`).test(index),
      `Hilfe beschreibt "${name}", aber index.html hat keinen solchen Knopf`
    );
  }
});

// Die Liste stand hier frueher fest verdrahtet. Am 2026-08-08 fiel damit auf,
// dass die Hilfe "smejj 1.0" nannte, das die App laengst nicht mehr anbietet —
// aber die umgekehrte Luecke blieb blind: ein NEUES Modell (Kimi K3) fehlte in
// der Hilfe, ohne dass irgendetwas rot wurde. Deshalb wird die Liste jetzt aus
// index.html GELESEN statt behauptet, und beide Richtungen werden geprueft.
// Zwei Namen pro Modell: die technische Kennung (data-model) und die
// Beschriftung, die der Nutzer im Menue liest ("Kraftvoll (GLM-5.2)").
// Die Hilfe spricht mit dem Nutzer, also darf sie die Beschriftung nennen —
// vorher zaehlte nur die Kennung, und jede lesbare Bezeichnung war rot.
const ANGEBOTENE_MODELLE = [...index.matchAll(/data-model="([^"]+)"[^>]*>([^<]+)</g)]
  .flatMap((treffer) => [treffer[1], treffer[2].trim()])
  .filter(Boolean);

test("die Hilfe nennt genau die Modelle, die die App anbietet", () => {
  assert.ok(ANGEBOTENE_MODELLE.length >= 2, "index.html bietet gar keine Modellwahl — Testgrundlage fehlt");
  // Richtung 1: was die App anbietet, muss erklaert sein.
  for (const [, kennung, beschriftung] of index.matchAll(/data-model="([^"]+)"[^>]*>([^<]+)</g)) {
    assert.ok(
      hilfe.includes(kennung) || hilfe.includes(beschriftung.trim()),
      `Die App bietet "${beschriftung.trim()}" an, die Hilfe erklaert es nicht`
    );
  }
  // Richtung 2: was die Hilfe als waehlbar auszeichnet, muss es auch geben.
  // Nur die <strong>-Auszeichnungen im Modell-Absatz zaehlen — Fliesstext ueber
  // Anbieter oder Preise soll hier nicht mitgeprueft werden.
  const absatz = /welches Modell antwortet:([\s\S]*?)<\/p>/.exec(hilfe);
  assert.ok(absatz, "Der Modell-Absatz der Hilfe wurde nicht gefunden");
  for (const treffer of absatz[1].matchAll(/<strong>([^<]+)<\/strong>/g)) {
    assert.ok(
      ANGEBOTENE_MODELLE.includes(treffer[1]),
      `Die Hilfe nennt "${treffer[1]}", die App bietet es nicht an`
    );
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
