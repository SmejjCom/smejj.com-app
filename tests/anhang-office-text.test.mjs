// smejj.com — Office-Dateien lesen: echter ZIP-Leser (deflate) + XML-Textzieher, mit in Node gebauten Archiven.
// Ausfuehren: node --test tests/anhang-office-text.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { zipEintraege, zipEntpacke, docxText, pptxFolienText, xlsxSharedStrings, xlsxBlattText, xmlEntschluesseln, officeArt, liesOfficeText } from "../public/anhang-office-text.js";

/** Minimaler ZIP-Schreiber (Methode 8 = deflate, oder 0 = gespeichert) fuer Tests. */
function baueZip(dateien, methode = 8) {
  const teile = []; const zentral = []; let offset = 0;
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTab[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  for (const [name, inhalt] of Object.entries(dateien)) {
    const roh = Buffer.from(inhalt, "utf8");
    const daten = methode === 8 ? deflateRawSync(roh) : roh;
    const n = Buffer.from(name, "utf8");
    const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(20, 4); lokal.writeUInt16LE(methode, 8);
    lokal.writeUInt32LE(crc32(roh), 14); lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(roh.length, 22); lokal.writeUInt16LE(n.length, 26);
    const z = Buffer.alloc(46); z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(20, 6); z.writeUInt16LE(methode, 10);
    z.writeUInt32LE(crc32(roh), 16); z.writeUInt32LE(daten.length, 20); z.writeUInt32LE(roh.length, 24); z.writeUInt16LE(n.length, 28); z.writeUInt32LE(offset, 42);
    zentral.push(Buffer.concat([z, n]));
    teile.push(lokal, n, daten); offset += lokal.length + n.length + daten.length;
  }
  const zd = Buffer.concat(zentral);
  const ende = Buffer.alloc(22); ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(zentral.length, 8); ende.writeUInt16LE(zentral.length, 10);
  ende.writeUInt32LE(zd.length, 12); ende.writeUInt32LE(offset, 16);
  return Buffer.concat([...teile, zd, ende]);
}
const alsFile = (buf, name) => ({ name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });

test("ZIP: Zentralverzeichnis lesen und deflate-Eintrag entpacken", async () => {
  const zip = baueZip({ "a.txt": "hallo welt", "ordner/b.txt": "b" });
  const e = zipEintraege(new Uint8Array(zip));
  assert.deepEqual([...e.keys()], ["a.txt", "ordner/b.txt"]);
  assert.equal(e.get("a.txt").methode, 8);
  assert.equal(new TextDecoder().decode(await zipEntpacke(new Uint8Array(zip), e.get("a.txt"))), "hallo welt");
  const gespeichert = baueZip({ "c.txt": "roh" }, 0);
  assert.equal(new TextDecoder().decode(await zipEntpacke(new Uint8Array(gespeichert), zipEintraege(new Uint8Array(gespeichert)).get("c.txt"))), "roh");
});

test("XML-Zieher: Word-Absaetze, Folien, Excel mit geteilten Zeichenketten und Inline-Text", () => {
  assert.equal(docxText('<w:p><w:r><w:t>Hallo</w:t></w:r><w:r><w:t xml:space="preserve"> Welt &amp; Co</w:t></w:r></w:p><w:p><w:r><w:t>Zwei</w:t><w:tab/><w:t>Spalten</w:t></w:r></w:p>'), "Hallo Welt & Co\nZwei\tSpalten");
  assert.equal(pptxFolienText('<a:p><a:r><a:t>Titel</a:t></a:r></a:p><a:p><a:r><a:t>Punkt </a:t></a:r><a:r><a:t>eins</a:t></a:r></a:p>'), "Titel\nPunkt eins");
  const shared = xlsxSharedStrings("<sst><si><t>Name</t></si><si><r><t>Um</t></r><r><t>satz</t></r></si></sst>");
  assert.deepEqual(shared, ["Name", "Umsatz"]);
  const blatt = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Berlin</t></is></c><c r="B2"><v>120.5</v></c><c r="C2"/></row></sheetData>';
  assert.equal(xlsxBlattText(blatt, shared), "Name\tUmsatz\nBerlin\t120.5");
  assert.equal(xmlEntschluesseln("&lt;a&gt; &#252;ber &#x20AC;"), "<a> über €");
});

test("liesOfficeText: docx, pptx, xlsx aus echten Archiven; Fremdformat und Nicht-ZIP sauber abgelehnt", async () => {
  const docx = baueZip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Vertrag Nr. 7</w:t></w:r></w:p><w:p><w:r><w:t>Laufzeit 12 Monate</w:t></w:r></w:p></w:body></w:document>" });
  const d = await liesOfficeText(alsFile(docx, "vertrag.docx"));
  assert.equal(d.ok, true); assert.equal(d.art, "docx"); assert.equal(d.text, "Vertrag Nr. 7\nLaufzeit 12 Monate");
  const pptx = baueZip({ "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Zweite</a:t></a:r></a:p></p:sld>", "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Erste</a:t></a:r></a:p></p:sld>" });
  const p = await liesOfficeText(alsFile(pptx, "deck.pptx"));
  assert.equal(p.text, "[Folie 1]\nErste\n\n[Folie 2]\nZweite");
  const xlsx = baueZip({ "xl/sharedStrings.xml": "<sst><si><t>Stadt</t></si></sst>", "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheetData></worksheet>' });
  const x = await liesOfficeText(alsFile(xlsx, "zahlen.xlsx"));
  assert.equal(x.text, "[Blatt 1]\nStadt\t42");
  assert.equal(officeArt({ name: "alt.doc" }), "");
  assert.equal((await liesOfficeText(alsFile(docx, "alt.doc"))).grund, "kein_office_format");
  assert.match((await liesOfficeText(alsFile(Buffer.from("kein zip"), "x.docx"))).grund, /^kein_zip/);
});
