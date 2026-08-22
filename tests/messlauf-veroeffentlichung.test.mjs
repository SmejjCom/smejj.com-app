// Der taegliche Messlauf veroeffentlicht die Qualitaetsnote. Diese Tests halten
// fest, dass ein gescheiterter Push auch als Fehler ankommt.
//
// DER BEFUND (2026-08-22): Der Push stand in einer Pipe — `git push ... | tail`
// liefert den Exit-Code von `tail`, nie den von git. Danach meldete das Skript
// bedingungslos "FERTIG — live in wenigen Minuten". Seit dem 14.08. scheiterte
// jeder Push (cron kann den macOS-Schluesselbund nicht lesen), die Messungen
// liefen weiter, und die oeffentliche Seite zeigte unveraendert 97,06 %,
// waehrend zuletzt 65,69 % mit 7 kritischen Fehlern gemessen wurden.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skript = readFileSync(new URL("../scripts/verlauf/messlauf-taeglich.sh", import.meta.url), "utf8");

test("kein git push verschwindet in einer Pipe", () => {
  // Die Fehlerklasse, nicht nur der eine Fall: jede Pipe hinter einem Push
  // verschluckt seinen Exit-Code.
  const zeilen = skript.split("\n").filter((z) => /git push/.test(z) && !z.trim().startsWith("#"));
  assert.ok(zeilen.length > 0, "kein Push gefunden — Test zeigt ins Leere");
  for (const z of zeilen) {
    assert.ok(!/\|\s*(tail|head|cat)/.test(z),
      `Push mit Pipe: der Exit-Code geht verloren -> ${z.trim()}`);
  }
});

test("ein gescheiterter Frontend-Push beendet den Lauf mit Fehler", () => {
  // Sonst meldet das Protokoll Erfolg fuer etwas, das nie live ging.
  assert.match(skript, /if ! FRONTEND_PUSH=/, "der Frontend-Push wird nicht geprueft");
  const nachPush = skript.slice(skript.indexOf("FRONTEND_PUSH="));
  assert.match(nachPush.slice(0, 800), /exit 1/, "nach einem gescheiterten Push fehlt der Abbruch");
});

test("die Erfolgsmeldung steht NACH der Pruefung, nicht davor", () => {
  const iPush = skript.indexOf("FRONTEND_PUSH=");
  const iFertig = skript.indexOf("FERTIG:");
  assert.ok(iPush > 0 && iFertig > iPush,
    "\"FERTIG\" darf erst kommen, wenn der Push nachweislich durch ist");
});

test("der Frontend-Klon wird vor dem Schreiben aufgefrischt", () => {
  // Zweiter Grund fuer denselben stillen Ausfall, am 2026-08-22 beim Nachmessen
  // aufgetreten: mehrere Sitzungen pushen in dasselbe Repo, und der Mess-Klon
  // stand auf einem alten Stand —
  //   ! [remote rejected] ... cannot lock ref 'refs/heads/main'
  // Ein Lauf, der ehrlich abbricht, aber aus selbstverschuldetem Grund, ist
  // kaum besser als einer, der schweigt.
  const iFetch = skript.indexOf("git fetch -q origin main");
  const iKopie = skript.indexOf('cp "$DATEI" "$FRONTEND/verlauf-messwerte.json"');
  assert.ok(iFetch > 0, "der Frontend-Klon wird nicht aufgefrischt");
  assert.ok(iKopie > iFetch, "aufgefrischt werden muss VOR dem Schreiben der Datei");
});

test("der Abbruch nennt die Ursache, nicht nur das Scheitern", () => {
  // Ein Abbruch ohne Grund erzeugt nur Ratlosigkeit im Protokoll.
  const nachPush = skript.slice(skript.indexOf("FRONTEND_PUSH="), skript.indexOf("FERTIG:"));
  assert.match(nachPush, /Deploy-Key|Schluesselbund/,
    "der Abbruch sollte sagen, woran es liegt und was hilft");
});
