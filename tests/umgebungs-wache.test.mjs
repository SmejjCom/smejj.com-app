// smejj.com — Wächter-TÜV für die Umgebungs-Wache Nr. 71 (2026-09-02).
// Kaputte UND gesunde Probe, plus Anschluss-Beweise (Registry, Nummer, Läufer, Bereich).
// Ausführen: node --test tests/umgebungs-wache.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileUmgebung, fuehreSelbsttestAus, laufUmgebungsWache, ZHIPU_CODING_ADRESSE } from "../control-server/src/autopilots/umgebungsWacheAutopilot.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon } from "../control-server/src/admin/opsAutopilotenBereiche.js";

const gesund = { SMEJJ_LLM_ZHIPU_API_KEY: "k", SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_ZHIPU_BASE_URL: ZHIPU_CODING_ADRESSE };

test("Nr. 71: fehlende Coding-Adresse ist rot, Pay-as-you-go-Adresse ist rot, vollstaendig ist gruen", () => {
  assert.equal(beurteileUmgebung(gesund).ok, true);
  const ohne = beurteileUmgebung({ SMEJJ_LLM_ZHIPU_API_KEY: "k", SMEJJ_LLM_GROQ_API_KEY: "k" });
  assert.equal(ohne.ok, false);
  assert.match(ohne.fehler.join(" "), /SMEJJ_LLM_ZHIPU_BASE_URL fehlt/);
  const falsch = beurteileUmgebung({ ...gesund, SMEJJ_LLM_ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4" });
  assert.equal(falsch.ok, false);
  assert.match(falsch.fehler.join(" "), /open\.bigmodel\.cn/);
  const ohneKey = beurteileUmgebung({ SMEJJ_LLM_ZHIPU_BASE_URL: ZHIPU_CODING_ADRESSE, SMEJJ_LLM_GROQ_API_KEY: "k" });
  assert.equal(ohneKey.ok, false);
  assert.match(ohneKey.fehler.join(" "), /SMEJJ_LLM_ZHIPU_API_KEY/);
});

test("Nr. 71: kein Schluesselwert erscheint in Urteil oder Meldung", async () => {
  const env = { ...gesund, SMEJJ_LLM_ZHIPU_API_KEY: "GEHEIM-abc123", SMEJJ_LLM_GROQ_API_KEY: "GEHEIM-xyz789" };
  const urteil = beurteileUmgebung(env);
  assert.ok(!JSON.stringify(urteil).includes("GEHEIM"), "Urteil traegt keinen Schluesselwert");
  const lauf = await laufUmgebungsWache({ env });
  assert.equal(lauf.ok, true);
  assert.ok(!lauf.meldung.includes("GEHEIM"), "Meldung traegt keinen Schluesselwert");
  assert.match(lauf.meldung, /api\.z\.ai\/api\/coding\/paas\/v4/);
});

test("Nr. 71: der Lauf ist rot mit Handlungsanweisung, wenn die Umgebung unvollstaendig ist", async () => {
  const lauf = await laufUmgebungsWache({ env: { SMEJJ_LLM_ZHIPU_API_KEY: "k", SMEJJ_LLM_GROQ_API_KEY: "k" } });
  assert.equal(lauf.ok, false);
  assert.match(lauf.meldung, /Redeploy/);
});

test("Nr. 71: Selbsttest besteht (kaputt und gesund richtig beurteilt)", () => {
  const probe = fuehreSelbsttestAus();
  assert.deepEqual(probe.fehler, []);
  assert.equal(probe.bestanden, true);
});

test("Anschluss: Nr. 71 steht in der Registry, laeuft im Taktgeber und hat einen Bereich", () => {
  const eintrag = AUTOPILOTEN.find((a) => a.id === "umgebungs-wache");
  assert.ok(eintrag, "umgebungs-wache fehlt in der Registry");
  assert.equal(eintrag.nummer, "71");
  const nummern = AUTOPILOTEN.map((a) => a.nummer).filter(Boolean);
  assert.equal(new Set(nummern).size, nummern.length, "Nummern sind eindeutig");
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("umgebungs-wache"), "laeuft nicht im Autopilot-Laeufer");
  assert.equal(bereichVon("umgebungs-wache"), "Betrieb & Auslieferung");
});
