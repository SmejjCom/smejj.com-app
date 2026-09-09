// smejj.com — "Auto" waehlt wirklich aus, statt still das Standardmodell zu nehmen.
//
// Betreiber-Auftrag 2026-09-10: "Auto soll automatisch das geeignetste
// verfuegbare Modell fuer die jeweilige Aufgabe auswaehlen. Beruecksichtige:
// Aufgabe, Chat, Coding, Reasoning, Geschwindigkeit, Kontextgroesse,
// verfuegbare Ressourcen, API-Gesundheit, Kosten, lokale Modelle, kostenlose
// Modelle, eigene smejj-Modelle, Fallback-Moeglichkeiten. Wenn ein Modell oder
// eine API ausfaellt, automatisch auf eine geeignete Alternative wechseln."
//
// WAS VORHER DA WAR: zwei if-Zeilen (Coding -> Kimi, Fast -> smejj-fast-1) und
// ein Schalter, der per Vorgabe AUS stand. "auto" kam an, wurde erkannt — und
// nahm dann das Standardmodell. Das sah funktionierend aus und war keines.
import assert from "node:assert/strict";
import test from "node:test";
import { bewerteFuerAuto, MODEL_REGISTRY, resolveModelSelection } from "../src/shared/modelRegistry.js";

// Vollstaendige Umgebungen — ein Modell gilt nur als Kandidat, wenn Schluessel
// UND Adresse UND Modellname stehen (fail-closed, siehe getModelRuntimeConfig).
const GLM = { SMEJJ_LLM_ZHIPU_API_KEY: "x" };
const KIMI = { SMEJJ_KIMI_K2_7_ENABLED: "1", SMEJJ_LLM_KIMI_API_KEY: "y", SMEJJ_LLM_KIMI_BASE_URL: "https://api.moonshot.ai/v1" };
const FAST = { SMEJJ_FAST_1_ENABLED: "1", SMEJJ_LLM_FAST_API_KEY: "z", SMEJJ_LLM_FAST_BASE_URL: "https://fast.example/v1" };
const HAUS = { SMEJJ_1_ENABLED: "1", SMEJJ_LLM_SMEJJ1_API_KEY: "h" };

const waehle = (profile, env, health = null) =>
  resolveModelSelection({ requestedModel: "auto", profile, env, health });

test("Auto ist per Vorgabe AN — sonst waehlt es nichts", () => {
  const w = waehle("fast", { ...GLM });
  assert.equal(w.autoEnabled, true);
  assert.equal(w.reason, "auto_profile_selection", "nicht 'auto_disabled_default_used'");
  // Der Notschalter bleibt: ohne ihn koennte man Auto nur per Deploy abstellen.
  assert.equal(waehle("fast", { ...GLM, SMEJJ_MODEL_AUTO_ENABLED: "0" }).autoEnabled, false);
});

test("das eigene Hausmodell gewinnt bei kurzen Fragen — das ist das Projektziel", () => {
  // Kostenklasse "eigen" + Tempo schlagen ein fremdes Modell auf Gratis-Kontingent.
  assert.equal(waehle("fast", { ...GLM, ...HAUS }).selectedModelId, "smejj-1");
});

test("aber NICHT beim Programmieren — 4.096 Tokens tragen keine Codeaufgabe", () => {
  // Der wichtigste Punkt der ganzen Bewertung: Eignung ist ein Ausschluss,
  // kein Abzug. Ein zu kleines Kontextfenster spart kein Geld, es schneidet
  // den Auftrag ab. Qualitaet geht vor Kosten.
  assert.equal(waehle("coding", { ...GLM, ...HAUS }).selectedModelId, "glm-5-2");
  assert.equal(bewerteFuerAuto(MODEL_REGISTRY["smejj-1"], "coding", { ...GLM, ...HAUS }), null);
  assert.equal(bewerteFuerAuto(MODEL_REGISTRY["smejj-fast-1"], "coding", { ...GLM, ...FAST }), null,
    "32.768 Tokens reichen fuer Coding mit mehreren Dateien auch nicht");
});

