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
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MIN_TOP_SCORE } from "../control-server/src/rag/ragRanking.js";
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
      headers: { "Content-Type": "application/json", Origin: "https://smejj.com" },
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
