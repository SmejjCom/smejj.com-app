// smejj.com — Projektwissen (RAG) in der Chat-Bridge.
//
// Diese Datei prueft die drei Stellen, an denen der Umbau vom 2026-08-01 kippen
// koennte, und zwar in aufsteigender Naehe zur Wirklichkeit:
//   1. Das Bridge-Modul selbst (Reihenfolge, Schwelle, fail-closed).
//   2. Den Buendelschritt (er entscheidet, WAS ausgeliefert wird).
//   3. Die gebuendelte Datei im echten Betrieb gegen einen Stub-Upstream —
//      die einzige Pruefung, die belegt, dass der Kontext das Modell erreicht.
//
// Punkt 3 ist der Kern. Die Messung vom 2026-08-01 (88,2 % -> 96,1 %) lief ueber
// den Eval-Harness, der den Block LOKAL baute; die Live-Kette baute ihn nie. Genau
// diese Luecke soll hier nie wieder unbemerkt aufgehen.
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MIN_TOP_SCORE } from "../control-server/src/rag/ragRanking.js";
import { withRagContext } from "../src/evaluation/evalRagContext.js";
import { buildRagIndexArtifact } from "../scripts/rag/export_rag_index_to_idrive.mjs";
import { buildChatBridgeArtifact, bundleModules, splitImports, topLevelNames } from "../scripts/deploy/bundle_chat_bridge.mjs";

process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const rag = await import("../public/chat-bridge-rag.js");

// Geprueft wird gegen den ECHTEN Wissensstand, nicht gegen einen Kunst-Korpus.
// Grund: eine BM25-Punktzahl haengt an Korpusgroesse und Wortverteilung. Ein
// Mini-Korpus erreicht die Produktionsschwelle 20 nie und wuerde die Pruefung
// zwingen, entweder die Schwelle zu senken oder die Punktzahl zu erfinden —
// beides wuerde genau das aufweichen, was hier bewiesen werden soll.
const ARTEFAKT = await buildRagIndexArtifact(process.cwd(), new Date("2026-08-01T00:00:00.000Z"));
const NUTZLAST = gzipSync(Buffer.from(ARTEFAKT.body, "utf8")).toString("base64");

// Zwei Fragen mit am 2026-08-01 gemessener Punktzahl:
const GEDECKT = "Wo speichert smejj.com grosse Dateien, Modelle und Artefakte dauerhaft?"; // 21,9
const FAST_GEDECKT = "Warum wird die Startseite statisch ausgeliefert und nicht vom Control Server gerendert? Antworte in zwei Saetzen."; // 23,1
const UNGEDECKT = "Erzaehl mir einen Witz ueber Katzen.";

test("wissensartefakt wird beim start entpackt und in /health gemeldet", () => {
  const ergebnis = rag.installRagIndex(NUTZLAST);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chunkCount, ARTEFAKT.chunkCount);
  const status = rag.ragIndexStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.exportedAt, "2026-08-01T00:00:00.000Z");
  // /health darf Kennzahlen zeigen, aber niemals Inhalte des Korpus.
  assert.deepEqual(Object.keys(status).sort(), ["chunkCount", "enabled", "exportedAt"]);
});

test("kaputtes artefakt schaltet projektwissen ab, statt die bridge zu brechen", () => {
  assert.equal(rag.installRagIndex("kein-gueltiges-gzip").ok, false);
  assert.equal(rag.ragIndexStatus().enabled, false);
  assert.ok(rag.ragIndexStatus().reason);
  // Entscheidend: der Chatweg laeuft weiter, nur eben ohne Kontext.
  assert.equal(rag.buildRagBlock(GEDECKT), "");
  const messages = [{ role: "user", content: GEDECKT }];
  assert.deepEqual(rag.withRagContext(messages).messages, messages);

  // Ein Artefakt mit fremdem Namen wird ebenfalls abgewiesen (kein Raten).
  const fremd = gzipSync(Buffer.from(JSON.stringify({ artifact: "irgendwas", index: {} }), "utf8")).toString("base64");
  assert.equal(rag.installRagIndex(fremd).ok, false);
});

test("relevanzschwelle bleibt die produktionsschwelle und traegt die entscheidung", () => {
  assert.equal(MIN_TOP_SCORE, 20, "Schwelle 8 wurde live gemessen und brachte KEINEN Gewinn (86,0 % gegen 88,2 % Basis)");
  rag.installRagIndex(NUTZLAST);
  assert.ok(rag.buildRagBlock(GEDECKT).startsWith("Internes Projektwissen"));
  // Ungedeckte Frage: lieber kein Kontext als falscher Kontext.
  assert.equal(rag.buildRagBlock(UNGEDECKT), "");
  assert.equal(rag.buildRagBlock("Wie viele aktive Nutzerkonten hat smejj.com heute?"), "");
  assert.equal(rag.buildRagBlock(""), "");
});

