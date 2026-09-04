// smejj.com — Der pdf.js-Worker wird aus seinen zwei Repo-Teilen ausgeliefert.
// Ausfuehren: node --test tests/pdfjs-worker-route.test.mjs
//
// WARUM: check-no-paid-services.mjs verbietet Dateien ueber 1 MB im Repo; der Worker wiegt
// 1,27 MB und liegt darum als part1/part2. Im Container gibt es die zusammengesetzte Datei
// nicht (git-ignoriert) — der Server setzt sie zur Laufzeit zusammen. Faellt das weg, laedt
// pdf.js seinen Worker nicht und PDF-Anhaenge bleiben stumme Verweise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";

const quelle = readFileSync("src/server.js", "utf8");

test("server.js hat die Worker-Route VOR der allgemeinen /assets/-Auslieferung", () => {
  const route = quelle.indexOf('url.pathname === "/assets/vendor/pdfjs/pdf.worker.min.js"');
  const allgemein = quelle.indexOf('url.pathname.startsWith("/assets/")) return serveFile');
  assert.ok(route > 0, "Worker-Route fehlt");
  assert.ok(allgemein > 0, "allgemeine /assets/-Route fehlt");
  assert.ok(route < allgemein, "die Worker-Route muss vor der allgemeinen stehen");
  assert.match(quelle, /Content-Type": "application\/javascript/, "JavaScript-MIME (Module brauchen ihn)");
});

test("der Helfer liest genau die zwei Teile und merkt sich das Ergebnis", () => {
  assert.match(quelle, /pdf\.worker\.min\.part1\.js/, "Teil 1");
  assert.match(quelle, /pdf\.worker\.min\.part2\.js/, "Teil 2");
  assert.match(quelle, /if \(pdfWorkerSpeicher !== null\) return pdfWorkerSpeicher \|\| null;/, "einmal lesen, dann aus dem Speicher");
  assert.match(quelle, /pdfWorkerSpeicher = false;/, "fehlende Teile bleiben fail-safe (normale Auslieferung)");
});

test("die Teile liegen im Repo, jeder unter 1 MB, zusammen die volle Groesse", () => {
  const ordner = "public/vendor/pdfjs";
  const teile = ["pdf.worker.min.part1.js", "pdf.worker.min.part2.js"];
  for (const t of teile) assert.ok(existsSync(`${ordner}/${t}`), `${t} fehlt`);
  const groessen = teile.map((t) => statSync(`${ordner}/${t}`).size);
  assert.ok(groessen.every((n) => n < 1_000_000), "jeder Teil unter 1 MB");
  const erwartet = Number((readFileSync(`${ordner}/VERSION`, "utf8").match(/worker-bytes=(\d+)/) || [])[1]);
  assert.ok(erwartet > 1_000_000, "VERSION nennt die Worker-Groesse");
  assert.equal(groessen[0] + groessen[1], erwartet, "Teile ergeben den ganzen Worker");
});
