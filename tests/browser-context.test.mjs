// smejj.com — Tests fuer den Seiten-Kontext (Stufe 2).
//
// Kernzusage: Nennt eine Aufgabe eine Adresse, bekommt das Modell den echten
// Seiteninhalt. Ist der Proxy stumm, bleibt die Aufgabe unveraendert — das
// Modell darf nie auf einer erfundenen Grundlage antworten.

import test from "node:test";
import assert from "node:assert/strict";
import { buildGroundedTask, extractReadableText, fetchPageContext, groundTask, modelForTask } from "../public/browser-context.js";

const ROUTES = { api: { browserFetch: "https://control.example/api/browser/fetch" } };

function proxyStub(payload, { fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (fail) throw new Error("Netzfehler");
    return { json: async () => payload };
  };
  return { fetchImpl, calls };
}

test("Aufgabe ohne Adresse loest keine Netzanfrage aus", async () => {
  const { fetchImpl, calls } = proxyStub({});
  const result = await groundTask("erklaer mir bitte kurz Rekursion", { fetchImpl, routes: ROUTES });
  assert.equal(result, "erklaer mir bitte kurz Rekursion");
  assert.deepEqual(calls, [], "ohne Adresse darf nichts geladen werden");
});

test("Adresse ohne Schema wird geladen und in den Kontext gesetzt", async () => {
  const { fetchImpl, calls } = proxyStub({
    ok: true, status: 200, finalUrl: "https://imild.com/", title: "iMild.com — Drei Produkte",
    html: "<html><head><style>b{}</style></head><body><h1>Drei Produkte</h1><p>Eine Vision.</p></body></html>"
  });
  const result = await groundTask("geh browser iMild.com teste ob alles fehlerfrei ist?", { fetchImpl, routes: ROUTES });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(encodeURIComponent("https://imild.com/")));
  assert.ok(result.includes("Adresse: https://imild.com/"));
  assert.ok(result.includes("Titel: iMild.com — Drei Produkte"));
  assert.ok(result.includes("HTTP 200, erfolgreich geladen"));
  assert.ok(result.includes("Drei Produkte"));
  assert.ok(!result.includes("<h1>"), "kein Markup im Kontext");
  assert.ok(result.trimEnd().endsWith("Aufgabe: geh browser iMild.com teste ob alles fehlerfrei ist?"));
});

test("stummer Proxy laesst die Aufgabe unveraendert (fail-closed)", async () => {
  const { fetchImpl } = proxyStub(null, { fail: true });
  const task = "pruefe die Seite imild.com auf Fehler";
  assert.equal(await groundTask(task, { fetchImpl, routes: ROUTES }), task);
});

test("Serverfehler der Zielseite wird als echtes Urteil weitergereicht", async () => {
  const { fetchImpl } = proxyStub({ ok: false, status: 500, finalUrl: "https://imild.com/", error: "upstream" });
  const result = await groundTask("teste die Seite imild.com", { fetchImpl, routes: ROUTES });
  assert.ok(result.includes("HTTP 500 — Seite meldet einen Fehler"));
});

test("gleicher Auftrag laedt nur einmal (beide Sendewege)", async () => {
  const { fetchImpl, calls } = proxyStub({ ok: true, status: 200, finalUrl: "https://imild.com/", html: "<p>Hallo</p>" });
  const task = "pruefe die Webseite imild.com im Browser";
  const erst = await groundTask(task, { fetchImpl, routes: ROUTES });
  const zweit = await groundTask(task, { fetchImpl, routes: ROUTES });
  assert.equal(erst, zweit);
  assert.equal(calls.length, 1, "der zweite Sendeweg darf nicht nachladen");
});

test("ohne konfigurierten Proxy passiert nichts", async () => {
  const { fetchImpl } = proxyStub({ ok: true });
  assert.equal(await fetchPageContext("https://imild.com/", { fetchImpl, routes: { api: { browserFetch: "/api/browser/fetch" } } }), null);
});

test("Textauszug entfernt Skripte und kuerzt sauber", () => {
  const html = "<body><script>alert('x')</script><p>Hallo&nbsp;Welt</p><p>Zweite Zeile</p></body>";
  const text = extractReadableText(html);
  assert.ok(!text.includes("alert"), "Skriptinhalt darf nicht im Kontext landen");
  assert.ok(text.includes("Hallo Welt"));
  assert.ok(text.includes("Zweite Zeile"));

  const lang = extractReadableText(`<p>${"wort ".repeat(3000)}</p>`, 200);
  assert.ok(lang.length <= 202, `gekuerzt erwartet, war ${lang.length}`);
  assert.ok(lang.endsWith("…"));
});