test("kontextblock steht vor der anweisung des aufrufers", () => {
  rag.installRagIndex(NUTZLAST);
  const messages = [
    { role: "system", content: "SCHUTZ" },
    { role: "system", content: "ANWEISUNG" },
    { role: "user", content: GEDECKT }
  ];
  const { messages: angereichert, contextChars } = rag.withRagContext(messages, "", { position: 1 });
  assert.ok(contextChars > 0);
  assert.deepEqual(angereichert.map((m) => m.role), ["system", "system", "system", "user"]);
  assert.equal(angereichert[0].content, "SCHUTZ");
  assert.ok(angereichert[1].content.startsWith("Internes Projektwissen"));
  // Die Anweisung des Aufrufers muss ZULETZT gelten — sonst richtet sich das
  // Modell nach dem Hintergrund statt nach der Anweisung.
  assert.equal(angereichert[2].content, "ANWEISUNG");
  // Die Eingabeliste bleibt unberuehrt (keine versteckte Mutation).
  assert.equal(messages.length, 3);
});

test("gesucht wird zur letzten nutzerfrage, nicht zum gesamten verlauf", () => {
  rag.installRagIndex(NUTZLAST);
  const verlauf = [
    { role: "user", content: UNGEDECKT },
    { role: "assistant", content: "Gern." },
    { role: "user", content: GEDECKT }
  ];
  assert.equal(rag.lastUserContent(verlauf), GEDECKT);
  assert.ok(rag.withRagContext(verlauf).contextChars > 0);
  // Umgekehrte Reihenfolge: die letzte Frage ist ungedeckt, also kein Kontext —
  // sonst wuerde ein alter Gespraechsabschnitt die aktuelle Frage faerben.
  assert.equal(rag.withRagContext([...verlauf].reverse()).contextChars, 0);
});

// Der Vergleich, an dem die ganze Messung haengt: Der Gewinn von 88,2 % auf
// 96,1 % wurde mit `--rag` gemessen, wo der Eval-Harness den Block selbst baut
// und voranstellt. Nach dem Umbau soll ein Lauf OHNE `--rag` denselben Wert
// erreichen, weil die Live-Kette den Block nun selbst traegt. Das gilt aber nur,
// wenn beide Wege denselben Block bauen — sonst vergleicht die Wiederholung zwei
// verschiedene Dinge und meldet den Unterschied als Fortschritt oder Regression.
test("live-kette und messweg bauen denselben kontextblock", async () => {
  rag.installRagIndex(NUTZLAST);
  const suite = JSON.parse(await readFile("evals/suites/smejj-chat-core-v1.json", "utf8"));
  let mitKontext = 0;
  for (const fall of suite.cases) {
    const messweg = await withRagContext(fall, process.cwd());
    const livekette = rag.buildRagBlock(fall.prompt);
    if (messweg.contextChars > 0) {
      mitKontext += 1;
      assert.equal(livekette, messweg.case.system.slice(0, livekette.length), `${fall.id}: Block weicht ab`);
      assert.equal(livekette.length, messweg.contextChars, `${fall.id}: Blocklaenge weicht ab`);
    } else {
      assert.equal(livekette, "", `${fall.id}: Live-Kette baut Kontext, den der Messweg nicht baut`);
    }
  }
  // Nicht jede Frage bekommt Kontext — genau das ist die Regel (gemessen: 16 von 48).
  assert.ok(mitKontext > 0 && mitKontext < suite.cases.length, `${mitKontext} von ${suite.cases.length} Faellen gedeckt`);
});

test("buendler loest relative importe auf und liefert abhaengigkeiten zuerst", async () => {
  const dateien = {
    "a/einstieg.js": 'import { hilf } from "./hilfe.js";\nimport http from "node:http";\nexport const start = () => hilf(http);\n',
    "a/hilfe.js": 'export function hilf(x) { return x; }\n'
  };
  const { builtins, modules } = await bundleModules({ entry: "a/einstieg.js", readSource: async (f) => dateien[f] });
  assert.deepEqual(modules.map((m) => m.path), ["a/hilfe.js", "a/einstieg.js"]);
  assert.deepEqual(builtins, ['import http from "node:http";']);
  assert.equal(modules.every((m) => !/^export\s/m.test(m.code)), true, "export-Schluesselwoerter muessen entfernt sein");
  assert.ok(modules[0].code.includes("function hilf"));
});

