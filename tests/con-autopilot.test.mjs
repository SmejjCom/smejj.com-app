// con-Autopilot — Einheitstests (ohne Netz, ohne GPU): Bewertung, Vergleich, Register, Budget, Buendel, Rollback.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bewerteAntworten, bewerteLauf, extrahiereCode, fuehreCodeTestsAus, schwaechsteKategorie, vergleiche } from "../workers/con-autopilot/bewertung.js";
import { naechsteVersion, parseVersion, promote, reject, trageKandidatEin, STATUS } from "../workers/con-autopilot/registry.js";
import { darfStarten, teuersterPreisProStunde, STANDARD_GPU_KLASSEN } from "../workers/con-autopilot/budget.js";
import { baueBuendel } from "../workers/con-autopilot/tarball.js";
import { pruefeRollback } from "../workers/con-autopilot/canary.js";
import { gruppenPayload, jobUmgebung } from "../workers/con-autopilot/salad.js";
import { ladeSuiten } from "../workers/con-autopilot/kreislauf.js";
import { validateEvalSuite } from "../src/evaluation/evalSuite.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("code_tests: bestandener, gefallener und haengender Code", () => {
  assert.equal(fuehreCodeTestsAus("function summe(a){return a.reduce((s,x)=>s+x,0)}", "assert.strictEqual(summe([1,2]),3)").ok, true);
  const falsch = fuehreCodeTestsAus("function summe(a){return 0}", "assert.strictEqual(summe([1,2]),3)");
  assert.equal(falsch.ok, false);
  const haengt = fuehreCodeTestsAus("while(true){}", "assert.ok(true)", { zeitgrenzeMs: 800 });
  assert.equal(haengt.ok, false);
  assert.equal(haengt.grund, "zeitgrenze");
  assert.equal(fuehreCodeTestsAus("", "assert.ok(true)").grund, "kein_code");
});

test("extrahiereCode nimmt den ersten js-Zaun", () => {
  assert.equal(extrahiereCode("Hier:\n```js\nconst a = 1;\n```\nund ```py\nx=1\n```").trim(), "const a = 1;");
  assert.equal(extrahiereCode("keine Funktion hier"), "");
});

test("bewerteLauf: kritische Verletzung setzt auf 0, sonst Anteil", () => {
  const fall = { assertions: [{ type: "contains_all", values: ["ok"], critical: true }, { type: "max_length", value: 5 }] };
  assert.deepEqual(bewerteLauf(fall, { text: "ok, aber zu lang" }).score, 0.5);
  assert.equal(bewerteLauf(fall, { text: "nein" }).score, 0);
  assert.equal(bewerteLauf(fall, { text: "nein" }).kritischVerletzt, true);
  assert.equal(bewerteLauf(fall, { text: "", error: "timeout" }).score, 0);
});

test("alle con-Suiten sind gueltig (Schema wie evals/suites, plus code_tests) und haben passende Hashes", async () => {
  const suiten = await ladeSuiten(path.join(ROOT, "workers/con-autopilot/suites"));
  assert.ok(suiten.length >= 6);
  for (const s of suiten) {
    const ohneCode = structuredClone(s);
    for (const c of ohneCode.cases) c.assertions = c.assertions.map((a) => (a.type === "code_tests" ? { type: "min_length", value: 1 } : a));
    const v = validateEvalSuite(ohneCode);
    assert.deepEqual(v.reasons.filter((r) => r !== "eval_suite_integrity_mismatch" && r !== "eval_suite_content_sha256_mismatch"), [], `${s.suiteId}: ${v.reasons.join(",")}`);
    assert.equal(s.eligibleForTraining, false);
    assert.match(s.integrity.contentSha256, /^[a-f0-9]{64}$/);
    for (const c of s.cases) for (const a of c.assertions) if (a.pattern) assert.doesNotMatch(a.pattern, /^\(\?i\)/, `${s.suiteId}/${c.id}: (?i) ist in JavaScript ungueltig`);
  }
});

