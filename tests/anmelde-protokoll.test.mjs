// Pruefer fuer das Anmelde-Protokoll.
//
// ANLASS (2026-08-22): Der Google-Login brach fuer den Betreiber, und in den
// Zeabur-Logs stand NICHTS — kein Fehler, keine Zeile. Die Ursache liess sich
// nur finden, indem der Weg von aussen Schritt fuer Schritt nachgemessen
// wurde. Jetzt schreibt jeder Schritt eine Zeile.
//
// ZWEI Dinge muessen dieser Pruefer sicherstellen, und das zweite ist das
// wichtigere:
//   1. Es wird ueberhaupt protokolliert, und zwar an JEDER Stelle des Wegs.
//   2. Es landet NICHTS Personenbezogenes im Log. Ein Log wird kopiert,
//      weitergereicht und aufbewahrt — Adressen und Tokens haben dort nichts
//      verloren.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createAnmeldeProtokoll, baueEintrag, adressFingerabdruck, ticketKuerzel
} from "../control-server/src/auth/anmeldeProtokoll.js";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

test("eine Zeile traegt Zeitpunkt, Schritt, Anbieter und Ergebnis", () => {
  const zeilen = [];
  const p = createAnmeldeProtokoll({ schreibe: (z) => zeilen.push(z), jetzt: () => 1_700_000_000_000 });
  p.notiere({ schritt: "rueckkehr", anbieter: "google", ok: true });
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /^\[anmeldung\] \{/, "Praefix fehlt — grep findet die Zeile nicht");
  const eintrag = JSON.parse(zeilen[0].replace("[anmeldung] ", ""));
  assert.equal(eintrag.schritt, "rueckkehr");
  assert.equal(eintrag.anbieter, "google");
  assert.equal(eintrag.ok, true);
  assert.equal(eintrag.zeitpunkt, "2023-11-14T22:13:20.000Z");
});

test("DER KERNPUNKT: die E-Mail steht NIE im Klartext im Log", () => {
  const zeilen = [];
  const p = createAnmeldeProtokoll({ schreibe: (z) => zeilen.push(z) });
  p.notiere({ schritt: "rueckkehr", anbieter: "google", ok: false, grund: "konto_nicht_freigegeben", email: "wof@smejj.com" });
  const zeile = zeilen[0];
  assert.ok(!zeile.includes("wof@smejj.com"), "die Adresse steht im Klartext im Log");
  assert.ok(!zeile.includes("wof"), "Teile der Adresse stehen im Log");
  assert.ok(!zeile.includes("@"), "ein @ im Log deutet auf eine Adresse hin");
  // Aber wiedererkennbar muss sie sein — sonst kann man zwei Versuche
  // desselben Kontos nicht zusammenbringen.
  const eintrag = JSON.parse(zeile.replace("[anmeldung] ", ""));
  assert.equal(eintrag.konto, adressFingerabdruck("wof@smejj.com"));
  assert.equal(eintrag.konto.length, 16);
});

test("derselbe Mensch ergibt denselben Fingerabdruck — auch mit Grossbuchstaben", () => {
  assert.equal(adressFingerabdruck("Wof@Example.COM "), adressFingerabdruck("wof@example.com"));
  assert.notEqual(adressFingerabdruck("a@b.de"), adressFingerabdruck("c@d.de"));
  assert.equal(adressFingerabdruck(""), "", "ohne Adresse kein Feld");
});

test("die Ticket-ID wird gekuerzt — genug zum Zuordnen, zu wenig zum Benutzen", () => {
  const voll = "RUYKmuyhd8aQKzqfFW87yUMU588xM_-YtKHwyt85iNk";
  assert.equal(ticketKuerzel(voll).length, 8);
  const zeilen = [];
  createAnmeldeProtokoll({ schreibe: (z) => zeilen.push(z) })
    .notiere({ schritt: "ticket-hinterlegt", anbieter: "google", ok: true, ticket: voll });
  assert.ok(!zeilen[0].includes(voll), "die vollstaendige Ticket-ID steht im Log");
});