test("buendler bricht ab statt zu raten", async () => {
  const faelle = {
    bundle_import_cycle: { "a.js": 'import { b } from "./b.js";\n', "b.js": 'import { a } from "./a.js";\n' },
    bundle_external_dependency: { "a.js": 'import express from "express";\n' },
    bundle_duplicate_symbol: { "a.js": 'import { x } from "./b.js";\nfunction doppelt() {}\n', "b.js": "function doppelt() {}\nexport const x = 1;\n" },
    bundle_default_export_unsupported: { "a.js": "export default function () {}\n" },
    bundle_export_list_unsupported: { "a.js": "const x = 1;\nexport { x };\n" },
    bundle_namespace_import_unsupported: { "a.js": 'import * as alles from "./b.js";\n', "b.js": "const y = 1;\n" }
  };
  for (const [grund, dateien] of Object.entries(faelle)) {
    await assert.rejects(
      () => bundleModules({ entry: "a.js", readSource: async (f) => dateien[f] }),
      (fehler) => fehler.message.startsWith(grund),
      `${grund} muss fail-closed abbrechen`
    );
  }
});

test("buendel der echten bridge enthaelt alle module und das wissensartefakt", async () => {
  const artefakt = await buildChatBridgeArtifact({ projectRoot: process.cwd() });
  assert.ok(artefakt.moduleCount >= 5, "Bridge, Wetter, RAG und die Suchmodule");
  assert.ok(artefakt.chunkCount > 100, "Wissensartefakt muss echte Abschnitte enthalten");
  assert.match(artefakt.version, /^\d{8}-v\d+/);
  // Genau EINE Datei, keine offenen Importe auf Repo-Pfade.
  assert.equal(/^import\s.+from\s+["']\./m.test(artefakt.code), false);
  // Das Wissen wird installiert, BEVOR der Einstieg den Server startet.
  assert.ok(artefakt.code.indexOf("installRagIndex(RAG_INDEX_PAYLOAD)") < artefakt.code.indexOf("createChatBridgeServer().listen"));
});

test("importzerlegung und namenssuche arbeiten zeilengenau", () => {
  const { builtins, relative, body } = splitImports('import http from "node:http";\nimport { a } from "./a.js";\nconst x = 1;\n', "p.js");
  assert.deepEqual(builtins, ['import http from "node:http";']);
  assert.deepEqual(relative, ["./a.js"]);
  assert.equal(body.split("\n").length, 4, "Importzeilen werden zu Leerzeilen, damit Zeilennummern stabil bleiben");
  assert.deepEqual([...topLevelNames("export function f() {}\nconst g = 1;\n  const eingerueckt = 2;\n")], ["f", "g"]);
});

// --- Die eigentliche Pruefung: die ausgelieferte Datei im Betrieb ---------------
//
// Gestartet wird das echte Buendel als eigener Prozess, mit einem Stub anstelle
// von Groq. Geprueft wird, was der Upstream WIRKLICH bekommt — nur das entscheidet,
// ob die Live-Kette den Kontext traegt.

async function freierPort() {
  const platzhalter = http.createServer();
  await new Promise((fertig) => platzhalter.listen(0, "127.0.0.1", fertig));
  const port = platzhalter.address().port;
  await new Promise((fertig) => platzhalter.close(fertig));
  return port;
}

test("gebuendelte bridge reicht projektwissen an das modell durch", async (t) => {
  const artefakt = await buildChatBridgeArtifact({ projectRoot: process.cwd() });
  const datei = path.join(process.cwd(), "tmp", "chat-bridge-bundle", "chat-bridge.pruefung.mjs");
  await mkdir(path.dirname(datei), { recursive: true });
  await writeFile(datei, artefakt.code);

  const gesehen = [];
  const stub = http.createServer((req, res) => {
    let roh = "";
    req.on("data", (stueck) => { roh += stueck; });
    req.on("end", () => {
      // Seit 2026-08-04 fragt die Bruecke vor jeder Modell-Route nach, ob das
      // Token gilt (Anmeldepflicht). Derselbe Stub beantwortet das mit.
      if (req.url === "/api/auth/me") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ authenticated: req.headers.authorization === "Bearer test-token", user: { email: "test@smejj.com" } }));
      }
      gesehen.push(JSON.parse(roh));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise((fertig) => stub.listen(0, "127.0.0.1", fertig));
  const port = await freierPort();

  const bridge = spawn(process.execPath, [datei], {
    env: {
      ...process.env,
      // Diese Datei setzt SMEJJ_CHAT_BRIDGE_NO_START fuer den eigenen Import —
      // der Kindprozess SOLL aber lauschen, sonst prueft hier gar nichts.
      SMEJJ_CHAT_BRIDGE_NO_START: "0",
      PORT: String(port),
      SMEJJ_HOST: "127.0.0.1",
      SMEJJ_LLM_GROQ_API_KEY: "test-schluessel",
      SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1`,
      // Die Anmeldepruefung laeuft ueber den Control Server — hier derselbe Stub,
      // sonst fragte der Test die ECHTE Produktion und bekaeme 401.
      SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${stub.address().port}`,
      SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "NO"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let ausgabe = "";
  bridge.stdout.on("data", (stueck) => { ausgabe += stueck; });
  t.after(() => { bridge.kill(); stub.close(); });
  for (let versuch = 0; versuch < 60 && !ausgabe.includes("chat-bridge: http"); versuch += 1) {
    await new Promise((fertig) => setTimeout(fertig, 100));
  }
  assert.match(ausgabe, /Projektwissen bereit \(\d+ Abschnitte\)/, "Start muss den Wissensstand melden");

  const frag = async (route, rumpf) => {
    gesehen.length = 0;
    const antwort = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer test-token" },
      body: JSON.stringify(rumpf)
    });
    await antwort.text();
    return gesehen[0]?.messages || [];
  };

  // Gedeckte Frage (Punktzahl 21,9 gemessen) -> Kontext im System-Teil.
  const gedeckt = await frag("/api/chat", { messages: [{ role: "user", content: "Wo speichert smejj.com grosse Dateien, Modelle und Artefakte dauerhaft?" }] });
  const systemGedeckt = gedeckt.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  assert.ok(systemGedeckt.includes("Internes Projektwissen"), "Live-Kette muss den Kontextblock tragen");
  assert.ok(systemGedeckt.includes("[intern:"), "Quellenmarker fehlen");
  assert.deepEqual(gedeckt.map((m) => m.role), ["system", "system", "user"]);

  // Ungedeckte Frage -> unveraendert ohne Kontext (die teuer erkaufte Regel).
  const ungedeckt = await frag("/api/chat", { messages: [{ role: "user", content: "Erzaehl mir einen Witz ueber Katzen." }] });
  assert.equal(ungedeckt.some((m) => String(m.content).includes("Internes Projektwissen")), false);

  // /api/agent ist der Weg, den die Startseite wirklich nutzt (public/app.js),
  // und muss den Kontext ebenso tragen. Bewusst eine Frage OHNE Web-Absicht und
  // ohne Web-Adresse: nur dann bedient die Schnellspur die Anfrage. Nennt eine
  // Frage "smejj.com", gilt sie der Suchweiche als Web-Ziel und geht zum Control
  // Server — der ergaenzt Projektwissen bereits selbst (src/server.js).
  const agent = await frag("/api/agent", { task: FAST_GEDECKT });
  assert.ok(agent.filter((m) => m.role === "system").some((m) => m.content.startsWith("Internes Projektwissen")));
  assert.deepEqual(agent.map((m) => m.role), ["system", "system", "user"]);

  const gesund = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(gesund.projektwissen.enabled, true);
  assert.equal(gesund.version, artefakt.version);
});

// ---------------------------------------------------------------------------
// 2026-08-04 — Anschlussfragen: das Thema steht in der Nachricht davor.
//
// Offener Punkt seit dem 2026-08-01: gesucht wurde immer nur mit der LETZTEN
// Nachricht. "Und wie sichere ich das ab?" traegt sein Thema aber nicht selbst —
// die Suche lief gegen sechs bedeutungsarme Woerter (gemessen 7,65 Punkte, weit
// unter der Schwelle 20) und lieferte nichts, obwohl das Thema davor mit 22,51
// klar gedeckt war.
//
// Alle Zahlen unten sind am 2026-08-04 gegen den ECHTEN Korpus gemessen.
// ---------------------------------------------------------------------------

const THEMA_GEDECKT = "Wo speichert smejj.com grosse Dateien, Modelle und Artefakte dauerhaft?"; // 22,51
const ANSCHLUSS = "Und wie sichere ich das ab?";                                                 // 7,65 allein
const THEMA_UNGEDECKT = "Erzaehl mir einen Witz ueber Katzen.";                                  // 4,62

test("Anschlussfrage: das Thema der vorigen Frage traegt den Kontext", () => {
  assert.equal(rag.buildRagBlock(ANSCHLUSS), "", "allein bleibt die Frage unter der Schwelle");
  const block = rag.buildRagBlockMitVerlauf(ANSCHLUSS, THEMA_GEDECKT);
  assert.ok(block.length > 0, "mit dem Thema davor muss Kontext entstehen");
  assert.equal(block, rag.buildRagBlock(THEMA_GEDECKT),
    "es muss GENAU der Block des Themas sein — keine dritte, zusammengesetzte Suche");
});

test("ist das Thema ungedeckt, bleibt es bei KEINEM Kontext", () => {
  // Der teuerste Fehler vom 2026-08-01 war Kontext fuer ungedeckte Fragen
  // (96,1 % -> 86,0 %). Eine Anschlussfrage darf ihn nicht wieder oeffnen.
  assert.equal(rag.buildRagBlockMitVerlauf("Und warum ist das so?", THEMA_UNGEDECKT), "");
});

test("gedeckte Fragen verhalten sich EXAKT wie vorher", () => {
  // Die Aenderung ist rein additiv: erst die bisherige Suche, nur bei leerem
  // Ergebnis der zweite Anlauf.
  for (const frage of [GEDECKT, FAST_GEDECKT, UNGEDECKT]) {
    assert.equal(rag.buildRagBlockMitVerlauf(frage, THEMA_GEDECKT), rag.buildRagBlock(frage),
      `Verhalten geaendert bei: ${frage}`);
  }
});

test("kurz ist nicht gleich Anschlussfrage", () => {
  // "Was ist ein Passkey?" ist kurz, traegt sein Thema aber selbst. Wuerde
  // stattdessen im Vorherigen gesucht, bekaeme die Frage fremden Kontext.
  assert.equal(rag.istAnschlussfrage("Was ist ein Passkey?"), false);
  assert.equal(rag.istAnschlussfrage("Wie melde ich mich an?"), false);
  assert.equal(rag.buildRagBlockMitVerlauf("Was ist ein Passkey?", THEMA_GEDECKT), "");
});

test("rueckverweisende und anknuepfende Fragen werden erkannt", () => {
  for (const frage of ["Und wie sichere ich das ab?", "Warum?", "Und dabei?", "Ok, und wo genau?"]) {
    assert.equal(rag.istAnschlussfrage(frage), true, `nicht erkannt: ${frage}`);
  }
});

test("lange Fragen gelten nie als Anschlussfrage", () => {
  // Ab neun Woertern traegt eine Frage genug eigenes Wortmaterial; dann ist die
  // erste Suche die richtige Aussage.
  assert.equal(rag.istAnschlussfrage(
    "Und erklaere mir bitte ausfuehrlich, warum das so gebaut worden ist und was es kostet"), false);
});

test("dieselbe Frage zweimal loest keinen zweiten Anlauf aus", () => {
  assert.equal(rag.buildRagBlockMitVerlauf(ANSCHLUSS, ANSCHLUSS), "");
  assert.equal(rag.buildRagBlockMitVerlauf(ANSCHLUSS, ""), "");
  assert.equal(rag.buildRagBlockMitVerlauf(ANSCHLUSS, null), "");
});

test("previousUserContent trifft die Frage VOR der aktuellen", () => {
  // /api/chat bekommt die aktuelle Frage in der Liste, /api/agent nicht —
  // wer die Position raet, greift die falsche Nachricht ab.
  const messages = [
    { role: "user", content: "Erste" },
    { role: "assistant", content: "Antwort" },
    { role: "user", content: "Zweite" }
  ];
  assert.equal(rag.lastUserContent(messages), "Zweite");
  assert.equal(rag.previousUserContent(messages), "Erste");
  assert.equal(rag.previousUserContent([{ role: "user", content: "Nur eine" }]), "");
  assert.equal(rag.previousUserContent(undefined), "");
});

test("beide Live-Wege nutzen die Anschluss-Suche", () => {
  const quelle = readFileSync(new URL("../public/chat-bridge.js", import.meta.url), "utf8");
  assert.match(quelle, /buildRagBlockMitVerlauf\(task, lastUserContent\(body\.history\)\)/,
    "/api/agent: der Verlauf endet mit der Frage davor");
  assert.match(quelle, /buildRagBlockMitVerlauf\(lastUserContent\(messages\), previousUserContent\(messages\)\)/,
    "/api/chat: die Liste enthaelt die aktuelle Frage bereits");
  assert.ok(!/buildRagBlock\(/.test(quelle.replace(/buildRagBlockMitVerlauf\(/g, "")),
    "keine Aufrufstelle darf auf der alten Suche stehenbleiben");
});
