// Waechter fuer die Token-Messung. Geprueft wird die REGEL, nicht das Netz.
//
// Der teuerste Fehler waere hier nicht eine falsche Zahl, sondern eine Zahl,
// die nach Messung AUSSIEHT und geraten ist. Darum hat jede Probe ein
// Gegenstueck: gemessen gegen geschaetzt, bekannter Preis gegen unbekannten,
// Cache gerechnet gegen Cache ignoriert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bericht,
  kostenUsd,
  leseUsage,
  neueMessung,
  notiere,
  preisFuer,
  schaetzeTokens,
  setzeVerbrauchZurueck
} from "../control-server/src/llm/tokenMesser.js";

const STILL = { env: { SMEJJ_VERBRAUCH_LOG: "aus" }, schreibe: () => {} };

test("usage-Block des Anbieters gilt als gemessen", () => {
  const messung = neueMessung({ modell: "claude-opus-5", jetzt: 0 });
  messung.lies({ usage: { prompt_tokens: 30_000, completion_tokens: 1_000 } });
  const datensatz = messung.fertig({ jetzt: 2_000 });
  assert.equal(datensatz.quelle, "gemessen");
  assert.equal(datensatz.einTokens, 30_000);
  assert.equal(datensatz.ausTokens, 1_000);
  assert.equal(datensatz.dauerMs, 2_000);
});

test("ohne usage-Block wird geschaetzt — und das steht auch dran", () => {
  const messung = neueMessung({ modell: "claude-opus-5", jetzt: 0 });
  messung.zaehleEingabe([{ role: "user", content: "x".repeat(400) }]);
  messung.zaehleAusgabe("y".repeat(80));
  const datensatz = messung.fertig({ jetzt: 1_000 });
  assert.equal(datensatz.quelle, "geschaetzt");
  assert.equal(datensatz.einTokens, 100);
  assert.equal(datensatz.ausTokens, 20);
});

test("Werkzeugrunden werden addiert, nicht ueberschrieben", () => {
  const messung = neueMessung({ modell: "gpt-5.6-terra", jetzt: 0 });
  messung.lies({ usage: { prompt_tokens: 10_000, completion_tokens: 200 } });
  messung.lies({ usage: { prompt_tokens: 12_000, completion_tokens: 300 } });
  const datensatz = messung.fertig({ jetzt: 0 });
  assert.equal(datensatz.einTokens, 22_000);
  assert.equal(datensatz.ausTokens, 500);
  assert.equal(datensatz.runden, 2);
});

test("Modellwechsel durch Fallback aendert die Zuordnung", () => {
  const messung = neueMessung({ modell: "gpt-5.6-luna", jetzt: 0 });
  messung.wechsleModell("claude-opus-5");
  messung.lies({ usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } });
  const datensatz = messung.fertig({ jetzt: 0 });
  assert.equal(datensatz.modell, "claude-opus-5");
  assert.equal(datensatz.kostenUsd, 5); // Opus-Preis, nicht Luna-Preis.
});

test("DeepSeek meldet den Cache-Treffer unter anderem Namen — er zaehlt trotzdem", () => {
  const werte = leseUsage({ prompt_tokens: 10_000, completion_tokens: 100, prompt_cache_hit_tokens: 9_000 });
  assert.equal(werte.cache, 9_000);
  const openai = leseUsage({ prompt_tokens: 10_000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 9_000 } });
  assert.equal(openai.cache, 9_000);
});

test("gecachte Tokens werden herausgerechnet, sonst sieht der Cache wirkungslos aus", () => {
  const ohneCache = kostenUsd("claude-sonnet-5", { ein: 1_000_000, aus: 0, cache: 0 });
  const mitCache = kostenUsd("claude-sonnet-5", { ein: 1_000_000, aus: 0, cache: 900_000 });
  assert.equal(ohneCache, 3);
  assert.equal(mitCache, 0.57); // 100k frisch a 3 USD + 900k Cache a 0,30 USD
  assert.ok(mitCache < ohneCache / 4);
});

test("unbekanntes Modell liefert null statt einer geratenen Zahl", () => {
  assert.equal(preisFuer("voellig-neues-modell-x9"), null);
  assert.equal(kostenUsd("voellig-neues-modell-x9", { ein: 1_000_000, aus: 1_000_000 }), null);
});

