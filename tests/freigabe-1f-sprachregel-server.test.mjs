// Betreiber-Freigabe 1f (15.09.2026): ausdrueckliche Sprachregel auch im Agenten-Prompt des Servers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baueSystemregeln } from "../src/agent/systemregeln.js";

test("jede Agenten-Lage traegt die Sprachregel (Chat, Web, Code, Sprachmodus)", () => {
  for (const lage of [{}, { webContext: "x" }, { codingTask: true }, { voiceMode: true }]) {
    const zeilen = baueSystemregeln(lage).join("\n");
    assert.match(zeilen, /SPRACHE: Antworte immer in derselben Sprache wie die letzte Nachricht des Nutzers/, JSON.stringify(lage));
    assert.match(zeilen, /Uebersetzung/);
  }
});
