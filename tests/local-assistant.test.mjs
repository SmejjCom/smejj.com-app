// smejj.com — Tests fuer den modelllosen Rueckfall (Graceful Degradation).
//
// Zusage: Faellt der Modellpfad aus, bleibt die Seite bedienbar und antwortet
// verstaendlich — statt einen Fehler zu zeigen. Nach der Aufteilung vom
// 2026-07-28 lebt dieser Pfad in control-server/src/llm/localAssistant.js.

import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalAssistantReply, latestUserMessage, localAssistantStream } from "../control-server/src/llm/localAssistant.js";

function fakeRes() {
  const stuecke = [];
  return { kopf: null, writeHead(code, h) { this.kopf = { code, h }; }, write: (t) => stuecke.push(t), end() {}, text: () => stuecke.join("") };
}

test("Rueckfall streamt eine Antwort im erwarteten Format", () => {
  const res = fakeRes();
  localAssistantStream(res, [{ role: "user", content: "Hallo" }]);
  assert.equal(res.kopf.code, 200);
  assert.match(res.kopf.h["Content-Type"], /text\/event-stream/);
  assert.match(res.text(), /^data: /m);
  assert.match(res.text(), /data: \[DONE\]/);
});

test("Begruessung, Coding und Modellfragen bekommen passende Antworten", () => {
  const gruss = buildLocalAssistantReply({ prompt: "Hallo", wantsGreeting: true, wantsCode: false, wantsModel: false });
  const code = buildLocalAssistantReply({ prompt: "Fix den Bug", wantsGreeting: false, wantsCode: true, wantsModel: false });
  assert.notEqual(gruss, code, "unterschiedliche Absichten brauchen unterschiedliche Antworten");
  for (const antwort of [gruss, code]) assert.ok(antwort.length > 20);
});

test("leere Eingabe fuehrt nie zu einer leeren Antwort", () => {
  const antwort = buildLocalAssistantReply({ prompt: "", wantsGreeting: false, wantsCode: false, wantsModel: false });
  assert.ok(antwort.trim().length > 20);
});

test("latestUserMessage liest die letzte Nutzerzeile", () => {
  assert.equal(latestUserMessage([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }]), "c");
  assert.equal(latestUserMessage([]), "");
});
