// smejj.com — Waechter: liegen die Wissensdokumente ueberhaupt im Abbild?
//
// DER BEFUND (2026-08-22, live gemessen). Der Chat antwortete auf
// "Auf welchen Servern laeuft smejj.com?" ausweichend und nannte weder IDrive
// noch Zeabur noch GitHub Pages — genau der Fehlbefund, gegen den am 2026-08-04
// die Anreicherung in rag/infrastrukturFrage.js gebaut wurde. Lokal war alles
// in Ordnung: MASTER_PROMPT.md gewann die Suche mit Punktzahl 38,8.
//
// Der Grund stand nicht im Code, sondern im Dockerfile: die COPY-Zeile nahm
// Memory_Bank.md, AI_Guidelines.md, Project_Goals.md, AGENTS.md und README.md
// mit — aber NICHT MASTER_PROMPT.md. Ausgerechnet das Dokument mit der
// vollstaendigen Dienste-Uebersicht war nie im Abbild. Kein Test konnte das
// sehen, weil alle gegen die Arbeitskopie messen, wo die Datei natuerlich liegt.
//
// Waechter-TUEV: gesunde Probe (alle fuenf werden kopiert) und kaputte Probe
// (eine erfundene Datei im Korpus faellt auf).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ROOT_KNOWLEDGE_FILES } from "../control-server/src/rag/knowledgeCorpus.js";

const DOCKERFILE = readFileSync(new URL("../Dockerfile.smejj-control", import.meta.url), "utf8");

// Alle Ziele aller COPY-Zeilen, ohne Flags und ohne das Ziel am Ende.
function kopierteWurzeldateien(inhalt) {
  const dateien = new Set();
  for (const zeile of inhalt.split("\n")) {
    const treffer = zeile.match(/^COPY\s+(.*)$/);
    if (!treffer) continue;
    const teile = treffer[1].split(/\s+/).filter((t) => t && !t.startsWith("--"));
    for (const teil of teile.slice(0, -1)) dateien.add(teil);
  }
  return dateien;
}

test("jedes Wurzeldokument des RAG-Korpus liegt im Control-Abbild", () => {
  const kopiert = kopierteWurzeldateien(DOCKERFILE);
  const fehlen = ROOT_KNOWLEDGE_FILES.filter((datei) => !kopiert.has(datei));
  assert.deepEqual(fehlen, [],
    `ohne diese Dateien antwortet der Chat live ausweichend: ${fehlen.join(", ")}`);
});

test("die Wurzeldokumente gibt es auch wirklich", () => {
  // Sonst bricht der Bau an der COPY-Zeile ab — lieber hier auffallen.
  for (const datei of ROOT_KNOWLEDGE_FILES) {
    assert.ok(existsSync(new URL(`../${datei}`, import.meta.url)), `${datei} fehlt im Projekt`);
  }
});

test("kaputte Probe: ein nicht kopiertes Dokument faellt auf", () => {
  const kopiert = kopierteWurzeldateien(DOCKERFILE);
  assert.equal(kopiert.has("GIBT_ES_NICHT.md"), false);
  const erfunden = [...ROOT_KNOWLEDGE_FILES, "GIBT_ES_NICHT.md"];
  const fehlen = erfunden.filter((datei) => !kopiert.has(datei));
  assert.deepEqual(fehlen, ["GIBT_ES_NICHT.md"], "der Waechter muss eine Luecke auch sehen");
});
