// smejj.com — Tests fuer echtes Tool-Calling (control-server/src/llm/toolLoop.js).
//
// Kernzusagen:
//   1. Ohne Freigabe-Flag werden KEINE Werkzeuge angeboten (Non-Regression).
//   2. Werkzeugaufrufe erreichen nie den Nutzer als Antworttext.
//   3. Das Ergebnis geht zurueck ans Modell, die Antwort kommt danach.
//   4. Keine Endlosschleife: nach der letzten Runde wird ohne Werkzeuge gefragt.
//   5. Adressen werden gegen dieselbe SSRF-Regel geprueft wie im Browser-Proxy.

import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS, agentToolsEnabled, runAgentTool, streamWithTools, withAgentTools, zuText } from "../control-server/src/llm/toolLoop.js";

// Baut einen Modell-Stream aus fertigen SSE-Ereignissen.
function stream(events) {
  return {
    async *[Symbol.asyncIterator]() {
      const encoder = new TextEncoder();
      for (const event of events) yield encoder.encode(`${event}\n\n`);
    }
  };
}

function sammelAntwort() {
  const stuecke = [];
  return { write: (text) => stuecke.push(text), gesendet: () => stuecke.join(""), stuecke };
}

const textEvent = (inhalt) => `data: ${JSON.stringify({ choices: [{ delta: { content: inhalt } }] })}`;
const toolEvent = (index, teil) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, ...teil }] } }] })}`;

test("ohne Freigabe-Flag werden keine Werkzeuge angeboten", () => {
  assert.equal(agentToolsEnabled({}), false);
  assert.equal(agentToolsEnabled({ SMEJJ_AGENT_TOOLS_ENABLED: "NO" }), false);
  assert.equal(agentToolsEnabled({ SMEJJ_AGENT_TOOLS_ENABLED: "YES" }), true);
  const optionen = { temperature: 1 };
  assert.equal(withAgentTools(optionen, {}).tools, undefined, "ohne Flag darf kein tools-Feld entstehen");
  assert.deepEqual(withAgentTools(optionen, { SMEJJ_AGENT_TOOLS_ENABLED: "YES" }).tools, AGENT_TOOLS);
});

test("Werkzeugbeschreibung ist vollstaendig und stabil", () => {
  assert.equal(AGENT_TOOLS.length, 2);
  const namen = AGENT_TOOLS.map((eintrag) => eintrag.function.name);
  assert.deepEqual(namen, ["seite_lesen", "web_suche"]);
  const seite = AGENT_TOOLS[0].function;
  assert.equal(seite.name, "seite_lesen");
  assert.deepEqual(seite.parameters.required, ["url"]);
  assert.ok(seite.description.length > 40, "das Modell braucht eine klare Anleitung");
  const suche = AGENT_TOOLS[1].function;
  assert.deepEqual(suche.parameters.required, ["anfrage"]);
  // Der Verbotssatz ist die eigentliche Wirkung des Werkzeugs (Befund 2026-07-29):
  // ohne ihn antwortet das Modell weiter mit "ich habe keine Informationen".
  assert.ok(/NIEMALS/.test(suche.description), "Aufgeben ohne Suche muss ausdruecklich verboten sein");
});

// Zweite Sicherung gegen "Ich habe keine Informationen" (Befund 2026-07-29).
test("web_suche liefert nummerierte Treffer mit Abrufzeit", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"Schlagzeilen Berlin"}' } },
    {
      sucheImpl: async (anfrage, optionen) => {
        assert.equal(anfrage, "Schlagzeilen Berlin");
        assert.equal(optionen.limit, 6);
        return [{ title: "Berlin aktuell", url: "https://www.tagesschau.de/berlin", snippet: "Meldung | Berlin | heute" }];
      }
    }
  );
  assert.ok(ergebnis.includes("1. Berlin aktuell"));
  assert.ok(ergebnis.includes("https://www.tagesschau.de/berlin"));
  assert.ok(ergebnis.includes("Meldung - Berlin - heute"), "Snippet muss durch cleanSnippet laufen");
  assert.ok(/abgerufen \d{4}-\d{2}-\d{2}T/.test(ergebnis), "ohne Abrufzeit kann das Modell den Stand nicht belegen");
});

test("web_suche bleibt fail-safe bei leerer Anfrage, Nulltreffern und Fehlern", async () => {
  const leer = await runAgentTool({ function: { name: "web_suche", arguments: '{"anfrage":"  "}' } }, { sucheImpl: async () => [] });
  assert.match(leer, /Leere Suchanfrage/);
  const keine = await runAgentTool({ function: { name: "web_suche", arguments: '{"anfrage":"xyzq"}' } }, { sucheImpl: async () => [] });
  assert.match(keine, /Keine Treffer/);
  const kaputt = await runAgentTool(
    { function: { name: "web_suche", arguments: '{"anfrage":"test"}' } },
    { sucheImpl: async () => { throw new Error("Netz weg"); } }
  );
  assert.match(kaputt, /Suche ist fehlgeschlagen/);
  assert.ok(!/undefined/.test(kaputt));
});

test("normale Antwort ohne Werkzeug laeuft unveraendert durch", async () => {
  const res = sammelAntwort();
  await streamWithTools({
    result: { response: { body: stream([textEvent("Hallo"), textEvent(" Welt"), "data: [DONE]"]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async () => { throw new Error("darf nicht aufgerufen werden"); }
  });
  assert.match(res.gesendet(), /Hallo/);
  assert.match(res.gesendet(), /Welt/);
  assert.match(res.gesendet(), /data: \[DONE\]/);
});

test("Werkzeugaufruf wird ausgefuehrt und das Ergebnis beantwortet", async () => {
  const res = sammelAntwort();
  const gesehen = { aufrufe: [], zweiteNachrichten: null };
  await streamWithTools({
    result: { response: { body: stream([
      toolEvent(0, { id: "call_1", function: { name: "seite_lesen", arguments: '{"url":' } }),
      toolEvent(0, { function: { arguments: '"https://imild.com/"}' } }),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}`,
      "data: [DONE]"
    ]) } },
    chain: [], messages: [{ role: "user", content: "teste imild.com" }], res, options: { temperature: 1 },
    executeWithFallback: async (_chain, nachrichten) => {
      gesehen.zweiteNachrichten = nachrichten;
      return { ok: true, response: { body: stream([textEvent("Seite ist erreichbar."), "data: [DONE]"]) } };
    },
    runTool: async (call) => { gesehen.aufrufe.push(call); return "HTTP-Status: 200"; }
  });

  assert.equal(gesehen.aufrufe.length, 1);
  assert.equal(gesehen.aufrufe[0].function.name, "seite_lesen");
  assert.equal(gesehen.aufrufe[0].function.arguments, '{"url":"https://imild.com/"}', "Bruchstuecke muessen zusammengesetzt werden");

  const rollen = gesehen.zweiteNachrichten.map((m) => m.role);
  assert.deepEqual(rollen, ["user", "assistant", "tool"]);
  assert.equal(gesehen.zweiteNachrichten[2].content, "HTTP-Status: 200");
  assert.equal(gesehen.zweiteNachrichten[2].tool_call_id, "call_1");

  assert.match(res.gesendet(), /Seite ist erreichbar/);
  assert.ok(!res.gesendet().includes("seite_lesen"), "Werkzeugaufrufe duerfen nie im Antworttext landen");
  assert.equal(res.gesendet().match(/data: \[DONE\]/g).length, 1, "genau ein Abschluss");
});

