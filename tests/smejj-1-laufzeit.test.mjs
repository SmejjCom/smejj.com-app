// smejj 1 — die Bedingungen, unter denen das EIGENE Modell waehlbar wird.
//
// Der Anlass: Am 10.09. war alles fertig — Dienst live, Modell geladen, es
// antwortete nachweislich ("17 mal 3 ist 51") — und im Chat stand es trotzdem
// nicht zur Wahl. Der Grund war eine doppelte Tuer vor demselben Raum: ein
// Feature-Flag UND ein Schluessel. Das Flag hat nie etwas geschuetzt, denn ohne
// Schluessel ist die Laufzeit ohnehin nicht konfiguriert. Es hat nur einen
// zweiten Handgriff verlangt, den vier Tage lang niemand machte.

import test from "node:test";
import assert from "node:assert/strict";

import { getModelDefinition, getModelRuntimeConfig, isModelEnabled } from "../src/shared/modelRegistry.js";

test("ohne Schluessel bleibt smejj 1 unkonfiguriert — fail-closed", () => {
  // Die eine Tuer, die wirklich schuetzt.
  assert.equal(getModelRuntimeConfig("smejj-1", {}).configured, false);
});

test("EIN Schluessel genuegt — Adresse und Modellkennung stehen im Code", () => {
  // Das Skript vom 06.09. nannte fuenf Werte. Drei davon ueberschreiben nur,
  // was ohnehin in der Registry steht: Adresse, Kennung und Kopfzeile.
  const r = getModelRuntimeConfig("smejj-1", { SMEJJ_LLM_SMEJJ1_API_KEY: "k" });
  assert.equal(r.configured, true);
  assert.equal(r.baseUrl, "https://smejj-hausmodell.zeabur.app/v1");
  assert.equal(r.runtimeModel, "smejj-1-basis");
  assert.equal(r.apiKeyHeader, "Authorization");
});

test("der Schluessel darf auch unter seinem Dienstnamen stehen", () => {
  // Derselbe Wert heisst beim Hausmodell-Dienst SMEJJ_HAUSMODELL_KEY. Ihn ein
  // zweites Mal einzutragen ist eine Fehlerquelle, kein Schutz.
  const r = getModelRuntimeConfig("smejj-1", { SMEJJ_HAUSMODELL_KEY: "k" });
  assert.equal(r.configured, true);
  assert.deepEqual(r.apiKeys, ["k"]);
});

test("der modellspezifische Name gewinnt, wenn beide gesetzt sind", () => {
  // Sonst ueberstimmt ein alter Dienstschluessel still einen neu eingetragenen.
  const r = getModelRuntimeConfig("smejj-1", { SMEJJ_LLM_SMEJJ1_API_KEY: "neu", SMEJJ_HAUSMODELL_KEY: "alt" });
  assert.equal(r.apiKeys[0], "neu");
});

test("smejj 1 braucht kein Freischalt-Flag mehr", () => {
  assert.equal(isModelEnabled("smejj-1", {}), true);
  assert.equal(getModelDefinition("smejj-1").enabledByDefault, true);
});

test("das Flag kann das Modell weiterhin ABSCHALTEN", () => {
  // Wichtig fuer den Notfall: wenn der Hausmodell-Dienst klemmt, muss es EINEN
  // Schalter geben, der das Modell aus dem Menue nimmt, ohne den Schluessel zu
  // loeschen.
  assert.equal(isModelEnabled("smejj-1", { SMEJJ_1_ENABLED: "NO" }), false);
  assert.equal(isModelEnabled("smejj-1", { SMEJJ_1_ENABLED: "false" }), false);
});

test("kein anderes Modell hat sich dabei veraendert", () => {
  // Die Registry ist geteilt. Eine Aenderung an smejj-1 darf glm-5-2 nicht
  // anfassen — das ist das Modell, das smejj.com heute antreibt.
  assert.equal(getModelRuntimeConfig("glm-5-2", {}).configured, false);
  assert.equal(getModelRuntimeConfig("glm-5-2", { SMEJJ_LLM_ZHIPU_API_KEY: "k" }).configured, true);
});
