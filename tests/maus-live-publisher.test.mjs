// smejj.com — Maus-Engine Live-Fortschritt (Stufe B, freigegeben 2026-07-15).
// Prueft: korrekter Capsule-Pfad, kleiner maskierter Status, gedrosselte
// Screenshots und vor allem die FAIL-SAFE-Regel: ein Fehler beim
// Veroeffentlichen darf den Lauf niemals stoeren.
import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createLivePublisher, buildLiveStatus, liveResultPrefix } from "../workers/maus-engine/live-publisher.mjs";

function collector() {
  const puts = [];
  return { puts, putObject: async (key, body, contentType) => { puts.push({ key, body, contentType }); } };
}

test("live status lands in the capsule result prefix", () => {
  assert.equal(
    liveResultPrefix("maus-demo-2026-07-15", "httpbin-form-post-demo"),
    "capsules/maus-engine/maus-demo-2026-07-15/result/httpbin-form-post-demo"
  );
});

test("live status is small, versioned and carries only masked step data", () => {
  const status = buildLiveStatus({
    entry: { index: 3, id: "s4", action: "type", params: { text: "smejj" }, ok: true, durationMs: 12 },
    index: 3,
    total: 10,
    startedAt: "2026-07-15T18:00:00.000Z"
  });
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.stepIndex, 3);
  assert.equal(status.stepTotal, 10);
  assert.equal(status.finished, false);
  assert.equal(status.step.action, "type");
  assert.equal(status.step.params.text, "smejj");
  assert.ok(JSON.stringify(status).length < 1024, "Live-Status muss winzig bleiben");
});

test("onStep writes status.json into the capsule", async () => {
  const { puts, putObject } = collector();
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 2, putObject });
  await publisher.onStep({ entry: { index: 0, action: "navigate", params: { url: "https://httpbin.org" }, ok: true }, index: 0, artifacts: [] });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, "capsules/maus-engine/c1/result/p1/live/status.json");
  assert.equal(puts[0].contentType, "application/json");
  const body = JSON.parse(puts[0].body.toString());
  assert.equal(body.step.action, "navigate");
  assert.equal(body.stepTotal, 2);
});

test("screenshot steps also publish the image gzip-compressed, throttled to once per 2s", async () => {
  const { puts, putObject } = collector();
  let now = 10000;
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 3, putObject, clock: { now: () => now } });
  const artifacts = [{ name: "screenshots/shot-a.png", data: Buffer.from("PNGDATA-A"), contentType: "image/png" }];
  await publisher.onStep({ entry: { index: 0, action: "screenshot", params: { name: "shot-a" }, ok: true }, index: 0, artifacts });
  const shot = puts.find((p) => p.key.includes("/live/shots/"));
  assert.ok(shot, "Screenshot muss veroeffentlicht werden");
  assert.equal(shot.key, "capsules/maus-engine/c1/result/p1/live/shots/shot-a.png.gz");
  assert.equal(gunzipSync(shot.body).toString(), "PNGDATA-A");

  // zweiter Screenshot innerhalb von 2 s -> gedrosselt (kein zweiter Upload)
  puts.length = 0;
  artifacts.push({ name: "screenshots/shot-b.png", data: Buffer.from("PNGDATA-B"), contentType: "image/png" });
  await publisher.onStep({ entry: { index: 1, action: "screenshot", params: { name: "shot-b" }, ok: true }, index: 1, artifacts });
  assert.equal(puts.filter((p) => p.key.includes("/live/shots/")).length, 0, "Drosselung greift");

  // nach 2 s -> wieder erlaubt
  now += 2500;
  puts.length = 0;
  await publisher.onStep({ entry: { index: 2, action: "screenshot", params: { name: "shot-b" }, ok: true }, index: 2, artifacts });
  assert.equal(puts.filter((p) => p.key.includes("/live/shots/")).length, 1);
});

test("the same screenshot is never uploaded twice", async () => {
  const { puts, putObject } = collector();
  let now = 0;
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 2, putObject, clock: { now: () => (now += 5000) } });
  const artifacts = [{ name: "screenshots/same.png", data: Buffer.from("X"), contentType: "image/png" }];
  await publisher.onStep({ entry: { index: 0, action: "screenshot", params: { name: "same" }, ok: true }, index: 0, artifacts });
  await publisher.onStep({ entry: { index: 1, action: "screenshot", params: { name: "same" }, ok: true }, index: 1, artifacts });
  assert.equal(puts.filter((p) => p.key.includes("/live/shots/")).length, 1);
});

test("FAIL-SAFE: a failing upload never throws — the run must not be disturbed", async () => {
  const publisher = createLivePublisher({
    capsuleRef: "c1",
    planId: "p1",
    total: 1,
    putObject: async () => { throw new Error("e2_nicht_erreichbar"); }
  });
  await publisher.onStep({ entry: { index: 0, action: "click", params: {}, ok: true }, index: 0, artifacts: [] });
  await publisher.finish({ ok: true });
  // kein throw = bestanden
});

test("without config and putObject the publisher stays silent (tests, local runs)", async () => {
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 1 });
  await publisher.onStep({ entry: { index: 0, action: "click", params: {}, ok: true }, index: 0, artifacts: [] });
  await publisher.finish({ ok: true });
  // kein throw, keine Netzwerkarbeit = bestanden
});

test("finish writes the final state so the view can switch to full replay", async () => {
  const { puts, putObject } = collector();
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 4, putObject });
  await publisher.finish({ ok: true, lastIndex: 3 });
  const body = JSON.parse(puts.at(-1).body.toString());
  assert.equal(body.finished, true);
  assert.equal(body.ok, true);
  assert.equal(body.stepIndex, 3);
});

test("finish reports an abort reason (allowlist/budget) for the viewer", async () => {
  const { puts, putObject } = collector();
  const publisher = createLivePublisher({ capsuleRef: "c1", planId: "p1", total: 4, putObject });
  await publisher.finish({ ok: false, abortReason: "Host nicht in Domain-Allowlist: example.com", lastIndex: 1 });
  const body = JSON.parse(puts.at(-1).body.toString());
  assert.equal(body.finished, true);
  assert.equal(body.ok, false);
  assert.match(body.abortReason, /Domain-Allowlist/);
});

test("unsafe capsule refs cannot escape: slashes are neutralised, prefix stays inside the capsule", () => {
  const prefix = liveResultPrefix("../../etc", "../passwd");
  // Schraegstriche werden ersetzt -> kein Verzeichniswechsel moeglich.
  assert.equal(prefix, "capsules/maus-engine/..-..-etc/result/..-passwd");
  assert.ok(prefix.startsWith("capsules/maus-engine/"), "bleibt im Capsule-Bereich");
  assert.ok(!prefix.includes("../"), "kein Traversal-Segment");
});

test("unsafe keys are rejected by assertSafeObjectKey and skipped fail-safe (no upload, no throw)", async () => {
  const { puts, putObject } = collector();
  // capsuleRef mit ".." erzeugt einen Key, den assertSafeObjectKey ablehnt.
  const publisher = createLivePublisher({ capsuleRef: "../../etc", planId: "p1", total: 1, putObject });
  await publisher.onStep({ entry: { index: 0, action: "click", params: {}, ok: true }, index: 0, artifacts: [] });
  await publisher.finish({ ok: true });
  assert.equal(puts.length, 0, "unsicherer Key darf NICHT hochgeladen werden");
  // kein throw = fail-safe bestanden
});
