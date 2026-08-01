import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

// Waechter gegen eine Falle, die dieses Projekt schon zweimal Zeit gekostet hat.
//
// .dockerignore schliesst `workers/*` und `scripts/*` pauschal aus und stellt
// einzelne Pfade per Negation wieder frei. Wer einen neuen Worker ergaenzt und
// ihn im Dockerfile kopiert, aber die Negation vergisst, bekommt KEINE
// verstaendliche Meldung, sondern:
//   "failed to solve: failed to compute cache key: failed to calculate checksum"
// Der Ordner liegt schlicht nicht im Bau-Kontext.
//
// Live gemessen am 2026-08-01 (deployment-6a6d95059cd65e28a34344dd): der Bau
// des Dienstes smejj-training-loop brach an
//   COPY workers/smejj-lora-loop ./workers/smejj-lora-loop
// ab. Dieser Test faengt genau das ab, bevor es ein Deploy tut.

const WURZEL = new URL("../", import.meta.url);
const IGNORE = readFileSync(new URL(".dockerignore", WURZEL), "utf8");

/** Verzeichnisse, die pauschal ausgeschlossen sind und Negationen brauchen. */
const PAUSCHAL_AUSGESCHLOSSEN = ["workers", "scripts", "schemas"];

function dockerfiles() {
  return readdirSync(WURZEL).filter((name) => name.startsWith("Dockerfile."));
}

/** Quellpfade aller COPY-Zeilen eines Dockerfiles. */
function kopierteQuellen(inhalt) {
  const quellen = [];
  for (const zeile of inhalt.split(/\r?\n/)) {
    const treffer = /^\s*COPY\s+(?:--[^\s]+\s+)*(.+)$/.exec(zeile);
    if (!treffer) continue;
    const teile = treffer[1].trim().split(/\s+/);
    // Letztes Feld ist das Ziel, alles davor sind Quellen.
    for (const quelle of teile.slice(0, -1)) quellen.push(quelle.replace(/^\.\//, ""));
  }
  return quellen;
}

/** Ist der Pfad durch eine Negation wieder freigestellt? */
function freigestellt(pfad) {
  const zeilen = IGNORE.split(/\r?\n/).map((z) => z.trim()).filter((z) => z.startsWith("!"));
  const negationen = zeilen.map((z) => z.slice(1).replace(/\/\*\*$/, "").replace(/\/$/, ""));
  return negationen.some((n) => pfad === n || pfad.startsWith(`${n}/`));
}

test("jeder COPY-Pfad aus einem pauschal ausgeschlossenen Verzeichnis ist freigestellt", () => {
  const fehlend = [];
  for (const datei of dockerfiles()) {
    const inhalt = readFileSync(new URL(datei, WURZEL), "utf8");
    for (const quelle of kopierteQuellen(inhalt)) {
      const wurzelordner = quelle.split("/")[0];
      if (!PAUSCHAL_AUSGESCHLOSSEN.includes(wurzelordner)) continue;
      // `COPY workers` (das ganze Verzeichnis) ist in Ordnung: was darin
      // ankommt, entscheiden die Negationen. Nur ein AUSDRUECKLICHER Unterpfad
      // wie `COPY workers/smejj-lora-loop` scheitert hart, wenn die Negation
      // fehlt — und nur der wird hier geprueft.
      if (quelle === wurzelordner) continue;
      if (!freigestellt(quelle)) fehlend.push(`${datei}: COPY ${quelle}`);
    }
  }
  assert.deepEqual(fehlend, [], `Nicht im Bau-Kontext (.dockerignore-Negation fehlt):\n  ${fehlend.join("\n  ")}`);
});

test("der Anbau der Dauertrainings-Schleife ist ausdruecklich freigestellt", () => {
  // Der konkrete Fall, der den Bau am 2026-08-01 zerlegt hat.
  assert.ok(freigestellt("workers/smejj-lora-loop"));
  assert.ok(IGNORE.includes("!workers/smejj-lora-loop/**"));
});

test("der Waechter erkennt eine fehlende Freistellung wirklich", () => {
  // Ohne diese Gegenprobe koennte freigestellt() alles bejahen und der Test
  // waere ein gruener Aufkleber ohne Wirkung.
  assert.equal(freigestellt("workers/gibt-es-nicht"), false);
});
