// smejj.com — TUEV des Startgewichts-Waechters (Betreiber-Auftrag 2026-09-04:
// "erst Waechter, dann abspecken").
//
// Ein Gewichts-Waechter, der nur die gesunde Probe sieht, beweist nichts. Und
// er hat hier schon EINMAL falsch gemessen: der erste Entwurf fand 53 statt 81
// Dateien, weil `/assets/storage/index.js` ins Leere lief — `/assets/` ist eine
// Auslieferungs-Adresse fuer `public/`, kein Ordner im Repo. Er haette die
// halbe Seite gemeldet und dabei "OK" gesagt. Genau das halten diese Proben
// fest.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { eigengewicht, nachDatei, statischeImporte } from "../scripts/check-startgewicht.mjs";

const MESSLATTE = JSON.parse(readFileSync(new URL("../docs/frontend/startgewicht-messlatte.json", import.meta.url), "utf8"));

test("die Startseite bleibt unter der Messlatte", () => {
  const mess = eigengewicht();
  assert.ok(mess.bytes <= MESSLATTE.grenzeBytes,
    `Startseite ist auf ${mess.kb} KB gewachsen, Messlatte ist ${MESSLATTE.grenzeKb} KB`);
});

test("und unter der Vorgabe von 300 KB", () => {
  const mess = eigengewicht();
  assert.ok(mess.kb <= MESSLATTE.zielKb, `${mess.kb} KB gzip, Vorgabe ${MESSLATTE.zielKb} KB`);
});

test("/assets/ wird als Auslieferungs-Adresse aufgeloest, nicht als Ordner", () => {
  // Der Fehler des ersten Entwurfs: diese beiden liegen NUR unter public/,
  // werden aber unter /assets/ ausgeliefert. Wer das nicht abbildet, misst
  // die halbe Seite und meldet trotzdem gruen.
  assert.ok(nachDatei("/assets/storage/index.js"), "/assets/storage/index.js muss auf public/storage/index.js zeigen");
  assert.ok(nachDatei("/assets/ai/index.js"), "/assets/ai/index.js muss auf public/ai/index.js zeigen");
  assert.match(nachDatei("/assets/storage/index.js"), /public\/storage\/index\.js$/);
  assert.equal(nachDatei("https://example.com/fremd.js"), null, "fremde Herkunft zaehlt nicht zum Eigengewicht");
});

test("der Importbaum wird wirklich verfolgt", () => {
  const mess = eigengewicht();
  const dateien = mess.posten.map((p) => p.datei);
  // app.js steht in index.html; components.js und storage/index.js NICHT —
  // sie haengen nur ueber Importe daran.
  assert.ok(dateien.some((d) => d.endsWith("app.js")));
  assert.ok(dateien.some((d) => d.endsWith("components.js")), "ein Import zweiter Ebene fehlt");
  assert.ok(dateien.some((d) => d.includes("storage/")), "der storage-Baum fehlt");
  assert.ok(mess.dateien >= 75, `nur ${mess.dateien} Dateien gefunden — der Baum wird nicht vollstaendig verfolgt`);
});

test("dynamische Importe zaehlen NICHT — sie sind das Mittel zum Abspecken", () => {
  // nachladen.js/bedarf-nachladen.js holen per import() nach. Wuerde der
  // Waechter das mitzaehlen, bestrafte er genau die Loesung.
  const quelle = readFileSync(new URL("../public/bedarf-nachladen.js", import.meta.url), "utf8");
  assert.match(quelle, /ladeBeiKlick|import\(/, "Erwartung an bedarf-nachladen.js stimmt nicht mehr");
  const statisch = statischeImporte(new URL("../public/bedarf-nachladen.js", import.meta.url).pathname);
  for (const ziel of statisch) assert.doesNotMatch(ziel, /^\s*\(/);
});

test("die Messung deckt sich mit dem, was die Leitung wirklich traegt", () => {
  // Stichprobe: gzip der Datei gegen gzip in der Messung. GitHub Pages liefert
  // gzip aus (nachgemessen 04.09.: start-styles.css 148 KB roh -> 26 KB).
  const mess = eigengewicht();
  const css = mess.posten.find((p) => p.datei.endsWith("start-styles.css"));
  assert.ok(css, "start-styles.css fehlt in der Messung");
  const roh = readFileSync(new URL("../public/start-styles.css", import.meta.url));
  assert.equal(css.bytes, gzipSync(roh).length);
  assert.ok(roh.length > css.bytes * 3, "die Messung darf nicht die rohe Groesse sein");
});

test("die Messlatte kennt Ziel, Freigabe und Zeitpunkt", () => {
  assert.equal(MESSLATTE.zielKb, 300);
  assert.ok(MESSLATTE.freigabe && MESSLATTE.freigabe.length > 10, "ohne Wortlaut der Freigabe ist die Messlatte nicht nachvollziehbar");
  assert.match(MESSLATTE.gesetztAm, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Array.isArray(MESSLATTE.groessteFuenf) && MESSLATTE.groessteFuenf.length === 5);
});

test("keine Adresse aus index.html laeuft ins Leere", () => {
  // Ein 404 im Markup ist auf der Seite ein toter Ladepfad — der Waechter
  // meldet ihn, statt ihn als 0 Byte durchzuwinken.
  assert.deepEqual(eigengewicht().nichtGefunden, []);
});

test("gemessen wird die AUSGELIEFERTE Fassung, nicht die im Repo", () => {
  // Unter /assets/x liefert GitHub Pages public/assets/x aus. Der Waechter muss
  // genau die messen — sonst meldet er gruen, waehrend die Nutzer etwas
  // anderes bekommen.
  const css = nachDatei("/assets/start-styles.css?v=1");
  assert.match(css, /public\/assets\/start-styles\.css$/);
});

test("zwei auseinandergelaufene Fassungen derselben Datei fallen auf", () => {
  // Am 2026-09-04 hing public/assets/sw.js zwei Cache-Nummern hinter
  // public/sw.js zurueck. Der Waechter meldet so etwas jetzt, wo er die
  // Dateien ohnehin liest.
  assert.deepEqual(eigengewicht().zwillinge, [],
    "public/x und public/assets/x sind auseinandergelaufen — ausgeliefert wird die assets-Fassung");
});
