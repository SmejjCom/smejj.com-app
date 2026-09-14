// smejj.com — chat-bridge-weather.js ist seit 2026-09-09 (32848c3a) ein BROWSER-Modul.
//
// Befund R8 (A-bis-Z 14.09.): der Review nannte die Datei "tote Buendel-Quelle,
// live veraltet". Gemessen (curl + md5, 14.09.): live == public/-Quelle.
// Veraltet war nur die Spiegelkopie public/assets/chat-bridge-weather.js im
// Repo — und zwar mit der Fassung VOR der process-Wache (`process.env` ohne
// typeof-Schutz). Der Browser laedt genau diese Kopie
// (/assets/ai/live-daten.js -> ../chat-bridge-weather.js); sie haette das
// Modul beim Laden gesprengt (Probe: ReferenceError process is not defined).
// Der assets-Waechter sah es nicht, weil die Datei als "gehoert zum
// Bruecken-Buendel" ausgenommen war. Die Ausnahme stimmt nur fuer das
// GEBUENDELTE Artefakt chat-bridge.js — das Wettermodul wird verbatim
// ausgeliefert und muss der Quelle folgen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AUSNAHMEN, pruefe } from "../scripts/build/sync-assets.mjs";

const NAME = "chat-bridge-weather.js";
const quelle = fs.readFileSync(`public/${NAME}`, "utf8");
const kopie = fs.readFileSync(`public/assets/${NAME}`, "utf8");
const liveDaten = fs.readFileSync("public/ai/live-daten.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("das Wettermodul ist ein Browser-Modul: importiert und vorgeladen", () => {
  assert.match(liveDaten, /from "\.\.\/chat-bridge-weather\.js"/,
    "ai/live-daten.js muss das Wettermodul importieren");
  assert.ok(sw.includes(`"/assets/${NAME}"`), "sw.js muss die Datei vorladen");
});

test("die Quelle schuetzt process — sonst stirbt das Modul im Browser", () => {
  assert.match(quelle, /typeof process !== "undefined"/);
  assert.doesNotMatch(quelle, /^const WEATHER_TIMEOUT_MS = Number\(process\.env/m,
    "ungeschuetztes process.env sprengt das Modul im Browser");
});

test("die Auslieferungskopie ist NICHT vom assets-Waechter ausgenommen", () => {
  assert.equal(AUSNAHMEN[NAME], undefined,
    "ein Browser-Modul darf nicht als Buendel-Quelle uebersprungen werden");
});

test("Quelle und Auslieferungskopie sind gleich — und der Waechter sieht sie", async () => {
  assert.equal(kopie, quelle, "public/assets/ hinkt der Quelle hinterher");
  const { abweichend, uebersprungen } = await pruefe([NAME]);
  assert.deepEqual(uebersprungen, [], "der Waechter ueberspringt die Datei");
  assert.deepEqual(abweichend, []);
});
