// smejj.com — Master-Audit 2026-09-15: Selbsttests, die nie scheitern konnten.
// Kaputte UND gesunde Probe je reparierter Pruefung.
import test from "node:test";
import assert from "node:assert/strict";

import * as S from "./autopilotSelbsttests.js";
import { distillOptimalReasoning } from "./knowledgeDistillerAutopilot.js";
import { processRealtimePairFrame } from "./realtimeVoicePairAutopilot.js";

test("Baustein-Kennzeichnung: die Meldung sagt selbst, dass keine Live-Wirkung gemessen wurde", () => {
  const e = S.alsBaustein(() => ({ ok: true, meldung: "Destillation: 3/3 Pruefungen bestanden" }))();
  assert.equal(e.ok, true);
  assert.ok(e.meldung.startsWith(S.BAUSTEIN_PRAEFIX));
  assert.match(e.meldung, /3\/3 Pruefungen bestanden$/);
  const rot = S.alsBaustein(() => ({ ok: false, meldung: "kaputt" }))();
  assert.equal(rot.ok, false, "die Kennzeichnung aendert nie das Urteil");
});

test("Nr. 21 Knowledge-Distiller: Selbsttest prueft das echte Urteil (isSound), nicht nur 'ein Objekt kam'", () => {
  assert.equal(S.laufKnowledgeDistiller().ok, true);
  // Die alte Probe (Feld `solution`) haette das Modul nie belohnt:
  assert.equal(distillOptimalReasoning("x", [{ model: "a", solution: "Die Summe ist 55." }]).isSound, false);
});

test("Nr. 27 Voice-Pair: Selbsttest unterscheidet Audio von Stille", () => {
  assert.equal(S.laufVoicePair().ok, true);
  assert.match(processRealtimePairFrame({ audio: "AAAA" }).contextSummary, /Stumm/, "das alte Feld `audio` kam nie an");
  assert.match(processRealtimePairFrame({ audioChunkBase64: "AAAA" }).contextSummary, /Audio-Eingabe aktiv/);
});

test("Nr. 22 Mutationstest: Selbsttest verlangt angewandte Mutationen", () => {
  assert.equal(S.laufEvolutionaryMutation().ok, true);
});

// --- Runde 3 (15.09.): vier Bausteine arbeiten an echten Daten — je kaputte UND gesunde Probe ---
import * as E from "./bausteinEchtLaeufe.js";
import { antwortAuszug } from "./brueckenMesslauf.js";
import { detectRepetitiveLoop } from "./selfHealingAutopilot.js";
import { WIRKUNG, wirkungVon, BAUSTEIN_GRUND } from "../admin/autopilotWirkung.js";

const speicher = (daten) => (praefix) => ({
  lies: async (id) => daten[`${praefix}/${id}`] ?? null,
  liste: async () => daten[praefix] ?? { ok: true, datensaetze: [] },
  schreib: async (d) => { daten[`${praefix}/${d.id}`] = d; return d; }
});

test("Nr. 16 Weichensteller: die ECHTE Kernsuite und der ECHTE Router, rot ohne Modell", () => {
  const faelle = E.ladeSuiteFaelle();
  assert.ok(faelle.length >= 10, "die Kernsuite liefert echte Prompts");
  const kette = { chain: [{ name: "zhipu", model: "glm-5.2" }] };
  const gesund = E.laufSmartRouter({ kette: () => kette });
  assert.equal(gesund.ok, true);
  assert.match(gesund.meldung, new RegExp(`${faelle.length} Kernsuite-Prompts`));
  assert.match(gesund.meldung, /routePrompt\) wird im Produkt nirgends genutzt/);
  // Die echte Live-Konfiguration ohne jeden Schluessel: der Chat haette kein Modell.
  const ohneSchluessel = E.laufSmartRouter({ env: {} });
  assert.equal(ohneSchluessel.ok, false);
  assert.match(ohneSchluessel.meldung, /ohne Modell/);
  assert.equal(E.laufSmartRouter({ klassifiziere: () => "erfunden", kette: () => kette }).ok, false, "unbekanntes Profil ist rot");
  assert.equal(E.laufSmartRouter({ faelleLader: () => { throw new Error("weg"); } }).ok, false, "ohne Suite keine Aussage");
});

test("Nr. 11 Selbstheilung: echte Messlauf-Antworten, rot bei Schleife, gruen bei gesunden", async () => {
  const lang = "Die Antwort erklaert den Weg sauber und vollstaendig. ".repeat(3);
  const gesundeAblage = { "autopiloten/tiefe-spur-messung/letzter-lauf": { createdAt: "2026-09-15T00:00:00Z", faelle: [
    { id: "a", status: "passed", antwort: antwortAuszug(`| a | b | c | d |\n|---|---|---|---|\n${lang}`) },
    { id: "b", status: "failed", beleg: { auszug: lang } },
    { id: "c", status: "error", fehler: "empty_response" }
  ] } };
  const gesund = await E.laufSelfHealing({ storeFabrik: speicher(gesundeAblage), jetztMs: Date.parse("2026-09-15T02:00:00Z") });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /2 echte Antworten .*Nr. 75 vor 2 h/);
  assert.match(gesund.meldung, /1 leere Antwort/);

  const kaputteAblage = { "autopiloten/red-team-probe/letzter-lauf": { createdAt: "2026-09-15T00:00:00Z", faelle: [
    { id: "schleife", status: "passed", antwort: antwortAuszug("Die Antwort erklaert den Weg sauber und vollstaendig. ".repeat(14) + "und nochmal und nochmal und nochmal und nochmal und nochmal") }
  ] } };
  const kaputt = await E.laufSelfHealing({ storeFabrik: speicher(kaputteAblage) });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /79\/schleife: Endlosschleife am Antwortende .*Fehlalarm/);
  assert.equal((await E.laufSelfHealing({ storeFabrik: speicher({}) })).ok, false, "ohne Ablage keine Aussage");
});