test("kostenlos schlaegt Guthaben, wenn beide die Aufgabe tragen", () => {
  // GLM laeuft auf dem Gratis-Kontingent des Anbieters (Umstellung 07.09.),
  // Kimi K2.7 zieht echtes Guthaben. Beide koennen Coding, beide haben genug
  // Kontext — dann entscheidet der Preis.
  const w = waehle("coding", { ...GLM, ...KIMI });
  assert.equal(w.selectedModelId, "glm-5-2");
  assert.ok(w.candidateIds.includes("kimi-k2-7"), "Kimi bleibt als Ersatz in der Kette");
});

test("faellt das Gewaehlte aus, rueckt das naechste nach", () => {
  const env = { ...GLM, ...KIMI };
  const gesund = waehle("coding", env);
  const krank = waehle("coding", env, { "glm-5-2": { available: false } });
  assert.equal(gesund.selectedModelId, "glm-5-2");
  assert.equal(krank.selectedModelId, "kimi-k2-7", "bei Ausfall wechselt Auto von selbst");
  assert.equal(krank.candidateIds[krank.candidateIds.length - 1], "glm-5-2", "das kranke rutscht ans Ende");
});

test("ohne einen einzigen laufenden Kandidaten bleibt Auto beim Standard — keine Sackgasse", () => {
  // Genau daran ist der alte Auto-Weg gescheitert: ohne fremden Schluessel gab
  // es eine Fehlermeldung statt einer Antwort (Betreiber-Screenshots 07.09.).
  const w = waehle("fast", {});
  assert.ok(w.selectedModelId, "es muss immer ein Modell herauskommen");
  assert.equal(w.selectedModelId, "glm-5-2");
});

test("fail-closed: ein Modell ohne Schluessel oder Adresse ist kein Kandidat", () => {
  const ohneAdresse = { ...GLM, SMEJJ_FAST_1_ENABLED: "1", SMEJJ_LLM_FAST_API_KEY: "z" };
  assert.equal(bewerteFuerAuto(MODEL_REGISTRY["smejj-fast-1"], "fast", ohneAdresse), null,
    "Schluessel allein genuegt nicht — ohne Adresse laeuft nichts");
  const ausgeschaltet = { ...GLM, ...FAST, SMEJJ_FAST_1_ENABLED: "0" };
  assert.equal(bewerteFuerAuto(MODEL_REGISTRY["smejj-fast-1"], "fast", ausgeschaltet), null);
});

test("jedes Modell traegt die Angaben, die die Bewertung braucht", () => {
  // Ohne diese Probe faellt ein neu eingetragenes Modell still durch: es
  // bekaeme 0 Zusatzpunkte und stuende immer hinten, ohne dass etwas rot wird.
  for (const model of Object.values(MODEL_REGISTRY)) {
    if (model.id === "auto") continue;
    assert.ok(model.auswahl, `${model.id} hat keinen auswahl-Block`);
    assert.ok(["eigen", "gratis", "guthaben"].includes(model.auswahl.kostenklasse),
      `${model.id}: unbekannte Kostenklasse ${model.auswahl.kostenklasse}`);
    assert.ok(Number(model.auswahl.tempo) >= 1 && Number(model.auswahl.tempo) <= 10,
      `${model.id}: Tempo ausserhalb 1..10`);
  }
});

test("die smejj-Stufen gelten als Markenname, nicht als Anbieterwahl", () => {
  // "smejj 1.2" heisst "das Modell der Plattform in dieser Denkstufe" — die
  // Stufe steuert die Spur, nicht den Anbieter. Stand nur "smejj 1.0" in den
  // Markennamen, wurde 1.1 bis 1.3 als unbekanntes Modell behandelt.
  for (const name of ["smejj 1.0", "smejj 1.1", "smejj 1.2", "smejj 1.3"]) {
    const w = resolveModelSelection({ requestedModel: name, env: { ...GLM } });
    assert.notEqual(w.reason, "requested_model_inactive", `${name} wurde als Anbieterwahl missverstanden`);
    assert.ok(w.selectedModelId, `${name} liefert kein Modell`);
  }
});