test("Abo-Modelle kosten 0 — und sind als Abo erkennbar", () => {
  const preis = preisFuer("cline-pass/minimax-m3");
  assert.equal(preis.abo, true);
  assert.equal(kostenUsd("cline-pass/minimax-m3", { ein: 1_000_000, aus: 1_000_000 }), 0);
});

test("Anbieter-Praefix stoert die Zuordnung nicht — aehnliche Namen bleiben getrennt", () => {
  // Die Modell-IDs kommen je nach Weg mit oder ohne Anbieter davor an
  // ("claude-opus-5" ueber die Registry, "anthropic/claude-opus-5" ueber Cline).
  assert.deepEqual(preisFuer("anthropic/claude-opus-5"), { ein: 5, aus: 25, cache: 0.5, abo: false });
  assert.deepEqual(preisFuer("openai/gpt-5.6-luna"), { ein: 0.2, aus: 1.2, cache: 0.02, abo: false });
  // Gegenstueck: das Sparmodell darf nie den Preis des teuren erben.
  assert.notEqual(preisFuer("gpt-5.6-sol").aus, preisFuer("gpt-5.6-luna").aus);
  assert.equal(preisFuer("gpt-5.6-sol").aus, 30);
  assert.equal(preisFuer("gpt-5.6-luna").aus, 1.2);
});

test("Schaetzung ist Zeichen durch vier, aber nie negativ", () => {
  assert.equal(schaetzeTokens(400), 100);
  assert.equal(schaetzeTokens(0), 0);
  assert.equal(schaetzeTokens(-5), 0);
  assert.equal(schaetzeTokens("keine Zahl"), 0);
});

test("Bericht haelt gemessen und geschaetzt getrennt", () => {
  setzeVerbrauchZurueck();
  const echt = neueMessung({ modell: "gpt-5.6-luna", nutzer: "user_aaa", jetzt: 0 });
  echt.lies({ usage: { prompt_tokens: 1_000, completion_tokens: 100 } });
  notiere(echt.fertig({ jetzt: 0 }), STILL);

  const geraten = neueMessung({ modell: "gpt-5.6-luna", nutzer: "user_bbb", jetzt: 0 });
  geraten.zaehleAusgabe("z".repeat(40));
  notiere(geraten.fertig({ jetzt: 0 }), STILL);

  const stand = bericht();
  const tag = stand.tage[0];
  assert.equal(tag.anfragen, 2);
  assert.equal(tag.gemessen, 1);
  assert.equal(tag.geschaetzt, 1);
  assert.equal(stand.topNutzer.length, 2);
  setzeVerbrauchZurueck();
});

test("Anfragen ohne bekannten Preis werden gezaehlt, nicht mit 0 verrechnet", () => {
  setzeVerbrauchZurueck();
  const messung = neueMessung({ modell: "unbekanntes-modell", nutzer: "user_ccc", jetzt: 0 });
  messung.lies({ usage: { prompt_tokens: 5_000, completion_tokens: 500 } });
  notiere(messung.fertig({ jetzt: 0 }), STILL);
  const tag = bericht().tage[0];
  assert.equal(tag.ohnePreis, 1);
  assert.equal(tag.kostenUsd, 0);
  assert.equal(tag.einTokens, 5_000);
  setzeVerbrauchZurueck();
});

test("Logzeile ueberlebt den Neustart — sie wird wirklich geschrieben", () => {
  setzeVerbrauchZurueck();
  const zeilen = [];
  const messung = neueMessung({ modell: "gpt-5.6-luna", nutzer: "user_ddd", jetzt: 0 });
  messung.lies({ usage: { prompt_tokens: 10, completion_tokens: 2 } });
  notiere(messung.fertig({ jetzt: 0 }), { env: {}, schreibe: (zeile) => zeilen.push(zeile) });
  assert.equal(zeilen.length, 1);
  assert.ok(zeilen[0].startsWith("[verbrauch] "));
  const datensatz = JSON.parse(zeilen[0].slice("[verbrauch] ".length));
  assert.equal(datensatz.nutzer, "user_ddd");
  assert.equal(datensatz.quelle, "gemessen");

  // Gegenstueck: abgeschaltet wird nichts geschrieben.
  const stumm = [];
  const zweite = neueMessung({ modell: "gpt-5.6-luna", jetzt: 0 });
  zweite.lies({ usage: { prompt_tokens: 10, completion_tokens: 2 } });
  notiere(zweite.fertig({ jetzt: 0 }), { env: { SMEJJ_VERBRAUCH_LOG: "aus" }, schreibe: (zeile) => stumm.push(zeile) });
  assert.equal(stumm.length, 0);
  setzeVerbrauchZurueck();
});

