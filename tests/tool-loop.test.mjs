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
import { AGENT_TOOLS, agentToolsEnabled, runAgentTool, SCHLUSSRUNDE_ANSAGE, streamWithTools, WERKZEUG_VERTRAG, withAgentTools, zuText } from "../control-server/src/llm/toolLoop.js";

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

  // Die letzte system-Nachricht ist der Antwort-Vertrag (seit 2026-08-13) — die
  // Reihenfolge davor ist die eigentliche Zusage: Frage, Werkzeugwunsch, Ergebnis.
  const rollen = gesehen.zweiteNachrichten.map((m) => m.role);
  assert.deepEqual(rollen, ["user", "assistant", "tool", "system"]);
  const werkzeugAntwort = gesehen.zweiteNachrichten.find((m) => m.role === "tool");
  assert.equal(werkzeugAntwort.content, "HTTP-Status: 200");
  assert.equal(werkzeugAntwort.tool_call_id, "call_1");

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
      // Bewusst ueber die Rolle gesucht statt at(-1): am Ende steht seit
      // 2026-08-13 der Antwort-Vertrag. Gemeint ist hier das Werkzeugergebnis.
      gemeldet = nachrichten.find((m) => m.role === "tool").content;
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

// --- Eine gesperrte Seite ist keine Sackgasse ------------------------------
//
// GEMESSEN 2026-08-13: LoopNet und Crexi antworteten mit 403 hinter Cloudflare.
// Das Modell schrieb "kann ich die dortigen Exposés nicht direkt auslesen",
// suchte weiter, verbrauchte alle Runden und brach mitten im Satz ab — kein
// einziges Angebot fuer den Nutzer. ChatGPT wurde am selben Tag genauso
// ausgesperrt und lieferte trotzdem sechs Inserate, weil es die SUCHTREFFER
// auswertete. Die Sperre war nie das Problem, die Fehlermeldung war es.

const sperrfetch = (status, extra = {}) => async () => ({
  status,
  headers: { get: () => "text/html; charset=utf-8" },
  text: async () => "<html><head><title>Access denied</title></head><body>Sorry, you have been blocked.</body></html>",
  ...extra
});

async function leseMit(url, fetchImpl) {
  return runAgentTool({ function: { name: "seite_lesen", arguments: JSON.stringify({ url }) } }, { fetchImpl });
}

test("403 sagt dem Modell, was es STATTDESSEN tun soll", async () => {
  const ergebnis = await leseMit("https://www.loopnet.com/Listing/20980-Redwood-Rd/", sperrfetch(403));
  assert.match(ergebnis, /gesperrt \(HTTP 403\)/);
  assert.match(ergebnis, /NICHT erneut auf/, "erneutes Lesen muss ausdruecklich verboten sein");
  assert.match(ergebnis, /SUCHERGEBNISSEN/, "der Ausweg muss benannt sein, nicht nur die Sperre");
  assert.match(ergebnis, /Flaeche, Preis je Einheit und Zimmerzahl/);
  assert.match(ergebnis, /anklickbare Adresse/, "die Adresse gehoert trotzdem in die Antwort");
  assert.match(ergebnis, /Erfinde nichts/, "die Luecke ehrlich benennen, nicht fuellen");
  assert.match(ergebnis, /www\.loopnet\.com\/Listing\/20980-Redwood-Rd/, "die konkrete Adresse steht drin");
});

test("401, 429 und 503 zaehlen genauso als Sperre", async () => {
  for (const status of [401, 429, 503]) {
    const ergebnis = await leseMit("https://www.crexi.com/lease/x", sperrfetch(status));
    assert.match(ergebnis, new RegExp(`gesperrt \\(HTTP ${status}\\)`), `Status ${status}`);
    assert.match(ergebnis, /SUCHERGEBNISSEN/, `Status ${status} braucht denselben Ausweg`);
  }
});

