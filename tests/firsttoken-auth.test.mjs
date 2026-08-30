// smejj.com — Test: die First-Token-Probe gibt einen Anmelde-Token NUR als
// Bearer-Header weiter und bleibt ohne Token rein anonym (fail-closed).
// Netzfrei: fetch ist injiziert und faengt den Aufruf ab.
import test from "node:test";
import assert from "node:assert/strict";
import { probeFirstToken } from "../src/evaluation/firstTokenProbe.js";

function baueFetchFalle() {
  const aufrufe = [];
  const fetchFalle = async (url, init) => {
    aufrufe.push({ url, headers: { ...init.headers } });
    return new Response(JSON.stringify({ fehler: "test" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  return { aufrufe, fetchFalle };
}

test("mit Token: Authorization-Bearer-Kopf wird gesetzt", async () => {
  const { aufrufe, fetchFalle } = baueFetchFalle();
  await probeFirstToken({
    endpoint: "https://smejj-chat-bridge.zeabur.app/api/chat",
    messages: [{ role: "user", content: "probe" }],
    authToken: "geheim-nicht-in-berichten",
    fetchImpl: fetchFalle
  });
  assert.equal(aufrufe.length, 1, "genau ein Abruf");
  assert.equal(
    aufrufe[0].headers.Authorization,
    "Bearer geheim-nicht-in-berichten",
    "Token wandert nur in den Authorization-Kopf"
  );
  assert.equal(aufrufe[0].headers.Origin, "https://smejj.com", "Origin bleibt gesetzt");
});

test("ohne Token: kein Authorization-Kopf, fail-closed anonym", async () => {
  const { aufrufe, fetchFalle } = baueFetchFalle();
  await probeFirstToken({
    endpoint: "https://smejj-chat-bridge.zeabur.app/api/chat",
    messages: [{ role: "user", content: "probe" }],
    fetchImpl: fetchFalle
  });
  assert.equal(aufrufe.length, 1, "genau ein Abruf");
  assert.equal(
    Object.prototype.hasOwnProperty.call(aufrufe[0].headers, "Authorization"),
    false,
    "ohne Token darf kein Authorization-Kopf entstehen"
  );
});
