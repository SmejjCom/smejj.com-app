// smejj.com — Versionsregister + Alias "smejj" (Nr. 83): kaputte UND gesunde Probe.
// Ausführen: node --test tests/smejj-versionen.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  entscheideBefoerderung, haengeUm, lehneAb, leeresRegister, liveTauglich, rolleZurueck, schalteLive, stableEintrag, STATUS, RAUSCHSCHWELLE
} from "../src/shared/smejjVersionen.js";
import { setzeSmejjRegister, smejjAliasZiel, SMEJJ_MODELL_ID } from "../control-server/src/llm/smejjAlias.js";
import { resolveModelSelection } from "../src/shared/modelRegistry.js";
import { resolveModelRequest } from "../control-server/src/llm/modelRouter.js";

const T = "2026-09-05T10:00:00Z";
const LAUFZEIT = { SMEJJ_1_ENABLED: "YES", SMEJJ_LLM_SMEJJ1_BASE_URL: "https://smejj1.test/v1", SMEJJ_LLM_SMEJJ1_API_KEY: "k1" };
const GLM = { SMEJJ_LLM_ZHIPU_API_KEY: "z", SMEJJ_LLM_ZHIPU_BASE_URL: "https://zhipu.test/v4" };

test("Befoerderung: besser als Basis, mehr als Rauschen ueber stable, null kritisch — sonst Nein mit Grund", () => {
  assert.equal(entscheideBefoerderung({ kandidat: { version: "smejj-1-2", note: 0.85, kritisch: 0 }, stabil: { note: 0.8 }, basis: { note: 0.6 } }).befoerdern, true);
  const k = entscheideBefoerderung({ kandidat: { version: "smejj-1-2", note: 0.95, kritisch: 2 }, stabil: { note: 0.8 }, basis: { note: 0.6 } });
  assert.equal(k.befoerdern, false); assert.deepEqual(k.gruende, ["kritische_fehler:2"]);
  const r = entscheideBefoerderung({ kandidat: { version: "v", note: 0.8 + RAUSCHSCHWELLE / 2, kritisch: 0 }, stabil: { note: 0.8 }, basis: { note: 0.6 } });
  assert.equal(r.befoerdern, false); assert.match(r.gruende[0], /kein_messbarer_vorsprung/);
  const b = entscheideBefoerderung({ kandidat: { version: "v", note: 0.55, kritisch: 0 }, basis: { note: 0.6 } });
  assert.equal(b.befoerdern, false); assert.match(b.gruende[0], /nicht_besser_als_basis/);
  assert.equal(entscheideBefoerderung({ kandidat: { version: "v" } }).befoerdern, false, "ohne Note fail-closed");
  assert.equal(entscheideBefoerderung({ kandidat: { version: "v", note: 1.4 } }).befoerdern, false, "Note ausserhalb 0..1 ist keine Note");
  assert.equal(entscheideBefoerderung({ kandidat: { version: "erste", note: 0.7, kritisch: 0 }, basis: { note: 0.6 } }).befoerdern, true, "erste Version ohne stable: nur Basis zaehlt");
});

test("Live-Tauglichkeit: Referenz in Prozent, Note als Anteil, Toleranz zwei Punkte, ohne Referenz nie", () => {
  assert.equal(liveTauglich({ note: 0.951, referenzNote: 97 }).tauglich, true);
  assert.equal(liveTauglich({ note: 0.94, referenzNote: 97 }).tauglich, false);
  assert.equal(liveTauglich({ note: 0.99, referenzNote: null }).grund, "referenz_fehlt");
  assert.equal(liveTauglich({ note: null, referenzNote: 97 }).grund, "note_fehlt");
});

test("Umhaengen, Ablehnen, Rueckweg: alt bleibt im Register, nichts wird geloescht", () => {
  let reg = leeresRegister(T);
  assert.equal(reg.stable, null); assert.equal(reg.live, false);
  reg = haengeUm(reg, { version: "smejj-1-1", note: 0.61, basisNote: 0.5, kritisch: 0, referenzNote: 100, jobId: "j1" }, { jetztIso: T });
  assert.equal(reg.stable, "smejj-1-1");
  assert.equal(reg.live, false, "61 % unter Referenz 100 %: stable ja, live nein");
  assert.match(reg.liveGrund, /unter Referenz/);
  reg = lehneAb(reg, { version: "smejj-1-2", note: 0.55, kritisch: 3 }, ["kritische_fehler:3"], { jetztIso: T });
  assert.equal(reg.stable, "smejj-1-1");
  assert.equal(reg.versionen.find((v) => v.version === "smejj-1-2").status, STATUS.ABGELEHNT);
  reg = haengeUm(reg, { version: "smejj-1-3", note: 0.99, basisNote: 0.5, kritisch: 0, referenzNote: 97, jobId: "j3" }, { jetztIso: "2026-09-06T10:00:00Z" });
  assert.equal(reg.stable, "smejj-1-3"); assert.equal(reg.live, true, "99 % erreicht Referenz 97 %");
  assert.equal(reg.versionen.find((v) => v.version === "smejj-1-1").status, STATUS.ERSETZT);
  assert.equal(reg.versionen.length, 3, "abgelehnte und ersetzte Versionen bleiben");
  assert.equal(reg.verlauf[0].art, "befoerdert"); assert.equal(reg.verlauf[0].von, "smejj-1-1");
  const r = rolleZurueck(reg, "Laufzeit rot", { jetztIso: "2026-09-06T11:00:00Z" });
  assert.equal(r.zurueckgerollt, true);
  assert.equal(r.register.stable, "smejj-1-1", "die juengste ersetzte Version wird wieder stable");
  assert.equal(r.register.live, false, "61 % bleibt unter der Referenz");
  assert.equal(r.register.versionen.find((v) => v.version === "smejj-1-3").status, STATUS.ZURUECKGEROLLT);
  assert.equal(stableEintrag(r.register).version, "smejj-1-1");
  assert.equal(rolleZurueck(leeresRegister(T), "x").zurueckgerollt, false, "ohne stable kein Rueckweg");
  const aus = schalteLive(reg, false, "Probe", { jetztIso: T });
  assert.equal(aus.live, false); assert.equal(aus.verlauf[0].art, "live_aus");
  assert.equal(schalteLive(aus, false, "nochmal"), aus, "kein Doppel-Eintrag bei gleichem Zustand");
});

