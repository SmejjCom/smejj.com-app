// smejj.com — PDF-Anhang lesen: reine Textbausteine (Zeilen, Seitenmarken, Kappung).
// Ausfuehren: node --test tests/anhang-pdf-text.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  for (const f of ["pdf.min.js", "pdf.worker.min.js", "LICENSE", "VERSION"]) {
    assert.ok(existsSync(`public/vendor/pdfjs/${f}`), `${f} fehlt`);
  }
  assert.match(readFileSync("public/vendor/pdfjs/LICENSE", "utf8"), /Apache License/);
  assert.match(readFileSync("public/vendor/pdfjs/VERSION", "utf8").trim(), /^\d+\.\d+\.\d+$/);
});
