// smejj.com — Anhang-Chips: reine Bausteine (Art, Groesse, Verweis) + Verweis-Uebergabe.
// Ausfuehren: node --test tests/composer-anhang-chips.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { dateiArt, formatGroesse, verweisFuer, nimmVerweise, hatAnhaenge } from "../public/composer-anhang-chips.js";

test("dateiArt: erkennt Video, Bild, PDF, Dokument, Archiv, Audio — auch ohne MIME-Typ am Namen", () => {
  assert.equal(dateiArt({ name: "IMG_5287.mov", type: "video/quicktime" }), "video");
  assert.equal(dateiArt({ name: "clip.MP4", type: "" }), "video");
  assert.equal(dateiArt({ name: "foto.heic", type: "" }), "bild");
  assert.equal(dateiArt({ name: "vertrag.pdf", type: "application/pdf" }), "pdf");
  assert.equal(dateiArt({ name: "brief.docx", type: "" }), "dokument");
  assert.equal(dateiArt({ name: "paket.zip", type: "application/zip" }), "archiv");
  assert.equal(dateiArt({ name: "memo.m4a", type: "audio/mp4" }), "audio");
  assert.equal(dateiArt({ name: "irgendwas.bin", type: "" }), "datei");
});

test("formatGroesse: B, KB, MB lesbar, deutsches Komma", () => {
  assert.equal(formatGroesse(900), "900 B");
  assert.equal(formatGroesse(63595 * 1024), "62 MB");
  assert.equal(formatGroesse(1.5 * 1024 * 1024), "1,5 MB");
  assert.equal(formatGroesse(2048), "2 KB");
});

test("verweisFuer: Zeile fuer die Aufgabe im bekannten Klammer-Format", () => {
  assert.equal(verweisFuer({ art: "video", name: "IMG_5287.mov", groesse: 63595 * 1024 }), "[Video: IMG_5287.mov (62 MB)]");
  assert.equal(verweisFuer({ art: "pdf", name: "a.pdf", groesse: 2048 }), "[PDF: a.pdf (2 KB)]");
});

test("nimmVerweise: ohne Chips leer, ohne Browser kein Fehler", () => {
  assert.equal(hatAnhaenge(), false);
  assert.deepEqual(nimmVerweise(), []);
});
