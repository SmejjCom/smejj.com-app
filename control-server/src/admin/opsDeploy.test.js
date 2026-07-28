// smejj.com — Unit-Tests fuer die Deploy-Sicht.
// Ausfuehren: node --test control-server/src/admin/opsDeploy.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { deployUebersicht } from "./opsDeploy.js";

const JETZT = Date.parse("2026-07-28T13:00:00.000Z");

function leser(manifest) {
  return () => {
    if (manifest === null) throw new Error("ENOENT");
    return JSON.stringify(manifest);
  };
}

const MANIFEST = {
  releaseId: "smejj-control-stufe5-2026-07-28",
  createdAt: "2026-07-28T15:00:00.000Z",
  fileCount: 770,
  contentRootSha256: "311a95b8be0485ba596e5fbb5095073e3525820689912617df1af807c8ba064f"
};

test("Soll und Ist decken sich — der Normalfall", () => {
  const e = deployUebersicht({
    env: {
      SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/smejj-control-stufe5-2026-07-28.tar.gz",
      SMEJJ_CONTROL_ARTIFACT_SHA256: "ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    },
    jetztMs: JETZT, startzeitMs: JETZT - 60_000, leseDatei: leser(MANIFEST)
  });
  assert.equal(e.stimmtUeberein, true);
  assert.equal(e.bewertung, "deckungsgleich");
  assert.equal(e.soll.releaseId, "smejj-control-stufe5-2026-07-28");
  assert.equal(e.ist.releaseId, "smejj-control-stufe5-2026-07-28");
  assert.equal(e.soll.sha256Kurz, "abcdef012345", "gekuerzt und kleingeschrieben");
  assert.equal(e.laufzeitMs, 60_000);
});

test("der Rollout ist noch unterwegs: Soll zeigt schon auf das neue Artefakt", () => {
  const e = deployUebersicht({
    env: { SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/smejj-control-stufe6-2026-07-29.tar.gz" },
    jetztMs: JETZT, leseDatei: leser(MANIFEST)
  });
  assert.equal(e.stimmtUeberein, false);
  assert.equal(e.bewertung, "abweichend");
  assert.equal(e.hinweis.includes("zehn Minuten"), true, "die Erklaerung gehoert daneben, nicht in den Kopf der Betreiberin");
});

test("ohne Manifest laeuft der Server aus dem Arbeitsverzeichnis, nicht aus einem Release", () => {
  const e = deployUebersicht({ env: {}, jetztMs: JETZT, leseDatei: leser(null) });
  assert.equal(e.bewertung, "lokal");
  assert.equal(e.stimmtUeberein, null, "ohne beide Seiten wird nichts behauptet");
  assert.equal(e.ist.fehler, "manifest_nicht_lesbar");
});

test("fehlt nur eine Seite, ist der Zustand unbekannt — nicht abweichend", () => {
  const nurSoll = deployUebersicht({
    env: { SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/irgendwas.tar.gz" },
    jetztMs: JETZT, leseDatei: leser(null)
  });
  assert.equal(nurSoll.bewertung, "unbekannt");
  assert.equal(nurSoll.stimmtUeberein, null, "ein falscher Alarm hier kostet Vertrauen");

  const nurIst = deployUebersicht({ env: {}, jetztMs: JETZT, leseDatei: leser(MANIFEST) });
  assert.equal(nurIst.bewertung, "unbekannt");
  assert.equal(nurIst.stimmtUeberein, null);
});

test("aus der Umgebung wird nichts ausser den zwei Release-Zeigern gelesen", () => {
  const e = deployUebersicht({
    env: {
      SMEJJ_CONTROL_ARTIFACT_KEY: "deployments/control/smejj-control-stufe5-2026-07-28.tar.gz",
      IDRIVE_E2_SECRET_KEY: "streng-geheim",
      SMEJJ_SESSION_SECRET: "auch-geheim",
      SALAD_API_KEY: "ebenfalls-geheim"
    },
    jetztMs: JETZT, leseDatei: leser(MANIFEST)
  });
  const text = JSON.stringify(e);
  assert.equal(text.includes("geheim"), false, "kein Schluesselwert darf in die Antwort geraten");
});
