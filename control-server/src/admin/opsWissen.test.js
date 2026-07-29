// smejj.com — Unit-Tests fuer die Wissens-Sicht.
//
// Kern: im Release-Artefakt tragen alle Dateien denselben Bauzeitstempel. Ein
// Alter daraus zu rechnen ergaebe live rund 9.700 Tage neben jedem Dokument —
// und die Warnung "veraltet" leuchtete fuer alles. Ein Bildschirm, der grundlos
// Alarm schlaegt, wird nach dem zweiten Mal nicht mehr gelesen.
//
// Ausfuehren: node --test control-server/src/admin/opsWissen.test.js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { __leereWissenCache, wissenUebersicht, zeitstempelTaugen } from "./opsWissen.js";

const JETZT = Date.parse("2026-07-29T12:00:00.000Z");
const TAG_MS = 24 * 60 * 60 * 1000;

async function baum(dateien) {
  const wurzel = await fs.mkdtemp(path.join(os.tmpdir(), "smejj-wissen-"));
  for (const [name, { text, alterTage }] of Object.entries(dateien)) {
    const ziel = path.join(wurzel, name);
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    await fs.writeFile(ziel, text);
    const zeit = new Date(JETZT - alterTage * TAG_MS);
    await fs.utimes(ziel, zeit, zeit);
  }
  return wurzel;
}

const chunksAus = (dateien) => async () =>
  Object.entries(dateien).map(([name, d]) => ({ source: name, text: d.text }));

test("EIN EINHEITLICHER ZEITSTEMPEL IST KEIN ALTER", () => {
  // Genau der Fall im Release-Artefakt: deterministischer Bau, ueberall Epoche 0.
  assert.equal(zeitstempelTaugen([{ geaendertMs: 0 }, { geaendertMs: 0 }]), false);
  assert.equal(zeitstempelTaugen([{ geaendertMs: 946684800000 }, { geaendertMs: 946684800000 }]), false,
    "derselbe Zeitstempel bei allen Dateien stammt vom Bau, nicht von der Bearbeitung");
  assert.equal(zeitstempelTaugen([{ geaendertMs: 1 }, { geaendertMs: 2 }]), true);
  assert.equal(zeitstempelTaugen([{ geaendertMs: 5 }]), false, "aus einer einzigen Datei laesst sich nichts ableiten");
  assert.equal(zeitstempelTaugen([]), false);
});

test("im Artefakt wird kein Alter behauptet", async () => {
  __leereWissenCache();
  const dateien = {
    "AI_Guidelines.md": { text: "# A\n\nText.", alterTage: 500 },
    "docs/b.md": { text: "# B\n\nText.", alterTage: 500 }
  };
  const wurzel = await baum(dateien);
  // Beide Dateien tragen denselben Zeitstempel — wie im Artefakt.
  const e = await wissenUebersicht({ jetztMs: JETZT, wurzel, ladeChunks: chunksAus(dateien), frisch: true });
  assert.equal(e.alterMessbar, false);
  assert.equal(e.alt, null, "keine Zahl fuer 'veraltet', wenn das Alter nicht messbar ist");
  assert.equal(e.altAbTagen, null);
  assert.equal(e.quellen.every((q) => q.alterTage === null), true);
  assert.equal(e.sortierung, "groesste zuerst");
  assert.equal(e.hinweis.includes("deterministisch"), true, "der Grund steht dabei");
});

test("in der Arbeitskopie wird das Alter genutzt — aelteste zuerst", async () => {
  __leereWissenCache();
  const dateien = {
    "neu.md": { text: "# Neu\n\nText.", alterTage: 3 },
    "docs/alt.md": { text: "# Alt\n\nText.", alterTage: 400 }
  };
  const wurzel = await baum(dateien);
  const e = await wissenUebersicht({ jetztMs: JETZT, wurzel, ladeChunks: chunksAus(dateien), frisch: true });
  assert.equal(e.alterMessbar, true);
  assert.equal(e.quellen[0].quelle, "docs/alt.md", "das aelteste steht oben");
  assert.equal(e.quellen[0].alterTage, 400);
  assert.equal(e.alt, 1, "eines liegt ueber der Schwelle von 180 Tagen");
  assert.equal(e.aeltestesTage, 400);
});

test("Chunks werden je Quelle gezaehlt", async () => {
  __leereWissenCache();
  const wurzel = await baum({ "a.md": { text: "x", alterTage: 1 }, "docs/b.md": { text: "y", alterTage: 9 } });
  const e = await wissenUebersicht({
    jetztMs: JETZT, wurzel, frisch: true,
    ladeChunks: async () => ([
      { source: "a.md", text: "12345" },
      { source: "a.md", text: "67890" },
      { source: "docs/b.md", text: "abc" }
    ])
  });
  assert.equal(e.quellenGesamt, 2);
  assert.equal(e.chunksGesamt, 3);
  assert.equal(e.zeichenGesamt, 13);
  const a = e.quellen.find((q) => q.quelle === "a.md");
  assert.equal(a.chunks, 2);
  assert.equal(a.zeichen, 10);
});

test("ein Fehler beim Laden kippt die Ansicht nicht", async () => {
  __leereWissenCache();
  const e = await wissenUebersicht({
    jetztMs: JETZT, frisch: true,
    ladeChunks: async () => { throw new Error("Verzeichnis weg"); }
  });
  assert.equal(e.ok, false);
  assert.equal(e.error.includes("Verzeichnis weg"), true);
});