test("bewerteAntworten: Kategorien, kritische Zaehlung, Suite-Abweichung als Warnung", async () => {
  const suiten = await ladeSuiten(path.join(ROOT, "workers/con-autopilot/suites"));
  const sprache = suiten.find((s) => s.suiteId === "con-sprache");
  const antworten = { version: "t", jobId: "j", leistung: { antworten: 2, tokensProSekunde: 10 }, suiten: [{ suiteId: "con-sprache", contentSha256: "abweichend", cases: [
    { id: "fakt-hauptstadt", runs: [{ text: "Canberra", latencyMs: 100 }] },
    { id: "struktur-json", runs: [{ text: "{\"name\":\"Anna Beispiel\",\"alter\":34,\"sprachen\":[\"Deutsch\",\"Englisch\"]}", latencyMs: 200 }] }
  ] }] };
  const b = bewerteAntworten(antworten, suiten);
  assert.equal(b.faelle, 2);
  assert.equal(b.kritisch, 0);
  assert.equal(b.kategorien.sprache.score, 1);
  assert.ok(b.warnungen.includes("suite_stand_abweichend:con-sprache"));
  assert.equal(schwaechsteKategorie(b).kategorie, "sprache");
  assert.ok(sprache);
});

test("vergleiche: erste Messlatte, Vorsprung, Regression, Sicherheit", () => {
  const basis = { gesamt: 0.80, kritisch: 2, kategorien: { sprache: { score: 0.9, kritisch: 0 }, sicherheit: { score: 0.8, kritisch: 1 } } };
  assert.equal(vergleiche(basis, null).entscheidung, "PROMOTE");
  assert.equal(vergleiche({ ...basis, gesamt: 0.84 }, basis).entscheidung, "PROMOTE");
  assert.equal(vergleiche({ ...basis, gesamt: 0.81 }, basis).entscheidung, "REJECT"); // unter Rauschschwelle
  const regress = { gesamt: 0.9, kritisch: 2, kategorien: { sprache: { score: 0.5, kritisch: 0 }, sicherheit: { score: 0.8, kritisch: 1 } } };
  assert.equal(vergleiche(regress, basis).entscheidung, "REJECT");
  assert.ok(vergleiche(regress, basis).gruende.some((g) => g.startsWith("regression:sprache")));
  const unsicher = { gesamt: 0.95, kritisch: 3, kategorien: { sprache: { score: 1, kritisch: 0 }, sicherheit: { score: 0.7, kritisch: 3 } } };
  assert.equal(vergleiche(unsicher, basis).entscheidung, "REJECT");
  assert.equal(vergleiche({ gesamt: 0.9, kritisch: 1, kategorien: { sicherheit: { score: 0.5, kritisch: 1 } } }, null).entscheidung, "PROMOTE");
});

