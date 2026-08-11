import assert from "node:assert/strict";
import test from "node:test";

import { leseBildAnhang, streamVisionLane } from "../public/chat-bridge-vision.js";

const MAX = 1024 * 1024;
const MINI_JPEG = `data:image/jpeg;base64,${"A".repeat(400)}`;

test("leseBildAnhang nimmt nur base64-data:-URLs mit Bild-MIME", () => {
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: MINI_JPEG } }, MAX), MINI_JPEG);
  const png = MINI_JPEG.replace("image/jpeg", "image/png");
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: png } }, MAX), png);
});

test("leseBildAnhang weist alles andere fail-safe mit '' ab", () => {
  // Fremde URL: darf NIE zum Modell durchgereicht werden (SSRF/Injektion).
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: "https://boese.example/x.jpg" } }, MAX), "");
  // Falscher MIME-Typ (SVG kann Skripte tragen).
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: "data:image/svg+xml;base64,AAAA" } }, MAX), "");
  // Kein base64 / Muell im Payload.
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: "data:image/jpeg;base64,%%%" } }, MAX), "");
  // Ueber dem Deckel.
  assert.equal(leseBildAnhang({ preferences: { bildDataUrl: MINI_JPEG } }, 100), "");
  // Fehlende Struktur.
  assert.equal(leseBildAnhang({}, MAX), "");
  assert.equal(leseBildAnhang(null, MAX), "");
});

test("streamVisionLane: ohne Bild-Anhang false, ohne ein einziges gesendetes Byte", async () => {
  let geschrieben = false;
  const res = { writeHead: () => { geschrieben = true; }, end: () => { geschrieben = true; } };
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 1000, maxBodyBytes: MAX };
  assert.equal(await streamVisionLane(res, { preferences: {} }, "Frage", deps), false);
  assert.equal(await streamVisionLane(res, { preferences: { bildDataUrl: "https://x/y.jpg" } }, "Frage", deps), false);
  assert.equal(geschrieben, false, "bei false darf kein Byte gesendet sein — der Text-Weg uebernimmt");
});