test("eine Javascript-Pruefseite mit HTTP 200 gilt auch als Sperre", async () => {
  // Cloudflare liefert die Pruefseite oft mit 200. Ohne diese Erkennung
  // berichtet das Modell dem Nutzer ueber "Just a moment ...".
  const ergebnis = await leseMit("https://www.crexi.com/lease/properties/CA/Castro_Valley/Office", async () => ({
    status: 200,
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>"
  }));
  assert.match(ergebnis, /gesperrt \(HTTP 200\)/);
  assert.ok(!ergebnis.includes("Just a moment"), "die Pruefseite darf nie als Inhalt durchgehen");
});

test("eine gesunde Seite bleibt unveraendert lesbar (Non-Regression)", async () => {
  // Der Sperrtest darf nicht jede Seite verschlucken, die ueber Cloudflare
  // SCHREIBT — deshalb ist die Erkennung an den Textanfang gebunden.
  const ergebnis = await leseMit("https://blog.example/cloudflare", async () => ({
    status: 200,
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => "<html><head><title>Wie Cloudflare Bots blockiert</title></head><body>"
      + "<p>Ein Artikel darueber, warum Seiten access denied liefern und Nutzer verify you are human sehen.</p>"
      + "</body></html>"
  }));
  assert.match(ergebnis, /HTTP-Status: 200/);
  assert.match(ergebnis, /Wie Cloudflare Bots blockiert/);
  assert.ok(!ergebnis.includes("gesperrt (HTTP"), "ein Artikel UEBER Sperren ist keine Sperre");
});

test("403 mit Bild-Inhaltstyp meldet ebenfalls die Sperre, nicht den Typ", async () => {
  const ergebnis = await leseMit("https://www.loopnet.com/x", async () => ({
    status: 403, headers: { get: () => "image/png" }, text: async () => "binaer"
  }));
  assert.match(ergebnis, /gesperrt \(HTTP 403\)/);
});

// --- Die Schlussrunde muss wissen, dass sie die Schlussrunde ist -----------
//
// GEMESSEN 2026-08-13 live: Die werkzeugfreie Schlussrunde antwortete "Ich habe
// konkrete Craigslist-Inserate gefunden, die ich jetzt einzeln auslese, um
// Ihnen die Details zu geben." — 148 Zeichen Ankuendigung, kein einziges
// Inserat, obwohl die Treffer vorlagen. Wer nicht weiss, dass er das letzte
// Wort hat, kuendigt weiter an.

function ansagenJeRunde({ hoertAufNach = Infinity } = {}) {
  const gesehen = [];
  return {
    gesehen,
    lauf: streamWithTools({
      result: { response: { body: stream([
        toolEvent(0, { id: "c1", function: { name: "web_suche", arguments: '{"anfrage":"office castro valley"}' } }),
        "data: [DONE]"
      ]) } },
      chain: [], messages: [{ role: "user", content: "Suche Buero-Angebote" }], res: sammelAntwort(), options: {},
      executeWithFallback: async (_chain, verlauf) => {
        gesehen.push(verlauf.filter((n) => n.role === "system").map((n) => n.content));
        // Das Modell hoert irgendwann von selbst auf, Werkzeuge zu rufen — genau
        // dieser Fall war der gemessene Fehler.
        const schluss = gesehen.length >= hoertAufNach;
        return { ok: true, response: { body: stream([
          schluss
            ? textEvent("Ich suche jetzt gezielt nach aktuellen Buromiet-Angeboten.")
            : toolEvent(0, { id: `c${gesehen.length + 1}`, function: { name: "web_suche", arguments: '{"anfrage":"noch was"}' } }),
          "data: [DONE]"
        ]) } };
      },
      runTool: async () => "Suchergebnisse:\n1. Treffer\n   https://a.example/"
    })
  };
}

test("der Antwort-Vertrag gilt schon ab der ERSTEN Werkzeugrunde", async () => {
  // Der gemessene Fehler: ein Lauf endet meist NICHT am Rundenlimit, sondern
  // weil das Modell aufhoert, Werkzeuge zu rufen. Eine Ansage nur vor der
  // letzten Runde kam dann nie an.
  const { gesehen, lauf } = ansagenJeRunde({ hoertAufNach: 1 });
  await lauf;
  assert.equal(gesehen.length, 1, "das Modell hoerte nach einer Runde von selbst auf");
  assert.deepEqual(gesehen[0], [WERKZEUG_VERTRAG], "der Vertrag muss trotzdem angekommen sein");
});

