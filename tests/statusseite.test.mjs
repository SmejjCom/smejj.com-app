// smejj.com — Zusicherungen fuer die Statusseite (/status.html).
//
// Der Zweck der Seite bestimmt ihre Tests: Sie muss GERADE DANN funktionieren,
// wenn etwas kaputt ist. Daraus folgen vier harte Bedingungen, die hier
// festgehalten werden:
//   1. Sie darf nicht hinter dem Anmelde-Gate liegen (wer wissen will, ob die
//      Anmeldung laeuft, kann sich per Definition nicht anmelden).
//   2. Sie muss im Precache liegen (auch bei totem Netz noch anzeigbar).
//   3. Sie darf keinen Server brauchen, der Zustaende sammelt (Static-First).
//   4. Ihre CSP muss genau die drei geprueften Hosts erlauben — sonst blockiert
//      der eigene Node-Server die Abfragen und die Seite meldet falschen Alarm.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DIENSTE, gesamtlage, pruefeDienst } from "../public/status.js";

const html = fs.readFileSync("public/status.html", "utf8");
const skript = fs.readFileSync("public/status.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const gate = fs.readFileSync("public/auth-gate.js", "utf8");
const css = fs.readFileSync("public/static-pages.css", "utf8");

test("die Statusseite liegt ausserhalb des Anmelde-Gates — aber nur sie", () => {
  const routen = fs.readFileSync("public/view-routes.js", "utf8");
  assert.match(gate, /\/\^\\\/status\\\.html\$\//, "PUBLIC_PATHS muss genau /status.html freigeben");
  // Die App hat unter "/status" eine eigene, anmeldepflichtige Ansicht. Ein
  // Praefix-Muster wuerde sie mit oeffnen — deshalb das Dollarzeichen oben.
  assert.match(routen, /tools: "\/status"/, "Annahme geprueft: /status ist eine App-Ansicht");
  assert.doesNotMatch(gate, /\/\^\\\/status\//, "Praefix-Muster wuerde die App-Ansicht /status oeffnen");
});

test("Seite und Skript liegen im Precache", () => {
  assert.ok(sw.includes('"/status.html"'), "status.html fehlt im Precache");
  assert.ok(sw.includes('"/assets/status.js"'), "status.js fehlt im Precache");
});

test("kein Status-Server: die Seite fragt selbst ab", () => {
  // Waere hier ein eigener Sammel-Endpunkt eingetragen, haette die Statusseite
  // genau den Single Point of Failure, den sie melden soll.
  assert.doesNotMatch(skript, /\/api\/status\b/);
  for (const dienst of DIENSTE.filter((d) => d.url)) {
    assert.match(dienst.url, /^https:\/\//, `${dienst.id}: nur https`);
    assert.match(dienst.url, /\/(api\/)?health$/, `${dienst.id}: nur Gesundheits-Endpunkte`);
  }
});

test("die CSP erlaubt genau die geprueften Hosts", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, "Meta-CSP fehlt");
  for (const dienst of DIENSTE.filter((d) => d.url)) {
    const host = new URL(dienst.url).origin;
    assert.ok(csp.includes(host), `connect-src fehlt ${host} — der eigene Server wuerde blockieren`);
  }
  assert.match(csp, /script-src 'self'/);
});

test("die Zustaende stehen als Wort da, nicht nur als Farbe", () => {
  // WCAG 1.4.1: Farbe darf nie der einzige Traeger einer Aussage sein.
  for (const wort of ["läuft", "gestört", "nicht erreichbar"]) {
    assert.ok(skript.includes(wort), `Zustandswort "${wort}" fehlt`);
  }
  assert.match(css, /html\.p-status/);
});

test("pruefeDienst: 2xx ist ok, alles andere nicht", async () => {
  const ok = await pruefeDienst({ url: "https://x.invalid/health" }, async () => ({ ok: true, status: 200 }));
  assert.equal(ok.zustand, "ok");
  const fehler = await pruefeDienst({ url: "https://x.invalid/health" }, async () => ({ ok: false, status: 503 }));
  assert.equal(fehler.zustand, "gestoert");
  assert.match(fehler.hinweis, /503/);
  const tot = await pruefeDienst({ url: "https://x.invalid/health" }, async () => { throw new Error("boom"); });
  assert.equal(tot.zustand, "unerreichbar");
});

test("pruefeDienst: die eigene Seite braucht keine Abfrage", async () => {
  const ergebnis = await pruefeDienst({ id: "seite" }, () => { throw new Error("darf nicht aufgerufen werden"); });
  assert.equal(ergebnis.zustand, "ok");
});

test("gesamtlage unterscheidet Haupt- von Zusatzfunktion", () => {
  const ok = (id, kritisch) => ({ dienst: { id, kritisch }, ergebnis: { zustand: "ok" } });
  const tot = (id, kritisch) => ({ dienst: { id, kritisch }, ergebnis: { zustand: "unerreichbar" } });

  assert.equal(gesamtlage([ok("a", true), ok("b", false)]).stufe, "ok");
  // Zusatzfunktion aus -> ausdruecklich KEIN Alarm fuer die Hauptfunktionen.
  assert.equal(gesamtlage([ok("a", true), tot("b", false)]).stufe, "teilweise");
  assert.equal(gesamtlage([tot("a", true), ok("b", true)]).stufe, "aus");
  assert.match(gesamtlage([tot("a", true), ok("b", true)]).text, /Ein Hauptdienst/);
  assert.match(gesamtlage([tot("a", true), tot("b", true), ok("c", true)]).text, /2 Hauptdienste/);
  assert.equal(gesamtlage([tot("a", true), tot("b", true)]).stufe, "aus");
});

test("die Seite funktioniert ohne JavaScript wenigstens als Hinweis", () => {
  assert.match(html, /Ohne aktiviertes JavaScript/);
});
