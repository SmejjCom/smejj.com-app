// Waechter gegen die Zwei-Kopien-Falle beim Fern-Browser.
//
// GEMESSEN 2026-08-21, kurz vor einem Deploy: Der Fern-Browser hat ZWEI
// Dockerfiles — workers/remote-browser/Dockerfile (die gepflegte Quelle) und
// Dockerfile.smejj-remote-browser im Wurzelverzeichnis (die Kopie, aus der
// Zeabur WIRKLICH baut, Namensschema Dockerfile.<dienst>). Eine neue
// COPY-Zeile war nur in der Quelle gelandet. Der Bau waere durchgelaufen,
// der Dienst danach auf JEDE Sitzung mit 503 gestorben — der Aufrufer
// verschluckt den Ladefehler, der Grund haette nirgends gestanden.
//
// Dieselbe Familie wie [[smejj-admin-konsole-zwei-kopien]] und der Grund
// fuer die Kommentarzeilen zu bildschirm.mjs in beiden Dateien: wer eine
// Datei ergaenzt, vergisst die andere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = join(WURZEL, "workers", "remote-browser", "Dockerfile");
const KOPIE = join(WURZEL, "Dockerfile.smejj-remote-browser");

// Nur die COPY-Zeilen zaehlen: die Wurzel-Kopie traegt zusaetzlich einen
// Hinweisblock, der bewusst nur dort steht.
function copyZeilen(pfad) {
  return readFileSync(pfad, "utf8")
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z.startsWith("COPY "));
}

test("beide Dockerfiles kopieren EXAKT dieselben Dateien", () => {
  const quelle = copyZeilen(QUELLE);
  const kopie = copyZeilen(KOPIE);
  const fehltInKopie = quelle.filter((z) => !kopie.includes(z));
  const fehltInQuelle = kopie.filter((z) => !quelle.includes(z));
  assert.deepEqual(
    fehltInKopie,
    [],
    `Diese COPY-Zeilen fehlen in Dockerfile.smejj-remote-browser (aus DIESER Datei baut Zeabur!):\n  ${fehltInKopie.join("\n  ")}`
  );
  assert.deepEqual(
    fehltInQuelle,
    [],
    `Diese COPY-Zeilen fehlen in workers/remote-browser/Dockerfile:\n  ${fehltInQuelle.join("\n  ")}`
  );
});

test("jedes Modul, das session-engine.js importiert, wird auch kopiert", () => {
  // Der eigentliche Befund: ein Import ohne COPY-Zeile ist der 503.
  const engine = readFileSync(join(WURZEL, "workers", "remote-browser", "session-engine.js"), "utf8");
  const importe = [...engine.matchAll(/from\s+"(\.\.?\/[^"]+)"/g)].map((m) => m[1]);
  const relativZuWurzel = importe
    .filter((p) => p.startsWith("../maus-engine/") || p.startsWith("./"))
    .map((p) => (p.startsWith("./") ? `workers/remote-browser/${p.slice(2)}` : `workers/${p.slice(3)}`));
  assert.ok(relativZuWurzel.length > 0, "keine Importe gefunden — Pruefer misst ins Leere");
  const kopie = copyZeilen(KOPIE).join("\n");
  for (const datei of relativZuWurzel) {
    assert.ok(
      kopie.includes(datei),
      `session-engine.js importiert ${datei}, aber Dockerfile.smejj-remote-browser kopiert es nicht — der Dienst startet und antwortet auf JEDE Sitzung mit 503.`
    );
  }
});
