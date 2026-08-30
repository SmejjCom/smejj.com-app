// smejj.com — Waechter: benutzte Routen-Schluessel muessen es auch GEBEN.
//
// Anlass, live gemessen 2026-08-14: chat-medien.js leitete die Adresse der
// Medien-Ablage aus `CLIENT_ROUTES.api.chats` ab. Diesen Schluessel gibt es
// nicht — die api-Liste geht von `agent` bis `terminalRun`, ein `chats` ist
// nicht darunter. Der Ausdruck ergab `undefined`, die Adresse wurde "", und
// die Auslagerung stieg bei JEDEM Aufruf sofort wieder aus.
//
// Das Tueckische daran: Der fail-safe Rueckweg ("ohne Adresse passiert
// nichts") sieht exakt aus wie "es war nichts zu tun". Kein Fehler, keine
// Warnung, kein Eintrag im Protokoll — die Funktion war vom Tag des
// Ausrollens an tot, und alle Tests blieben gruen, weil jeder von ihnen die
// Adresse selbst hineinreichte.
//
// Merkregel: Ein Tippfehler in einem optional verketteten Zugriff
// (`a?.b?.c`) wirft nie. Er wird zu undefined und faellt in den ruhigen Zweig.
// Genau davor schuetzt dieser Waechter — fuer ALLE Dateien, nicht nur diese.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const KONFIG = readFileSync("public/config.js", "utf8");

// Die api-Liste entsteht in config.js aus Object.fromEntries ueber ein
// Pfad-Verzeichnis. Massgeblich sind also die dort definierten Namen.
function bekannteSchluessel() {
  const namen = new Set();
  for (const treffer of KONFIG.matchAll(/^\s{2,}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*["'`/]/gm)) {
    namen.add(treffer[1]);
  }
  return namen;
}

function dateienMitCode(ordner, gesammelt = []) {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      if (!/node_modules|\.git/.test(eintrag.name)) dateienMitCode(pfad, gesammelt);
    } else if (eintrag.name.endsWith(".js")) {
      gesammelt.push(pfad);
    }
  }
  return gesammelt;
}

test("jeder benutzte CLIENT_ROUTES.api-Schluessel ist in config.js definiert", () => {
  const bekannt = bekannteSchluessel();
  assert.ok(bekannt.size > 10, `config.js sollte viele Routen kennen, gefunden: ${bekannt.size}`);

  const fehlend = [];
  for (const datei of dateienMitCode("public")) {
    const quelle = readFileSync(datei, "utf8");
    for (const treffer of quelle.matchAll(/CLIENT_ROUTES\s*\??\.\s*api\s*\??\.\s*([a-zA-Z][a-zA-Z0-9]*)/g)) {
      if (!bekannt.has(treffer[1])) fehlend.push(`${datei}: CLIENT_ROUTES.api.${treffer[1]}`);
    }
  }
  assert.deepEqual(fehlend, [],
    "diese Schluessel werden benutzt, gibt es aber nicht — der Zugriff ergibt still undefined");
});

test("chat-medien.js baut seine Adresse aus derselben Quelle wie chat-sync.js", () => {
  // Zwei Module, die dasselbe Konto ansprechen, duerfen nicht zwei
  // verschiedene Vorstellungen von der Server-Adresse haben.
  const medien = readFileSync("public/chat-medien.js", "utf8");
  const sync = readFileSync("public/chat-sync.js", "utf8");
  for (const [name, quelle] of [["chat-medien.js", medien], ["chat-sync.js", sync]]) {
    assert.match(quelle, /import \{[^}]*\bAPI_ORIGIN\b[^}]*\} from ["'][^"']*config\.js["']/,
      `${name} muss API_ORIGIN benutzen`);
  }
  // Nur der ZUGRIFF im Code ist verboten, nicht das Wort: der Kommentar oben
  // in chat-medien.js erklaert gerade, warum CLIENT_ROUTES hier falsch war.
  // Ohne dieses Abstreifen wuerde die Erklaerung ihren eigenen Test brechen.
  const ohneKommentar = medien.replace(/^\s*\/\/.*$/gm, "");
  const zugriffe = [...ohneKommentar.matchAll(/CLIENT_ROUTES\s*\??\.\s*api/g)];
  assert.equal(zugriffe.length, 0,
    "chat-medien.js darf die Adresse NICHT mehr aus CLIENT_ROUTES ableiten");
});