test("Erkenner: Markdown-Tabelle und eingerueckter Code sind KEINE Endlosschleife", () => {
  assert.equal(detectRepetitiveLoop("| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | Ende der Tabelle"), false);
  assert.equal(detectRepetitiveLoop("function f() {\n            return 1;\n}\nund noch etwas Text dahinter, lang genug"), false);
  assert.equal(detectRepetitiveLoop("wiederhole dich wiederhole dich wiederhole dich wiederhole dich wiederhole dich"), true);
});

test("Nr. 14 Selbst-Verbesserer: echte DPO-Paare, rot bei untauglichem Paar", async () => {
  const gut = { id: "dpo_1", prompt: "Wie heisst die Plattform?", chosen: "Sie heisst smejj.com und wird immer so geschrieben.", rejected: "ok", context: { source: "user_flywheel_thumbs_up" } };
  const gesund = await E.laufSelfImprovement({ storeFabrik: speicher({ "self-improvement/dpo-dataset": { ok: true, datensaetze: [gut] } }) });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /1 echte DPO-Paare geprueft, alle tauglich; der Bewerter stimmt bei 1\/1/);
  const kaputt = await E.laufSelfImprovement({ storeFabrik: speicher({ "self-improvement/dpo-dataset": { ok: true, datensaetze: [gut, { ...gut, id: "dpo_2", rejected: "" }] } }) });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /1 von 2 .*dpo_2: rejected leer \(Quelle user_flywheel_thumbs_up\)/);
  assert.equal((await E.laufSelfImprovement({ storeFabrik: speicher({ "self-improvement/dpo-dataset": { ok: false, error: "record_store_list_failed" } }) })).ok, false);
  assert.equal(E.dpoMangel({ ...gut, chosen: " ok ", rejected: "ok" }), "chosen gleich rejected");
});

test("Nr. 24 Repo-Architekt: fehlender Importpfad ist rot, Vorlagen und Kommentare zaehlen nicht, Ergebnis wird abgelegt", async () => {
  const dateien = [
    { path: "control-server/src/a.js", content: 'import { b } from "./b.js";\n// import x from "./kommentar.js"\nconst t = `import y from "./vorlage.js"`;\nconst r = /"/g;\nexport { b };' },
    { path: "control-server/src/b.js", content: 'import { a } from "./a.js";\nexport const b = await import("./c.js");' }
  ];
  const daten = {};
  const ablage = speicher(daten)("autopiloten/multi-file-repo-architect");
  const gesund = await E.laufRepoArchitect(dateien, { existiert: (p) => ["control-server/src/a.js", "control-server/src/b.js", "control-server/src/c.js"].includes(p), ablage });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /2 Dateien, 3 relative Importe: alle im Abbild vorhanden; 1 Import-Zyklus\/Zyklen \(z\. B\. a\.js ↔ b\.js\)/);
  assert.equal(daten["autopiloten/multi-file-repo-architect/letzter-lauf"].ok, true);
  const kaputt = await E.laufRepoArchitect(dateien, { existiert: (p) => p !== "control-server/src/c.js", ablage });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /1 Importpfad\(e\) fehlen im Abbild — control-server\/src\/b\.js -> \.\/c\.js/);
  assert.equal(daten["autopiloten/multi-file-repo-architect/letzter-lauf"].fehlend.length, 1);
  assert.equal((await E.laufRepoArchitect([], { ablage })).ok, false);
});

test("Wirkungstabelle: vier Umbauten sind 'teilweise', jeder verbliebene Baustein nennt seinen Grund", () => {
  for (const id of ["smart-router", "self-healing", "self-improvement", "multi-file-repo-architect"]) assert.equal(wirkungVon(id).stufe, "teilweise", id);
  assert.equal(WIRKUNG.baustein.length, 12);
  for (const id of WIRKUNG.baustein) assert.ok(BAUSTEIN_GRUND[id], `${id}: Grund fehlt`);
  assert.deepEqual(Object.keys(BAUSTEIN_GRUND).sort(), [...WIRKUNG.baustein].sort(), "kein Grund ohne Baustein");
});

test("Nr. 11: eine knappe, bestandene Antwort ('1,5 s') ist gesund, eine leere nicht (live 15.09.)", () => {
  assert.equal(E.beurteileEchteAntworten([{ id: "75/budget-lcp-grounding", anfang: "1,5 s", ende: "", bestanden: true }]).ungesund.length, 0);
  assert.equal(E.beurteileEchteAntworten([{ id: "x", anfang: "  ", ende: "", bestanden: true }]).ungesund.length, 1);
  assert.equal(E.beurteileEchteAntworten([{ id: "y", anfang: "ok", ende: "", bestanden: false }]).ungesund.length, 1, "knapp UND durchgefallen bleibt ein Befund");
});
