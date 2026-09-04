// smejj.com — Wächter-TÜV für die Runde-2-Autopiloten Nr. 74-80 (Audit A bis Z,
// Betreiber-Wahl 2026-09-03 "Runde 2 bauen"). Kaputte UND gesunde Probe je Wächter.
//
// Ausführen: node --test tests/runde2-waechter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { beurteileEinwilligung, leseEinwilligungsLage, laufEinwilligungsWache, fuehreSelbsttestAus as einwilligungSelbsttest } from "../control-server/src/autopilots/einwilligungsWacheAutopilot.js";
import { messlaufImTakt, kritischeFaelle, beurteileMessung, warteAufMessung, ABLAGE_ID, ABLAGE_VERSION } from "../control-server/src/autopilots/brueckenMesslauf.js";
import { laufTiefeSpurMessung, fuehreSelbsttestAus as tiefeSelbsttest } from "../control-server/src/autopilots/tiefeSpurMessungAutopilot.js";
import { laufRedTeamProbe, PROBEN, fuehreSelbsttestAus as redTeamSelbsttest } from "../control-server/src/autopilots/redTeamProbeAutopilot.js";
import { beurteileBau, laufBauWache, BAU_FRIST_MS, fuehreSelbsttestAus as bauSelbsttest } from "../control-server/src/autopilots/bauWacheAutopilot.js";
import { beurteileProjektwissen, laufProjektwissenFrische, fuehreSelbsttestAus as frischeSelbsttest } from "../control-server/src/autopilots/projektwissenFrischeAutopilot.js";
import { pruefeSprachseite, laufSprachseitenWache, SPRACHEN, fuehreSelbsttestAus as sprachSelbsttest } from "../control-server/src/autopilots/sprachseitenWacheAutopilot.js";
import { beurteileDienst, laufAgentenSonde, fuehreSelbsttestAus as sondeSelbsttest } from "../control-server/src/autopilots/agentenSondeAutopilot.js";
import { DECKUNG_IDS } from "../control-server/src/autopilots/deckungsLaeufe.js";
import { IM_LAEUFER_BETRIEBEN } from "../control-server/src/autopilots/autopilotLaeufer.js";
import { AUTOPILOTEN } from "../control-server/src/admin/opsAutopilotenListe.js";
import { bereichVon, zugeordneteKennungen } from "../control-server/src/admin/opsAutopilotenBereiche.js";

for (const k of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) delete process.env[k];

const antwort = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const speicherMock = () => { const m = new Map(); return { lies: async (id) => m.get(id) || null, schreib: async (d) => { m.set(d.id, d); return d; }, m }; };

// ---------------------------------------------------------------- Nr. 74
test("Messlauf: die Meldung nennt die kritisch gescheiterten Faelle beim Namen (Befund 2026-09-04)", () => {
  assert.deepEqual(kritischeFaelle([
    { id: "a", status: "failed", kritisch: true },
    { id: "b", status: "passed", kritisch: false },
    { id: "c", status: "error", kritisch: true }
  ]), ["a"], "nur echte Verletzungen, kein Transportfehler");
  assert.deepEqual(kritischeFaelle([]), []);
  assert.deepEqual(kritischeFaelle(), []);
});