test("Alias-Ziel: fail-closed ohne Register, ohne Live, ohne Flag, ohne Laufzeit — und LIVE nur mit allem", () => {
  assert.equal(smejjAliasZiel(LAUFZEIT, null).live, false);
  const stableNichtLive = haengeUm(leeresRegister(T), { version: "smejj-1-1", note: 0.61, referenzNote: 100 }, { jetztIso: T });
  assert.equal(smejjAliasZiel(LAUFZEIT, stableNichtLive).live, false);
  const live = haengeUm(leeresRegister(T), { version: "smejj-1-3", note: 0.99, referenzNote: 97 }, { jetztIso: T });
  assert.equal(smejjAliasZiel({}, live).live, false, "ohne SMEJJ_1_ENABLED bleibt der Alias aus");
  assert.match(smejjAliasZiel({}, live).grund, /SMEJJ_1_ENABLED/);
  assert.equal(smejjAliasZiel({ SMEJJ_1_ENABLED: "YES" }, live).live, false, "ohne Adresse/Schluessel bleibt der Alias aus");
  const ziel = smejjAliasZiel(LAUFZEIT, live);
  assert.equal(ziel.live, true); assert.equal(ziel.modelId, SMEJJ_MODELL_ID); assert.equal(ziel.version, "smejj-1-3");
});

test("Registry: der Alias uebernimmt Anfragen ohne Anbieterwahl und Markennamen — nie eine ausdrueckliche Wahl", () => {
  const env = { ...GLM, ...LAUFZEIT };
  // Die Grossschreibung wird zur Laufzeit gebildet — hingeschrieben verstiesse sie gegen die Namensregel.
  for (const marke of ["", "smejj", "smejj-latest", "smejj 1.0", "smejj".toUpperCase()]) {
    const s = resolveModelSelection({ requestedModel: marke, profile: "default", env, aliasZiel: SMEJJ_MODELL_ID });
    assert.equal(s.selectedModelId, SMEJJ_MODELL_ID, `Marke ${JSON.stringify(marke)}`);
    assert.equal(s.reason, "smejj_alias"); assert.equal(s.alias, SMEJJ_MODELL_ID);
    assert.ok(s.candidateIds.includes("glm-5-2"), "das Standardmodell bleibt als Rueckfall in der Kette");
  }
  const ausdruecklich = resolveModelSelection({ requestedModel: "glm-5.2", profile: "default", env, aliasZiel: SMEJJ_MODELL_ID });
  assert.equal(ausdruecklich.selectedModelId, "glm-5-2"); assert.equal(ausdruecklich.reason, "explicit_model");
  const ohneZiel = resolveModelSelection({ requestedModel: "smejj", profile: "default", env });
  assert.equal(ohneZiel.selectedModelId, "glm-5-2", "ohne Alias-Ziel bleibt alles wie zuvor"); assert.equal(ohneZiel.alias, null);
  const ohneLaufzeit = resolveModelSelection({ requestedModel: "", profile: "default", env: GLM, aliasZiel: SMEJJ_MODELL_ID });
  assert.equal(ohneLaufzeit.selectedModelId, "glm-5-2", "unkonfiguriertes Ziel greift nicht");
});

test("Router: mit Live-Register und Laufzeit steht smejj-1 vorn, sonst unveraendert GLM", () => {
  const env = { ...GLM, ...LAUFZEIT };
  try {
    setzeSmejjRegister(null);
    assert.equal(resolveModelRequest("default", "smejj", env).chain[0].logicalModelId, "glm-5-2");
    setzeSmejjRegister(haengeUm(leeresRegister(T), { version: "smejj-1-3", note: 0.99, referenzNote: 97 }, { jetztIso: T }));
    const { chain, selection } = resolveModelRequest("default", "smejj", env);
    assert.equal(selection.selectedModelId, SMEJJ_MODELL_ID);
    assert.equal(chain[0].logicalModelId, SMEJJ_MODELL_ID);
    assert.equal(chain[0].baseUrl, "https://smejj1.test/v1");
    assert.equal(chain[0].apiKeyHeader, "Salad-Api-Key");
    assert.ok(chain.some((b) => b.logicalModelId === "glm-5-2"), "GLM bleibt Rueckfall");
    setzeSmejjRegister(haengeUm(leeresRegister(T), { version: "smejj-1-1", note: 0.61, referenzNote: 100 }, { jetztIso: T }));
    assert.equal(resolveModelRequest("default", "", env).chain[0].logicalModelId, "glm-5-2", "stable ohne Live-Tauglichkeit uebernimmt nicht");
  } finally { setzeSmejjRegister(null); }
});
