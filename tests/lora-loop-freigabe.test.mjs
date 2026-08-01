import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { schreibeBestenStand } from "../workers/smejj-lora-loop/state.js";
import { assessModelPromotion } from "../src/evaluation/modelPromotion.js";

const IDRIVE = Object.freeze({ idrive: { endpoint: "https://s3.test", bucket: "t", region: "us-west-2", accessKey: "a", secretKey: "b" } });

test("ein bester Stand wird IMMER als 'not-approved' abgelegt", async () => {
  // Auch dann, wenn der Aufrufer etwas anderes behauptet. Die Bestenliste der
  // Schleife ist eine Rangliste, keine Freigabe.
  let geschrieben = null;
  await schreibeBestenStand(
    { zyklusIndex: 3, promotionStatus: "approved", kennzahlen: { punktzahl: 0.99 } },
    { idriveConfig: IDRIVE, key: "ops/test.json", request: async (_c, _m, _k, koerper) => { geschrieben = JSON.parse(koerper); return ""; } }
  );
  assert.equal(geschrieben.promotionStatus, "not-approved");
});

test("die Befoerderungspruefung erlaubt niemals eine automatische Auslieferung", () => {
  // Selbst im besten Fall ist das Ergebnis 'eligible-for-human-approval'.
  const urteil = assessModelPromotion({});
  assert.equal(urteil.automaticDeploymentAllowed, false);
  assert.equal(urteil.writtenHumanApprovalRequired, true);
});

test("die Schleife ruft keinen Befoerderungs- oder Ausliefer-Pfad auf", () => {
  // Der wirksamste Schutz ist, dass der Weg gar nicht existiert. Diese Pruefung
  // faellt auf, sobald jemand ihn einbaut.
  const verzeichnis = new URL("../workers/smejj-lora-loop/", import.meta.url);
  const verboten = /assessModelPromotion|promoteModel|setDefaultModel|MODEL_REGISTRY/;
  for (const datei of readdirSync(verzeichnis)) {
    if (!/\.(js|mjs)$/.test(datei)) continue;
    const inhalt = readFileSync(new URL(datei, verzeichnis), "utf8");
    assert.ok(!verboten.test(inhalt), `${datei} greift auf einen Befoerderungspfad zu`);
  }
});

test("die Schleife veraendert die Pruefsuite nicht", () => {
  // Harte Grenze des Auftrags: Suite nicht lockern, Schwellen nicht verschieben,
  // keinen Fall entfernen. Kein Modul der Schleife darf in evals/ schreiben.
  const verzeichnis = new URL("../workers/smejj-lora-loop/", import.meta.url);
  for (const datei of readdirSync(verzeichnis)) {
    if (!/\.(js|mjs)$/.test(datei)) continue;
    const inhalt = readFileSync(new URL(datei, verzeichnis), "utf8");
    assert.ok(!/writeFile[^\n]*evals|evals[^\n]*writeFile/.test(inhalt), `${datei} schreibt in evals/`);
  }
});