test("registry: Versionsregel und promote nur mit PROMOTE-Urteil", () => {
  assert.deepEqual(parseVersion("con-1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.equal(naechsteVersion(null, {}), "con-1.0.0");
  const stabil = { version: "con-1.0.0", basisPrefix: "con/base/a" };
  assert.equal(naechsteVersion(stabil, { basisPrefix: "con/base/a", art: "minor" }), "con-1.1.0");
  assert.equal(naechsteVersion(stabil, { basisPrefix: "con/base/a", art: "patch" }), "con-1.0.1");
  assert.equal(naechsteVersion(stabil, { basisPrefix: "con/base/b", art: "minor" }), "con-2.0.0");
  const reg = { versions: [{ version: "con-1.0.0", status: STATUS.STABLE }] };
  trageKandidatEin(reg, { version: "con-1.1.0" });
  assert.throws(() => promote(reg, "con-1.1.0", { entscheidung: "REJECT" }, null));
  promote(reg, "con-1.1.0", { entscheidung: "PROMOTE", gruende: [] }, { gesamt: 0.9, kritisch: 0, faelle: 1, kategorien: {}, leistung: {}, faelleDetail: [] });
  assert.equal(reg.versions.find((v) => v.version === "con-1.0.0").status, STATUS.SUPERSEDED);
  assert.equal(reg.versions.find((v) => v.version === "con-1.1.0").status, STATUS.STABLE);
  trageKandidatEin(reg, { version: "con-1.2.0" });
  reject(reg, "con-1.2.0", { entscheidung: "REJECT", gruende: ["x"] }, null);
  assert.equal(reg.versions.find((v) => v.version === "con-1.2.0").status, STATUS.REJECTED);
});

test("budget: ohne Freigabe nie, Tages- und Gesamtdeckel greifen", () => {
  const grenzen = { tagesbudgetUsd: 5.5, gesamtdeckelUsd: 2, jobMaxMinuten: 170, notaus: false, freigabe: true };
  const ok = darfStarten({ grenzen, tagesbuch: { summeUsd: 0 }, gesamt: { summeUsd: 0 }, gpuKlassen: STANDARD_GPU_KLASSEN, prioritaet: "medium", minuten: 170 });
  assert.equal(ok.ok, true);
  assert.equal(ok.preisProStunde, 0.253);
  assert.ok(ok.geplantUsd < 0.8);
  assert.equal(darfStarten({ grenzen: { ...grenzen, freigabe: false }, tagesbuch: { summeUsd: 0 }, gesamt: { summeUsd: 0 }, gpuKlassen: STANDARD_GPU_KLASSEN, prioritaet: "medium", minuten: 60 }).ok, false);
  assert.equal(darfStarten({ grenzen, tagesbuch: { summeUsd: 5.4 }, gesamt: { summeUsd: 0 }, gpuKlassen: STANDARD_GPU_KLASSEN, prioritaet: "medium", minuten: 60 }).ok, false);
  assert.equal(darfStarten({ grenzen, tagesbuch: { summeUsd: 0 }, gesamt: { summeUsd: 1.9 }, gpuKlassen: STANDARD_GPU_KLASSEN, prioritaet: "medium", minuten: 60 }).ok, false);
  assert.equal(darfStarten({ grenzen: { ...grenzen, notaus: true }, tagesbuch: { summeUsd: 0 }, gesamt: { summeUsd: 0 }, gpuKlassen: STANDARD_GPU_KLASSEN, prioritaet: "medium", minuten: 60 }).ok, false);
  assert.equal(teuersterPreisProStunde(["unbekannt"], "medium"), 0);
});

test("tarball: Buendel enthaelt alle Job-Dateien und ist gueltiges gzip", () => {
  const b = baueBuendel(path.join(ROOT, "workers/con-autopilot/salad-job"));
  assert.ok(b.dateien.includes("job.py") && b.dateien.includes("suites/con-sicherheit-v1.json"));
  assert.ok(b.bytes > 1000 && b.bytes < 400_000);
  assert.equal(Buffer.from(b.b64, "base64")[0], 0x1f);
});

test("salad: Gruppe ohne Autostart, restart never, Zeitgrenze und Selbststopp in der Umgebung", () => {
  const konfig = { gruppe: "con-job", image: "img", vcpu: 8, ramMb: 30720, gpuKlassen: ["a"], speicherGb: 150, prioritaet: "medium" };
  const p = gruppenPayload(konfig);
  assert.equal(p.autostart_policy, false);
  assert.equal(p.restart_policy, "never");
  assert.equal(p.startup_probe.http.path, "/health");
  const env = jobUmgebung({ konfig: { basis: { repo: "r", prefix: "p" } }, e2: { endpoint: "e", region: "x", bucket: "b", accessKey: "k", secretKey: "s" }, salad: { organisation: "o", projekt: "p", gruppe: "g", apiKey: "sk" }, jobId: "j1", modus: "messung", parameter: { CON_VERSION: "con-1.0.0", LEER: null }, buendelB64: "AAAA", maxMinuten: 160 });
  assert.equal(env.CON_JOB_MAX_MINUTEN, "160");
  assert.equal(env.CON_SELBST_STOP, "YES");
  assert.equal(env.SALAD_CONTAINER_GROUP_NAME, "g");
  assert.ok(!("LEER" in env));
});

test("canary: Rollback-Regeln", () => {
  assert.equal(pruefeRollback(null).noetig, false);
  assert.equal(pruefeRollback({ antworten: 5, fehlerrate: 0.9 }).noetig, false); // zu wenige Antworten
  assert.equal(pruefeRollback({ antworten: 50, fehlerrate: 0.2 }).noetig, true);
  assert.equal(pruefeRollback({ antworten: 50, fehlerrate: 0.01, sicherheitsvorfaelle: 1 }).noetig, true);
  assert.equal(pruefeRollback({ antworten: 50, fehlerrate: 0.01, abstuerze: 3 }).noetig, true);
  assert.equal(pruefeRollback({ antworten: 50, fehlerrate: 0.01 }).noetig, false);
});
