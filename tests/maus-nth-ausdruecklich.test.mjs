// smejj.com — Mehrdeutige Treffer: die Maus benennt ihre Wahl mit "nth".
//
// LIVE 2026-09-09 (ferner Browser, de.wikipedia.org): Suchvorschlag UND
// Trefferliste trugen denselben Link a[href='/wiki/Ada_Lovelace']. Der
// Browser lehnte ab (selector_mehrdeutig, bewusst kein .first()), das Panel
// kuerzte den Rat auf "enger fassen (Rolle+Name aus dem Bedie", das Modell
// versuchte role+name — ebenfalls zwei Treffer — und der Lauf endete ohne
// Antwort. Drei Stellen muessen zusammenspielen, damit "nth" ankommt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSessionAction } from "../workers/remote-browser/session-engine.js";
import { MehrdeutigError } from "../workers/maus-engine/selector.mjs";
import { buildStepPrompt } from "../workers/maus-engine/prompt-template.mjs";

test("der ferne Browser nimmt nth an — und nur als ganze Zahl im Rahmen", () => {
  const ok = validateSessionAction({ type: "selectorClick", strategy: "css", value: "a[href='/wiki/Ada_Lovelace']", nth: 0 });
  assert.equal(ok.ok, true);
  assert.equal(ok.action.nth, 0, "nth fiel weg — genau der Live-Befund");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: "0" }).action.nth, undefined, "Text ist keine Auswahl");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: -1 }).action.nth, undefined);
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "css", value: "a", nth: 1.5 }).action.nth, undefined);
});

test("die Mehrdeutig-Meldung nennt nth VORN — sie ueberlebt die Kuerzung des Panels", () => {
  const fehler = new MehrdeutigError(2, { strategy: "css", value: "a[href='/wiki/Ada_Lovelace']" });
  const gekuerzt = fehler.message.slice(0, 120);
  assert.match(gekuerzt, /"nth":0/, `in den ersten 120 Zeichen fehlt der Rat: ${gekuerzt}`);
  assert.match(fehler.message, /enger fassen/);
});

test("der Schritt-Vertrag erklaert nth — sonst kann das Modell die Wahl nicht benennen", () => {
  const prompt = buildStepPrompt({
    task: "t", capsuleRef: "c", domainAllowlist: ["de.wikipedia.org"], budget: { maxActions: 10 }, files: [],
    visionAllowed: false, observation: { url: "https://de.wikipedia.org/", title: "W", elements: [] }, remainingSteps: 5
  });
  assert.match(prompt, /selector_mehrdeutig/);
  assert.match(prompt, /"nth":0/);
  assert.match(prompt, /Nie denselben/);
});