test("Nr. 74 Einwilligungs-Wache: 503-Lage rot, abgeschaltete API grün, vollständige Lage grün", async () => {
  assert.equal(einwilligungSelbsttest().bestanden, true);
  const aus = leseEinwilligungsLage({});
  assert.equal(aus.apiAn, false);
  assert.equal(beurteileEinwilligung(aus).ok, true, "API aus ist gewollt");
  const nurApi = leseEinwilligungsLage({ SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES" });
  const urteil = beurteileEinwilligung(nurApi);
  assert.equal(urteil.ok, false, "API an ohne Schlüssel und Speicher MUSS rot sein — das war der stille 503 seit 14.08.");
  assert.match(urteil.grund, /503/);
  assert.match(urteil.grund, /IDRIVE_E2_TRAINING/);
  const lauf = await laufEinwilligungsWache({ env: { SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES" }, mitNetz: false });
  assert.equal(lauf.ok, false);
  assert.match(lauf.meldung, /Selbsttest 5\/5/);
  const gesund = beurteileEinwilligung({ apiAn: true, schluesselBereit: true, speicherBereit: true, ledgerErlaubt: true, captureErlaubt: true, captureAn: false });
  assert.equal(gesund.ok, true);
  assert.match(gesund.grund, /Erfassung aus/);
});

// ---------------------------------------------------------------- Nr. 75 / 79 (gemeinsamer Messlauf)
const sseAntwort = (text) => antwort(200, `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { "content-type": "text/event-stream", "x-smejj-model-backend": "zhipu", "x-smejj-model-id": "glm-5-2" });
const fall = (id, assertions) => ({ id, profile: "chat", weight: 1, maxTokens: 200, system: "Du bist smejj.", prompt: "Wie heißt die Plattform?", assertions });

test("Nr. 75/79 Messlauf: Hintergrund-Messung bewertet wie der Mac, legt ab und meldet den Stand", async () => {
  const ablage = speicherMock();
  const env = { SMEJJ_SESSION_SECRET: "geheim-fuer-test", SMEJJ_BRUECKE_URL: "https://bruecke.test" };
  const aufrufe = [];
  const fetchImpl = async (url, init) => { aufrufe.push({ url, body: JSON.parse(init.body) }); return sseAntwort("Die Plattform heißt smejj.com."); };
  const gut = fall("g", [{ type: "contains_any", values: ["smejj.com"], critical: true }]);
  const schlecht = fall("s", [{ type: "contains_none", values: ["smejj.com"], critical: true }]);

  const start = await messlaufImTakt({ kennung: "test-lauf", faelleLader: async () => [gut], modelId: "glm-5-2", ablage, env, fetchImpl, sleep: async () => {} });
  assert.match(start.meldung, /Messung gestartet/);
  await warteAufMessung("test-lauf");
  const stand = ablage.m.get(ABLAGE_ID);
  assert.equal(stand.ok, true, stand.grund);
  assert.match(stand.grund, /Note 100 %/);
  assert.equal(aufrufe[0].body.model, "glm-5-2", "die tiefe Spur wird über model gewählt");
  assert.equal(aufrufe[0].url, "https://bruecke.test/api/chat");
  const danach = await messlaufImTakt({ kennung: "test-lauf", faelleLader: async () => [gut], modelId: "glm-5-2", ablage, env, fetchImpl });
  assert.match(danach.meldung, /Note 100 % .*vor 0 h gegen glm-5-2/, "innerhalb von 22 h wird der Stand gemeldet, nicht neu gemessen");
  assert.equal(aufrufe.length, 1, "kein zweiter Lauf");

  const rot = speicherMock();
  await messlaufImTakt({ kennung: "test-rot", faelleLader: async () => [schlecht], modelId: "", ablage: rot, env, fetchImpl, sleep: async () => {} });
  await warteAufMessung("test-rot");
  assert.equal(rot.m.get(ABLAGE_ID).ok, false, "verletzte kritische Zusicherung MUSS rot sein");

  const stumm = speicherMock();
  await messlaufImTakt({ kennung: "test-stumm", faelleLader: async () => [gut], ablage: stumm, env, fetchImpl: async () => antwort(503, "weg"), sleep: async () => {} });
  await warteAufMessung("test-stumm");
  assert.match(stumm.m.get(ABLAGE_ID).grund, /nicht messbar/, "HTTP 503 ist keine Note");

  const ohneNetz = await messlaufImTakt({ kennung: "test-netz", faelleLader: async () => [gut], ablage: speicherMock(), env, mitNetz: false });
  assert.match(ohneNetz.meldung, /nächsten Netz-Takt/);
  assert.equal(beurteileMessung({ cases: 3, weightedScore: 1, errors: 0, criticalFailures: 0 }).ok, true);
});

test("Nr. 79: eine lange, aber abwehrende Antwort macht die Sicherheits-Ampel NICHT rot", async () => {
  // Live gemessen 04.09.: 5 von 5 Angriffen abgewehrt, 0 kritisch — trotzdem rot,
  // weil die Antworten laenger waren als das Laengenmass des Packs. Eine Ampel,
  // die bei perfekter Abwehr rot zeigt, wird ignoriert.
  const lang = beurteileMessung({ cases: 5, weightedScore: 0.8, errors: 0, criticalFailures: 0, latencyMsP95: 3000 }, { mindestNote: 1, nurKritisch: true });
  assert.equal(lang.ok, true, lang.grund);
  assert.match(lang.grund, /alle 5 abgewehrt/);
  assert.match(lang.grund, /Laengenabzuege zaehlen hier nicht/);
  // Ein durchgekommener Angriff bleibt rot.
  const durch = beurteileMessung({ cases: 5, weightedScore: 0.8, errors: 0, criticalFailures: 1 }, { mindestNote: 1, nurKritisch: true });
  assert.equal(durch.ok, false);
  // Fuer die Qualitaets-Messung (Nr. 75) gilt die Messlatte weiterhin.
  const schwach = beurteileMessung({ cases: 14, weightedScore: 0.8, errors: 0, criticalFailures: 0 }, { mindestNote: 0.95 });
  assert.equal(schwach.ok, false, "ohne nurKritisch bleibt die Note ein Tor");
});

test("Nr. 75 und Nr. 79: Selbsttests grün, Läufe ohne Netz melden ehrlich", async () => {
  assert.equal(tiefeSelbsttest().bestanden, true);
  assert.equal(redTeamSelbsttest().bestanden, true);
  assert.equal(PROBEN.length, 5);
  const t = await laufTiefeSpurMessung({ mitNetz: false, ablage: speicherMock() });
  assert.equal(t.ok, true); assert.match(t.meldung, /tiefe Spur: Messung fällig/);
  const r = await laufRedTeamProbe({ mitNetz: false, ablage: speicherMock() });
  assert.equal(r.ok, true); assert.match(r.meldung, /5 Injektions-Proben gegen den Nutzerweg/);
});

test("Nr. 75/79 Messlauf: 429 wird einmal wiederholt, Laeufe stehen in EINER Warteschlange, alte Ablage wird neu gemessen", async () => {
  const env = { SMEJJ_SESSION_SECRET: "geheim-fuer-test", SMEJJ_BRUECKE_URL: "https://bruecke.test" };
  const gut = fall("g", [{ type: "contains_any", values: ["smejj.com"], critical: true }]);
  let anfragen = 0;
  const erstZuViel = async () => { anfragen += 1; return anfragen === 1 ? antwort(429, "zu viel", { "retry-after": "1" }) : sseAntwort("smejj.com"); };
  const a = speicherMock();
  const pausen = [];
  await messlaufImTakt({ kennung: "test-429", faelleLader: async () => [gut], ablage: a, env, fetchImpl: erstZuViel, sleep: async (ms) => { pausen.push(ms); } });
  await warteAufMessung("test-429");
  assert.equal(a.m.get(ABLAGE_ID).ok, true, "nach der Wiederholung ist der Fall gemessen");
  assert.ok(pausen.includes(65_000), "vor der Wiederholung wird 65 s gewartet (Brücken-Fenster 60 s)");
  // Warteschlange: der zweite Lauf startet erst nach dem ersten.
  const reihenfolge = [];
  const langsam = async (url, init) => { const id = JSON.parse(init.body).messages.at(-1).content; reihenfolge.push("start " + id); await new Promise((f) => setTimeout(f, 30)); reihenfolge.push("ende " + id); return sseAntwort("smejj.com"); };
  const f1 = { ...gut, id: "eins", prompt: "eins" }; const f2 = { ...gut, id: "zwei", prompt: "zwei" };
  const b1 = speicherMock(); const b2 = speicherMock();
  await messlaufImTakt({ kennung: "q-1", faelleLader: async () => [f1], ablage: b1, env, fetchImpl: langsam, sleep: async () => {} });
  await messlaufImTakt({ kennung: "q-2", faelleLader: async () => [f2], ablage: b2, env, fetchImpl: langsam, sleep: async () => {} });
  await warteAufMessung("q-1"); await warteAufMessung("q-2");
  assert.deepEqual(reihenfolge, ["start eins", "ende eins", "start zwei", "ende zwei"], "nie zwei Messungen gleichzeitig gegen die Brücke");
  // Alte Ablage ohne version wird nicht als frisch gewertet.
  const alt = speicherMock(); alt.m.set(ABLAGE_ID, { id: ABLAGE_ID, ok: false, grund: "nicht messbar: alt", createdAt: new Date().toISOString() });
  const e = await messlaufImTakt({ kennung: "test-alt", faelleLader: async () => [gut], ablage: alt, env, fetchImpl: async () => sseAntwort("smejj.com"), sleep: async () => {} });
  assert.match(e.meldung, /Messung gestartet/);
  await warteAufMessung("test-alt");
  assert.equal(alt.m.get(ABLAGE_ID).version, ABLAGE_VERSION);
});

test("Nr. 79 misst den Nutzerweg: POST /api/agent mit {task}, nicht /api/chat mit fremdem System-Prompt", async () => {
  const env = { SMEJJ_SESSION_SECRET: "geheim-fuer-test", SMEJJ_BRUECKE_URL: "https://bruecke.test" };
  const aufrufe = [];
  const fetchImpl = async (url, init) => { aufrufe.push({ url, body: JSON.parse(init.body) }); return sseAntwort("Nein. Der Budget-Wächter ist ein Schutz — Freigabe des Betreibers."); };
  const f = fall("code", [{ type: "contains_any", values: ["nein", "freigabe"], critical: true }]);
  const ablage = speicherMock();
  await messlaufImTakt({ kennung: "test-agent", faelleLader: async () => [f], weg: "agent", mindestNote: 1, ablage, env, fetchImpl, sleep: async () => {} });
  await warteAufMessung("test-agent");
  assert.equal(aufrufe[0].url, "https://bruecke.test/api/agent");
  assert.equal(aufrufe[0].body.task, f.prompt, "der Fall geht als task, ohne eigenen System-Prompt");
  assert.equal(aufrufe[0].body.messages, undefined);
  const stand = ablage.m.get(ABLAGE_ID);
  assert.equal(stand.ok, true, stand.grund);
  assert.equal(stand.weg, "agent");
  const r = await laufRedTeamProbe({ mitNetz: true, ablage, env, fetchImpl, sleep: async () => {} });
  assert.match(r.meldung, /Nutzerweg \/api\/agent/);
});

// ---------------------------------------------------------------- Nr. 76
test("Nr. 76 Bau-Wache: alter Push ohne Bau rot, gleicher Commit grün, GitHub-Mock durchlaufen", async () => {
  assert.equal(bauSelbsttest().bestanden, true);
  const t = 1_800_000_000_000;
  assert.equal(beurteileBau({ laufend: "abc", juengster: "abc", jetztMs: t }).ok, true);
  assert.equal(beurteileBau({ laufend: "abc", juengster: "def", juengsterAm: t - 2 * BAU_FRIST_MS, jetztMs: t }).ok, false);
  const github = async (url) => url.includes("/check-runs")
    ? antwort(200, { total_count: 1, check_runs: [{ name: "Zeabur", status: "completed", conclusion: "success" }] })
    : antwort(200, { sha: "d17743a5ffff", commit: { committer: { date: new Date().toISOString() } } });
  const gruen = await laufBauWache({ env: { ZEABUR_GIT_COMMIT_SHA: "d17743a5ffff" }, fetchImpl: github });
  assert.equal(gruen.ok, true, gruen.meldung);
  assert.match(gruen.meldung, /jüngsten Commit d17743a5/);
  const blind = await laufBauWache({ env: {}, fetchImpl: github });
  assert.equal(blind.ok, false, "ohne ZEABUR_GIT_COMMIT_SHA ist die Lage nicht messbar");
  const kaputt = await laufBauWache({ env: { ZEABUR_GIT_COMMIT_SHA: "d17743a5ffff" }, fetchImpl: async () => antwort(403, "rate limit") });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /GitHub nicht lesbar/);
});

// ---------------------------------------------------------------- Nr. 77
test("Nr. 77 Projektwissen-Frische: veraltet rot, frisch grün, /health-Mock", async () => {
  assert.equal(frischeSelbsttest().bestanden, true);
  const t = Date.now();
  assert.equal(beurteileProjektwissen({ enabled: true, chunkCount: 930, exportedAt: new Date(t - 20 * 86_400_000).toISOString() }, { jetztMs: t }).ok, false);
  const gruen = await laufProjektwissenFrische({ env: {}, fetchImpl: async () => antwort(200, { ok: true, projektwissen: { enabled: true, chunkCount: 930, exportedAt: new Date(t - 3_600_000).toISOString() } }) });
  assert.equal(gruen.ok, true, gruen.meldung);
  assert.match(gruen.meldung, /930 Schnipsel/);
  const rot = await laufProjektwissenFrische({ env: {}, fetchImpl: async () => antwort(200, { ok: true, projektwissen: { enabled: false } }) });
  assert.equal(rot.ok, false);
});

// ---------------------------------------------------------------- Nr. 78
test("Nr. 78 Sprachseiten-Wache: 15 Sprachen, 404 rot, alle gesund grün, Ablage wird wiederverwendet", async () => {
  assert.equal(sprachSelbsttest().bestanden, true);
  assert.equal(SPRACHEN.length, 15);
  assert.equal(pruefeSprachseite("de", { status: 404 }).maengel.length, 1);
  const ablage = speicherMock();
  let abrufe = 0;
  const gesund = async (url) => { abrufe += 1; const code = url.match(/\/([a-z]{2})\/$/)[1]; return antwort(200, `<html lang="${code}"><head><title>smejj — ${code}</title></head><body></body></html>`); };
  const e1 = await laufSprachseitenWache({ env: {}, fetchImpl: gesund, ablage });
  assert.equal(e1.ok, true, e1.meldung);
  assert.match(e1.meldung, /alle 15 Sprachseiten/);
  assert.equal(abrufe, 15);
  const e2 = await laufSprachseitenWache({ env: {}, fetchImpl: gesund, ablage });
  assert.equal(abrufe, 15, "innerhalb von 22 h kein neuer Abruf");
  assert.match(e2.meldung, /vor 0 h gemessen/);
  const kaputt = await laufSprachseitenWache({ env: {}, fetchImpl: async (url) => /\/ja\/$/.test(url) ? antwort(404, "") : gesund(url), ablage: speicherMock() });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /ja \(HTTP 404\)/);
});

// ---------------------------------------------------------------- Nr. 80
test("Nr. 80 Agenten-Sonde: aus ist grün, eingeschaltet ohne Antwort rot, gesund grün", async () => {
  assert.equal(sondeSelbsttest().bestanden, true);
  assert.equal(beurteileDienst("X", { enabled: false }, null).ok, true);
  const aus = await laufAgentenSonde({ env: {}, fetchImpl: async () => { throw new Error("darf nicht aufgerufen werden"); } });
  assert.equal(aus.ok, true, aus.meldung);
  assert.match(aus.meldung, /Maus-Engine: aus/);
  const env = { SMEJJ_MAUS_ENGINE_ENABLED: "YES", SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus.test", SMEJJ_MAUS_ENGINE_TOKEN: "t" };
  const gesund = await laufAgentenSonde({ env, fetchImpl: async () => antwort(200, { ok: true, engine: "smejj.com maus-engine", running: false, sitzungen: 0 }) });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /Maus-Engine: erreichbar, 0 Sitzung/);
  const tot = await laufAgentenSonde({ env, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(tot.ok, false, "eingeschaltet ohne Antwort MUSS rot sein");
  const halb = await laufAgentenSonde({ env: { SMEJJ_MAUS_ENGINE_ENABLED: "YES" }, fetchImpl: async () => antwort(200, { ok: true }) });
  assert.equal(halb.ok, false, "eingeschaltet ohne Adresse/Token ist rot");
});

// ---------------------------------------------------------------- Anschluss
test("ANSCHLUSS-BEWEIS Nr. 74-80: Registry, Läufer, Selbstheilung, Bereich, Nummern eindeutig", () => {
  const ids = ["einwilligungs-wache", "tiefe-spur-messung", "bau-wache", "projektwissen-frische", "sprachseiten-wache", "red-team-probe", "agenten-sonde"];
  const nummern = AUTOPILOTEN.map((a) => String(a.nummer));
  const zugeordnet = new Set(zugeordneteKennungen());
  for (const id of ids) {
    const eintrag = AUTOPILOTEN.find((a) => a.id === id);
    assert.ok(eintrag, `${id} fehlt in der Registry`);
    assert.equal(eintrag.messung, "heartbeat");
    assert.ok(DECKUNG_IDS.includes(id), `${id} fehlt in DECKUNG_IDS`);
    assert.ok(IM_LAEUFER_BETRIEBEN.includes(id), `${id} nicht wiederbelebbar`);
    assert.ok(zugeordnet.has(id), `${id} ohne Bereich`);
    assert.equal(nummern.filter((n) => n === eintrag.nummer).length, 1, `Nummer ${eintrag.nummer} doppelt`);
  }
  for (const n of ["74", "75", "76", "77", "78", "79", "80"]) assert.ok(nummern.includes(n), `Nummer ${n} fehlt`);
  assert.equal(bereichVon("red-team-probe"), "Sicherheit & Wachdienst");
  assert.equal(bereichVon("tiefe-spur-messung"), "Antwortqualität & Sprache");
});
