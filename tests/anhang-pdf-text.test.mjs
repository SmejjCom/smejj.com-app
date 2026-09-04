// smejj.com — PDF-Anhang lesen: reine Textbausteine (Zeilen, Seitenmarken, Kappung).
// Ausfuehren: node --test tests/anhang-pdf-text.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { seitenTextAus, dokumentTextAus, MAX_ZEICHEN } from "../public/anhang-pdf-text.js";

test("seitenTextAus: Fragmente werden zu Woertern und Zeilen, Leerraum verdichtet", () => {
  const items = [{ str: "Hallo" }, { str: "smejj", hasEOL: true }, { str: "Zweite" }, { str: " Zeile" }, { str: "  " , hasEOL: true }, { str: "Ende" }];
  assert.equal(seitenTextAus(items), "Hallo smejj\nZweite Zeile\nEnde");
  assert.equal(seitenTextAus([]), "");
  assert.equal(seitenTextAus(null), "");
});

test("dokumentTextAus: Seitenmarken, leere Seiten fallen weg, Kappung mit Hinweis", () => {
  const t = dokumentTextAus(["Seite eins", "", "Seite drei"]);
  assert.equal(t, "[Seite 1]\nSeite eins\n\n[Seite 3]\nSeite drei");
  const lang = dokumentTextAus(["a".repeat(150), "b".repeat(150)], 200);
  assert.ok(lang.includes("[Seite 1]"));
  assert.ok(lang.includes("gekuerzt: 2 Seiten"));
  assert.ok(lang.length < 400);
  assert.equal(MAX_ZEICHEN, 200_000);
});

test("pdf.js liegt als Fremdmodul mit Lizenz und Version unter public/vendor/pdfjs", () => {
  for (const f of ["pdf.min.js", "pdf.worker.min.part1.js", "pdf.worker.min.part2.js", "LICENSE", "VERSION"]) {
    assert.ok(existsSync(`public/vendor/pdfjs/${f}`), `${f} fehlt`);
  }
  // Sicherheitsregel: keine Datei ueber 1 MB im Repo — der Worker liegt darum in zwei Teilen,
  // die zusammen byte-genau die Originalgroesse aus VERSION ergeben.
  const teile = ["pdf.worker.min.part1.js", "pdf.worker.min.part2.js"].map((f) => statSync(`public/vendor/pdfjs/${f}`).size);
  assert.ok(teile.every((n) => n < 1_000_000), "jeder Teil unter 1 MB");
  const workerBytes = Number((readFileSync("public/vendor/pdfjs/VERSION", "utf8").match(/worker-bytes=(\d+)/) || [])[1]);
  assert.equal(teile[0] + teile[1], workerBytes, "Teile ergeben den ganzen Worker");
  // Die zusammengesetzte Datei darf existieren (sie wird gebaut), aber NIE eingecheckt sein.
  const getrackt = execFileSync("git", ["ls-files", "public/vendor/pdfjs", "public/assets/vendor/pdfjs"], { encoding: "utf8" });
  assert.ok(!/pdf\.worker\.min\.js$/m.test(getrackt), "der ganze Worker ist nicht eingecheckt");
  assert.match(getrackt, /pdf\.worker\.min\.part1\.js/, "Teil 1 ist eingecheckt");
  assert.match(readFileSync("public/vendor/pdfjs/LICENSE", "utf8"), /Apache License/);
  assert.match(readFileSync("public/vendor/pdfjs/VERSION", "utf8"), /^\d+\.\d+\.\d+/);
});