test("die Schlussrunde bekommt zusaetzlich die Schlussansage", async () => {
  const { gesehen, lauf } = ansagenJeRunde();
  await lauf;
  assert.equal(gesehen.length, 3, "drei Modellaufrufe, einer je Runde");
  assert.deepEqual(gesehen[0], [WERKZEUG_VERTRAG], "ab der ersten Runde gilt der Vertrag");
  assert.deepEqual(gesehen[1], [WERKZEUG_VERTRAG], "die Zwischenrunde bekommt NUR den Vertrag");
  assert.deepEqual(gesehen[2], [WERKZEUG_VERTRAG, SCHLUSSRUNDE_ANSAGE], "erst zum Schluss beides");
  // Der Vertrag darf sich nicht wiederholen — sonst waechst der Verlauf je Runde.
  assert.equal(gesehen[2].filter((t) => t === WERKZEUG_VERTRAG).length, 1);
});

test("der Vertrag laesst weiterrecherchieren, die Schlussansage nicht", () => {
  assert.match(WERKZEUG_VERTRAG, /darfst weitere Werkzeuge aufrufen/);
  assert.ok(!/LETZTE RUNDE/.test(WERKZEUG_VERTRAG), "sonst hoert das Modell schon in Runde eins auf");
  assert.match(SCHLUSSRUNDE_ANSAGE, /LETZTE RUNDE/);
  // Beide tragen denselben Vertragstext — eine Quelle, keine zwei Wahrheiten.
  for (const pflicht of [/Tabelle/, /im Inserat nicht angegeben/, /ich lese jetzt/]) {
    assert.match(WERKZEUG_VERTRAG, pflicht);
    assert.match(SCHLUSSRUNDE_ANSAGE, pflicht);
  }
});

test("die Ansage verbietet das Ankuendigen und verlangt Belege", () => {
  // Der gemessene Fehlersatz und seine Geschwister muessen ausdruecklich
  // benannt sein — eine allgemeine Bitte um "eine gute Antwort" reicht nicht.
  assert.match(SCHLUSSRUNDE_ANSAGE, /LETZTE RUNDE/);
  assert.match(SCHLUSSRUNDE_ANSAGE, /keine Werkzeuge mehr/);
  assert.match(SCHLUSSRUNDE_ANSAGE, /ich lese jetzt/, "genau der gemessene Fehlersatz");
  assert.match(SCHLUSSRUNDE_ANSAGE, /lassen Sie mich/i);
  assert.match(SCHLUSSRUNDE_ANSAGE, /Tabelle/, "der Antwort-Vertrag bei mehreren Treffern");
  assert.match(SCHLUSSRUNDE_ANSAGE, /anklickbar/, "die Adresse muss anklickbar verlangt werden");
  assert.match(SCHLUSSRUNDE_ANSAGE, /im Inserat nicht angegeben/, "Luecken offen benennen");
  assert.match(SCHLUSSRUNDE_ANSAGE, /erfundene Zahl ist ein Fehler/);
  assert.match(SCHLUSSRUNDE_ANSAGE, /Empfehlung/);
});

test("ohne Werkzeuglauf gibt es auch keine Ansage (Non-Regression)", async () => {
  const gesehen = [];
  await streamWithTools({
    result: { response: { body: stream([textEvent("Direkt geantwortet."), "data: [DONE]"]) } },
    chain: [], messages: [], res: sammelAntwort(), options: {},
    executeWithFallback: async (_chain, verlauf) => { gesehen.push(verlauf); throw new Error("darf nicht aufgerufen werden"); }
  });
  assert.equal(gesehen.length, 0, "wer kein Werkzeug ruft, braucht keine Schlussansage");
});
