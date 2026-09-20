// smejj.com — die Adresse der freiwilligen Frage-Erfassung darf die Herkunft nur EINMAL tragen.
//
// BEFUND 2026-09-20 (A-bis-Z-Test, live in Chrome): Verstoss gegen connect-src fuer
// "https://api.smejj.comhttps//api.smejj.com/api/trai…". config.js macht jede Route absolut,
// frage-erfassung.js setzte API_ORIGIN noch einmal davor — seit dem 06.09. lief die Erfassung ins
// Leere, und der stumme Fehlerpfad hat es verdeckt. Das Modul importiert "/assets/…" und laesst sich
// in Node nicht laden; geprueft wird deshalb die Funktion aus dem Quelltext UND die Verdrahtung.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { API_ORIGIN, CLIENT_ROUTES } from "../public/config.js";

const quelle = fs.readFileSync("public/ai/frage-erfassung.js", "utf8");
const rumpf = quelle.match(/export function erfassungsAdresse\(pfad = ERFASSUNGS_PFAD, herkunft = API_ORIGIN\) \{\n([\s\S]*?)\n\}/)?.[1];
const erfassungsAdresse = new Function("pfad", "herkunft", rumpf);

test("absolute Route bleibt, wie sie ist — relative bekommt die Herkunft genau einmal", () => {
  assert.ok(rumpf, "erfassungsAdresse() fehlt in public/ai/frage-erfassung.js");
  assert.equal(erfassungsAdresse("https://api.smejj.com/api/training/capture", "https://api.smejj.com"), "https://api.smejj.com/api/training/capture");
  assert.equal(erfassungsAdresse("/api/training/capture", "https://api.smejj.com"), "https://api.smejj.com/api/training/capture");
});

test("mit der ECHTEN Konfiguration entsteht eine gueltige Adresse auf dem eigenen Server", () => {
  const adresse = erfassungsAdresse(CLIENT_ROUTES.api.trainingCapture, API_ORIGIN);
  const url = new URL(adresse);
  assert.equal(url.pathname, "/api/training/capture");
  assert.equal((adresse.match(/https?:\/\//g) || []).length, 1, `doppelte Herkunft: ${adresse}`);
});

test("der Sendepfad benutzt die Funktion — nie wieder API_ORIGIN vor einer fertigen Route", () => {
  assert.match(quelle, /await fetchImpl\(erfassungsAdresse\(\), \{/);
  assert.doesNotMatch(quelle, /\$\{API_ORIGIN\}\$\{ERFASSUNGS_PFAD\}/);
});