test("Kontextblock weist das Modell auf fehlende Grundlage hin", () => {
  const block = buildGroundedTask("teste", { url: "https://a.example/", title: "", status: 200, ok: true, text: "Inhalt" });
  assert.ok(block.includes("erfinde nichts dazu"));
  assert.ok(block.includes("echte Abfrage, keine Annahme"));
});

// --- Tiefspur bei Adressen (2026-07-28) --------------------------------------
// Die Bridge ueberspringt ihre werkzeuglose Schnellspur, wenn das angefragte
// Modell /glm|kimi|cline/ enthaelt. Genau darueber steuert das Frontend, dass
// Aufgaben mit Adresse beim werkzeugfaehigen Control Server landen.

// Eigene Adressen je Test: groundTask merkt sich geladene Seiten je Auftragstext
// modulweit. Wer eine Aufgabe wiederverwendet, die ein frueherer Test geladen
// hat, misst dessen Zustand mit.
test("Aufgabe mit Adresse geht in die Tiefspur, SOLANGE die Seite nicht geladen wurde", () => {
  for (const aufgabe of [
    "geh browser ungeladen-eins.de teste ob alles fehlerfrei ist?",
    "Lies https://ungeladen-zwei.de/ und nenne den Titel",
    "pruefe ungeladen-drei.de/automation"
  ]) {
    assert.match(modelForTask(aufgabe, "smejj 1.0"), /glm|kimi|cline/i, `muss Tiefspur sein: ${aufgabe}`);
  }
});

test("geladene Seite bedeutet Schnellspur — der Inhalt steht schon in der Frage", async () => {
  // Gemessen am 2026-07-28: die Tiefspur brauchte 4,9-7,8 s bis zum ersten Byte,
  // fetch-retry.js bricht nach 6,5 s ab. Genau deshalb endeten Fragen MIT Adresse
  // oft in "Verbindung zum Server unterbrochen". Mit eingebettetem Seiteninhalt
  // antwortet die Schnellspur in 0,49-1,01 s und inhaltlich richtig.
  const aufgabe = "Welcher Titel steht auf https://beispiel-schnellspur.de ?";
  const fetchImpl = async () => ({
    json: async () => ({ finalUrl: "https://beispiel-schnellspur.de", title: "Beispiel", status: 200, ok: true, html: "<p>Inhalt der Seite.</p>" })
  });
  const routes = { api: { browserFetch: "https://beispiel.invalid/api/browser/fetch" } };

  assert.match(modelForTask(aufgabe, "smejj 1.0"), /glm/i, "vor dem Laden: Tiefspur");
  const gegroundet = await groundTask(aufgabe, { fetchImpl, routes });
  assert.ok(gegroundet.includes("Inhalt der Seite."), "der Seiteninhalt steckt jetzt in der Frage");
  assert.equal(modelForTask(aufgabe, "smejj 1.0"), "smejj 1.0", "nach dem Laden: Wahl des Nutzers bleibt");
});

test("scheiterte der Abruf, bleibt es bei der Tiefspur", async () => {
  const aufgabe = "Lies https://nicht-erreichbar-schnellspur.de und fasse zusammen";
  const fetchImpl = async () => { throw new Error("Netz weg"); };
  const routes = { api: { browserFetch: "https://beispiel.invalid/api/browser/fetch" } };
  const unveraendert = await groundTask(aufgabe, { fetchImpl, routes });
  assert.equal(unveraendert, aufgabe, "ohne Seiteninhalt bleibt die Aufgabe unveraendert");
  assert.match(modelForTask(aufgabe, "smejj 1.0"), /glm/i, "nur hier hilft echtes Tool-Calling noch");
});

test("ohne Adresse bleibt die Wahl des Nutzers unangetastet", () => {
  assert.equal(modelForTask("erklaer mir Rekursion", "smejj 1.0"), "smejj 1.0");
  assert.equal(modelForTask("pruefe die Datei app.js", "smejj 1.0"), "smejj 1.0");
  assert.equal(modelForTask("wie spaet ist es", ""), "");
});

test("eine bereits tiefspurfaehige Wahl wird nie ueberschrieben", () => {
  assert.equal(modelForTask("lies imild.com", "Kimi K2.7"), "Kimi K2.7");
  assert.equal(modelForTask("lies imild.com", "Cline"), "Cline");
});