test("leerer usage-Block macht aus geschaetzt kein gemessen", () => {
  const messung = neueMessung({ modell: "gpt-5.6-luna", jetzt: 0 });
  messung.lies({ usage: { prompt_tokens: 0, completion_tokens: 0 } });
  messung.zaehleAusgabe("abcd");
  assert.equal(messung.fertig({ jetzt: 0 }).quelle, "geschaetzt");
});

// ---------------------------------------------------------------------------
// Ende-zu-Ende am ECHTEN Stream. Die Modultests oben beweisen die Rechnung;
// dieser Test beweist, dass die Messstelle im Chat-Weg ueberhaupt angeschlossen
// ist. Genau diese Luecke — gebaut, aber nicht angeschlossen — hat hier schon
// mehrfach Tage gekostet ([[smejj-schutz-gebaut-nicht-angeschlossen]]).
// ---------------------------------------------------------------------------
import { streamWithTools } from "../control-server/src/llm/toolLoop.js";

function stream(events) {
  return {
    async *[Symbol.asyncIterator]() {
      const encoder = new TextEncoder();
      for (const event of events) yield encoder.encode(`${event}\n\n`);
    }
  };
}

const antwortSenke = () => ({ write: () => {}, gesendet: () => "" });

test("der Chat-Stream meldet den usage-Block an die Messung", async () => {
  setzeVerbrauchZurueck();
  const events = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "Hallo" } }] })}`,
    // So schickt ein OpenAI-kompatibler Anbieter die Abrechnung: eigenes
    // Ereignis am Ende, choices leer.
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12_345, completion_tokens: 678, prompt_tokens_details: { cached_tokens: 10_000 } } })}`,
    "data: [DONE]"
  ];
  await streamWithTools({
    result: { ok: true, backend: "zhipu", model: "glm-5.2", response: { body: stream(events) } },
    chain: [],
    messages: [{ role: "user", content: "Hallo" }],
    res: antwortSenke(),
    options: {},
    executeWithFallback: async () => ({ ok: false }),
    env: { SMEJJ_VERBRAUCH_LOG: "aus" },
    authUser: { userId: "betreiber@example.com" }
  });

  const tag = bericht().tage[0];
  assert.equal(tag.anfragen, 1);
  assert.equal(tag.gemessen, 1, "der usage-Block muss ankommen, sonst misst niemand");
  assert.equal(tag.einTokens, 12_345);
  assert.equal(tag.ausTokens, 678);
  assert.equal(tag.cacheTokens, 10_000);
  assert.equal(tag.modelle[0].modell, "glm-5.2");
  assert.ok(bericht().topNutzer[0].nutzer.startsWith("user_"), "nie die Mailadresse, immer die Kennung");
  setzeVerbrauchZurueck();
});

test("Gegenstueck: ohne usage-Block bleibt derselbe Weg auf geschaetzt", async () => {
  setzeVerbrauchZurueck();
  const events = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "abcd" } }] })}`,
    "data: [DONE]"
  ];
  await streamWithTools({
    result: { ok: true, backend: "zhipu", model: "glm-5.2", response: { body: stream(events) } },
    chain: [],
    messages: [{ role: "user", content: "x".repeat(40) }],
    res: antwortSenke(),
    options: {},
    executeWithFallback: async () => ({ ok: false }),
    env: { SMEJJ_VERBRAUCH_LOG: "aus" }
  });
  const tag = bericht().tage[0];
  assert.equal(tag.gemessen, 0);
  assert.equal(tag.geschaetzt, 1);
  assert.equal(tag.einTokens, 10);
  setzeVerbrauchZurueck();
});