test("ein fehlgeschlagenes Werkzeug bricht nichts ab", async () => {
  const res = sammelAntwort();
  let gemeldet = "";
  await streamWithTools({
    result: { response: { body: stream([
      toolEvent(0, { id: "c1", function: { name: "seite_lesen", arguments: '{"url":"https://x.example/"}' } }),
      "data: [DONE]"
    ]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async (_c, nachrichten) => {
      gemeldet = nachrichten.at(-1).content;
      return { ok: true, response: { body: stream([textEvent("Die Seite war nicht erreichbar."), "data: [DONE]"]) } };
    },
    runTool: async () => { throw new Error("Netz weg"); }
  });
  assert.match(gemeldet, /Werkzeugfehler: Netz weg/);
  assert.match(res.gesendet(), /nicht erreichbar/);
});

test("keine Endlosschleife: letzte Runde fragt ohne Werkzeuge", async () => {
  const res = sammelAntwort();
  const optionenJeRunde = [];
  const immerWerkzeug = () => stream([
    toolEvent(0, { id: "c", function: { name: "seite_lesen", arguments: "{}" } }),
    "data: [DONE]"
  ]);
  await streamWithTools({
    result: { response: { body: immerWerkzeug() } },
    chain: [], messages: [], res, options: { temperature: 1, tools: AGENT_TOOLS },
    executeWithFallback: async (_c, _m, optionen) => {
      optionenJeRunde.push(optionen);
      return { ok: true, response: { body: immerWerkzeug() } };
    },
    runTool: async () => "ok"
  });
  assert.equal(optionenJeRunde.length, 3, "hoechstens drei Runden");
  assert.equal(optionenJeRunde.at(-1).tools, undefined, "die letzte Runde darf keine Werkzeuge mehr anbieten");
  assert.match(res.gesendet(), /data: \[DONE\]/);
});

// Befund 2026-07-29, live reproduziert: Schoepft das Modell alle Runden aus,
// wurde die werkzeugfreie Schlussantwort zwar GEHOLT, aber nie gestreamt — der
// Nutzer bekam nach 24 Sekunden nur "data: [DONE]". Der Test oben hat das nicht
// gefangen, weil er nur auf [DONE] geprueft hat, nicht auf eine Antwort.
test("nach der letzten Runde wird die Schlussantwort auch wirklich gesendet", async () => {
  const res = sammelAntwort();
  let aufrufe = 0;
  await streamWithTools({
    result: { response: { body: stream([toolEvent(0, { id: "c", function: { name: "web_suche", arguments: '{"anfrage":"x"}' } }), "data: [DONE]"]) } },
    chain: [], messages: [], res, options: { temperature: 1, tools: AGENT_TOOLS },
    executeWithFallback: async () => {
      aufrufe += 1;
      // Die ersten Runden wollen weiter Werkzeuge, die letzte antwortet mit Text.
      const body = aufrufe < 3
        ? stream([toolEvent(0, { id: "c", function: { name: "web_suche", arguments: '{"anfrage":"x"}' } }), "data: [DONE]"])
        : stream([textEvent("Dazu habe ich nichts gefunden."), "data: [DONE]"]);
      return { ok: true, response: { body } };
    },
    runTool: async () => "Keine Treffer"
  });
  const gesendet = res.gesendet();
  assert.match(gesendet, /Dazu habe ich nichts gefunden\./, "die Schlussantwort muss beim Nutzer ankommen");
  assert.match(gesendet, /data: \[DONE\]/);
});

test("faellt das Modell in einer Folgerunde aus, bekommt der Nutzer eine Erklaerung", async () => {
  const res = sammelAntwort();
  await streamWithTools({
    result: { response: { body: stream([toolEvent(0, { id: "c", function: { name: "seite_lesen", arguments: "{}" } }), "data: [DONE]"]) } },
    chain: [], messages: [], res, options: {},
    executeWithFallback: async () => ({ ok: false }),
    runTool: async () => "ok"
  });
  assert.match(res.gesendet(), /konnte nicht ausgewertet werden/);
  assert.match(res.gesendet(), /data: \[DONE\]/);
});

test("Adressen werden gegen die SSRF-Regel des Browser-Proxys geprueft", async () => {
  const intern = await runAgentTool({ function: { name: "seite_lesen", arguments: '{"url":"http://127.0.0.1/admin"}' } });
  assert.match(intern, /blockiert|abgelehnt/i, "privates Netz muss abgelehnt werden");
  const kaputt = await runAgentTool({ function: { name: "seite_lesen", arguments: "{kein json" } });
  assert.match(kaputt, /kein gueltiges JSON/);
  const fremd = await runAgentTool({ function: { name: "rm_rf", arguments: "{}" } });
  assert.match(fremd, /Unbekanntes Werkzeug/);
});

test("Seite lesen liefert Status, Titel und Text", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "seite_lesen", arguments: '{"url":"https://imild.com/"}' } },
    {
      fetchImpl: async () => ({
        status: 200,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => "<html><head><title>iMild.com</title></head><body><script>x()</script><p>Drei Produkte.</p></body></html>"
      })
    }
  );
  assert.match(ergebnis, /HTTP-Status: 200/);
  assert.match(ergebnis, /Titel: iMild\.com/);
  assert.match(ergebnis, /Drei Produkte/);
  assert.ok(!ergebnis.includes("x()"), "Skriptinhalt darf nicht in den Modellkontext");
});

test("Nicht-Text-Inhalte werden nicht als Seite ausgegeben", async () => {
  const ergebnis = await runAgentTool(
    { function: { name: "seite_lesen", arguments: '{"url":"https://imild.com/bild.png"}' } },
    { fetchImpl: async () => ({ status: 200, headers: { get: () => "image/png" }, text: async () => "binaer" }) }
  );
  assert.match(ergebnis, /kein lesbarer Text/);
});

test("zuText entfernt Markup und normalisiert", () => {
  assert.equal(zuText("<p>Hallo&nbsp;Welt</p><p>Zwei</p>"), "Hallo Welt\nZwei");
});
