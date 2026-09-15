// smejj.com — A-bis-Z-Livetest 15.09.2026, Befund M2: auf einem neuen Geraet
// baute sich der Verlauf Chat fuer Chat NACHEINANDER auf (126 Abrufe in 90 s,
// nach 40 s 30 von 368, danach Stillstand). Ein haengender Einzelabruf hielt
// alle folgenden fest. Jetzt: begrenzt nebenlaeufig, mit Zeitgrenze, Weiterlauf.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abarbeitenMitGrenze } from "../public/chat-sync-auswahl.js";

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const nie = () => new Promise(() => {});

/** Der alte Weg als Gegenprobe: eine Aufgabe nach der anderen. */
async function nacheinander(aufgaben) {
  let erledigt = 0;
  for (const a of aufgaben) { if (await a()) erledigt += 1; }
  return erledigt;
}

test("KAPUTT (alter Weg): ein haengender Abruf haelt alle folgenden fest", async () => {
  let fertig = 0;
  const aufgaben = [async () => { fertig += 1; return true; }, nie, ...Array.from({ length: 20 }, () => async () => { fertig += 1; return true; })];
  void nacheinander(aufgaben);
  await warte(30);
  assert.equal(fertig, 1, "nach dem haengenden Abruf kam nichts mehr — genau der Stillstand aus dem Livetest");
});

test("GESUND: ein haengender Abruf blockiert die anderen nicht", async () => {
  let fertig = 0;
  const aufgaben = [nie, ...Array.from({ length: 20 }, () => async () => { await warte(1); fertig += 1; return true; })];
  void abarbeitenMitGrenze(aufgaben, { grenze: 4 });
  await warte(80);
  assert.equal(fertig, 20, "alle uebrigen Chats kommen trotzdem an");
});

test("GESUND: nie mehr als `grenze` Abrufe gleichzeitig — und schneller als nacheinander", async () => {
  let laufen = 0;
  let spitze = 0;
  const aufgabe = async () => { laufen += 1; spitze = Math.max(spitze, laufen); await warte(10); laufen -= 1; return true; };
  const t0 = Date.now();
  const ergebnis = await abarbeitenMitGrenze(Array.from({ length: 16 }, () => aufgabe), { grenze: 4 });
  assert.equal(ergebnis.erledigt, 16);
  assert.equal(spitze, 4, "Grenze eingehalten (Server und Leitung bleiben geschont)");
  assert.ok(Date.now() - t0 < 16 * 10, "nebenlaeufig, nicht nacheinander");
});

test("GESUND: Fehlschlaege bekommen eine zweite Runde, danach ist Schluss", async () => {
  const versuche = new Map();
  const wackelig = (id, erfolgAb) => async () => {
    const n = (versuche.get(id) || 0) + 1;
    versuche.set(id, n);
    if (n < erfolgAb) throw new Error("netz");
    return true;
  };
  const ergebnis = await abarbeitenMitGrenze([wackelig("a", 1), wackelig("b", 2), wackelig("c", 9)], { grenze: 2, runden: 2 });
  assert.deepEqual(ergebnis, { erledigt: 2, offen: 1 });
  assert.equal(versuche.get("c"), 2, "hoechstens zwei Runden — kein Dauerklopfen");
});

test("Verdrahtung: pull() sammelt die Abrufe und holt sie mit Grenze und Zeitgrenze", () => {
  const q = readFileSync("public/chat-sync.js", "utf8");
  const pull = q.slice(q.indexOf("async function pull()"), q.indexOf("async function rette("));
  // Nachtest 15.09.: neueste zuerst (tests/nachtest-abmelden-verlauf-20260915.test.mjs).
  assert.match(pull, /await abarbeitenMitGrenze\(neuesteZuerst\(abrufe\), \{ grenze: EINZELABRUF_GRENZE, runden: 2 \}\);/);
  assert.doesNotMatch(pull.slice(0, pull.indexOf("abrufe.push")), /await holeVollstaendig/, "kein Einzelabruf mehr in der Entscheidungsschleife");
  assert.match(q, /signal: AbortSignal|headers: kopf, signal \}/, "der Einzelabruf traegt eine Zeitgrenze");
  assert.match(q, /const EINZELABRUF_ZEITGRENZE_MS = 20_000;/);
});

test("Verlauf-Ansicht fasst Neuzeichnen zusammen statt pro Import alles neu zu lesen", () => {
  const q = readFileSync("public/chat-history-view.js", "utf8");
  assert.match(q, /if \(renderLauf\) \{ renderNochmal = true; return renderLauf; \}/);
});
