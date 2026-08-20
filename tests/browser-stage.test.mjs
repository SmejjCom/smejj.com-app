// smejj.com — die eingebetteten Ansichten sind BEDIENBAR (browser-stage.js).
//
// Der Fehler dahinter (Betreiber, 2026-08-19: "ich kann im Browser keine
// Amazon bedienen"): srcdoc-Rahmen erben die CSP des Einbetters
// (script-src 'self', KEIN unsafe-inline). Die Bedienlogik der Ansichten
// steckte als Inline-<script> in den Vorlagen und wurde stumm blockiert —
// Bild da, klicken/tippen/scrollen/Erneut-laden tot. Alle bisherigen Tests
// lasen nur den Quelltext der Vorlagen; keiner liess einen Rahmen laufen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const render = fs.readFileSync("public/browser-pane-render.js", "utf8");
const stage = fs.readFileSync("public/browser-stage.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("KEIN Inline-Script in den srcdoc-Vorlagen — CSP blockiert es stumm", () => {
  // <script src=...> ist erlaubt ('self'), <script> ohne src ist der Fehler.
  assert.doesNotMatch(render, /<script>(?!<)/, "Inline-<script> in einer Vorlage — wird von script-src 'self' stumm blockiert");
  assert.match(render, /<script src="\/assets\/browser-stage\.js\?v=\d+"><\/script>/);
});

test("browser-stage.js traegt alle drei Rollen und ist rahmentauglich", () => {
  assert.match(stage, /getElementById\("nochmal"\)/);           // Fehlerseite
  assert.match(stage, /getElementById\("bpScroll"\)/);          // Worker-Ansicht
  assert.match(stage, /getElementById\("bpStage"\)/);           // Live-Buehne
  assert.match(stage, /smejj\.browser\.sessionAct/);            // Klick/Tipp-Weg
  assert.doesNotMatch(stage, /^import /m, "importfrei — sandboxed Rahmen laden keine Module");
});

test("browser-stage.js liegt im Precache — offline darf die Buehne nicht sterben", () => {
  assert.match(sw, /"\/assets\/browser-stage\.js"/);
});

test("die Buehnen-Logik ist vollstaendig umgezogen, nichts doppelt", () => {
  // Kernstuecke der Live-Buehne existieren GENAU EINMAL — in der Stage-Datei.
  for (const stueck of ["toPct", "flushText", "flushWheel"]) {
    assert.equal((stage.match(new RegExp(stueck, "g")) || []).length > 0, true, stueck + " fehlt in browser-stage.js");
    assert.equal(render.includes(stueck), false, stueck + " steht noch in der Vorlage");
  }
});