test("der Grund steht drin — er ist das Wichtigste an einem Fehlschlag", () => {
  const eintrag = baueEintrag({ schritt: "ticket-hinterlegt", anbieter: "google", ok: false, grund: "session_handoff_not_found" });
  assert.equal(eintrag.grund, "session_handoff_not_found");
  assert.equal(eintrag.ok, false);
});

test("ein Protokoll darf die Anmeldung NIE kippen", () => {
  // Wirft der Schreiber, muss notiere() das schlucken: lieber keine Zeile
  // als ein gescheiterter Login.
  const p = createAnmeldeProtokoll({ schreibe: () => { throw new Error("Konsole weg"); } });
  assert.doesNotThrow(() => p.notiere({ schritt: "rueckkehr", anbieter: "google", ok: true }));
  assert.equal(p.notiere({ schritt: "x", anbieter: "y", ok: true }), null);
});

test("abschaltbar per SMEJJ_ANMELDE_LOG=aus", () => {
  const zeilen = [];
  const p = createAnmeldeProtokoll({ schreibe: (z) => zeilen.push(z), env: { SMEJJ_ANMELDE_LOG: "aus" } });
  p.notiere({ schritt: "rueckkehr", anbieter: "google", ok: true });
  assert.equal(zeilen.length, 0);
});

test("DIE KETTE: das Protokoll wird bis zu den Handlern durchgereicht", () => {
  // Ein gebautes Protokoll, das niemand bekommt, schreibt nichts — genau die
  // Familie "gebaut, aber nicht angeschlossen".
  const server = readFileSync(join(WURZEL, "src", "server.js"), "utf8");
  assert.match(server, /createAnmeldeProtokoll\(/, "server.js baut kein Protokoll");
  assert.match(server, /anmeldeProtokoll,/, "die Google-Handler bekommen es nicht");
  const extra = readFileSync(join(WURZEL, "src", "auth", "extraAuthRoutes.js"), "utf8");
  assert.match(extra, /ROUTES, anmeldeProtokoll, env/,
    "der Zwischen-Router reicht es nicht an die GitHub-Handler weiter");
});

test("JEDE Abbruchstelle des Google-Wegs schreibt eine Zeile", () => {
  const quelle = readFileSync(join(WURZEL, "src", "auth", "googleAuthRoutes.js"), "utf8");
  for (const grund of [
    "google_nicht_konfiguriert", "session_secret_fehlt",
    "email_nicht_bestaetigt", "konto_nicht_freigegeben",
    "ticket_nicht_einloesbar", "ohne_ticket_control_domain",
    // Die Abbruchstelle der Parallelsitzung: abgelaufener oder gefaelschter
    // state. Ohne sie fehlte genau der Fall, den der Betreiber gesehen hat.
    "state_abgelaufen", "state_ungueltig"
  ]) {
    assert.ok(quelle.includes(grund), `Abbruchgrund "${grund}" wird nicht protokolliert`);
  }
});

test("beim GEFAELSCHTEN state wird nichts aus dem Ticket mitgeloggt", () => {
  // Ist die Signatur falsch, stammt der Inhalt nicht von uns — er gehoert
  // nicht ins Log. Nur beim ABGELAUFENEN Ticket kommt das Alter mit.
  const quelle = readFileSync(join(WURZEL, "src", "auth", "googleAuthRoutes.js"), "utf8");
  const stelle = quelle.slice(quelle.indexOf("const alterSek ="), quelle.indexOf("if (body.redirect)", quelle.indexOf("const alterSek =")));
  assert.match(stelle, /grund === "abgelaufen" && Number\.isFinite/, "das Alter wird auch bei ungueltigem state berechnet");
  assert.ok(!/state_ungueltig[^"]*\$\{/.test(stelle), "beim ungueltigen state wird etwas eingesetzt");
});

