// smejj.com — Live-Bild der Maus-Engine (Weg A).
//
// Geprueft wird die Logik, die man ohne Browser pruefen KANN und die erfahrungs-
// gemaess bricht: Bestaetigung jedes Einzelbilds, Drosselung auf die Bildrate,
// harte Obergrenze, sauberes Beenden und die Fail-safe-Zusage.
import test from "node:test";
import assert from "node:assert/strict";
import { createScreencast, resolveLiveFps } from "../workers/maus-engine/screencast.mjs";

// Minimale CDP-Attrappe: merkt sich Aufrufe und laesst Einzelbilder einspeisen.
function fakeSession({ startFails = false } = {}) {
  const gesendet = [];
  const listener = new Map();
  return {
    gesendet,
    on(event, fn) { listener.set(event, fn); },
    off(event) { listener.delete(event); },
    hatListener(event) { return listener.has(event); },
    async send(method, params) {
      gesendet.push({ method, params });
      if (method === "Page.startScreencast" && startFails) throw new Error("kein Screencast");
      return {};
    },
    async bildEinspeisen(frame) {
      const fn = listener.get("Page.screencastFrame");
      if (fn) await fn(frame);
    }
  };
}

function fakeClock(start = 0) {
  let jetzt = start;
  return { now: () => jetzt, vor: (ms) => { jetzt += ms; } };
}

function bild(nr) {
  return { sessionId: nr, data: Buffer.from(`bild-${nr}`).toString("base64") };
}

test("jedes Einzelbild wird bestaetigt — auch ein verworfenes", async () => {
  // Ohne Ack stellt Chrome den Strom nach wenigen Bildern ein. Das ist die
  // haeufigste Ursache fuer "Live-Bild bleibt nach 2 Sekunden stehen".
  const session = fakeSession();
  const clock = fakeClock(1000);
  const cast = createScreencast({ fps: 1, publish: async () => {}, clock });
  await cast.start(session);

  await session.bildEinspeisen(bild(1));
  await session.bildEinspeisen(bild(2)); // zu frueh -> verworfen, aber bestaetigt
  await session.bildEinspeisen(bild(3)); // ebenso

  const acks = session.gesendet.filter((a) => a.method === "Page.screencastFrameAck");
  assert.equal(acks.length, 3, "alle drei Bilder muessen bestaetigt sein");
  assert.deepEqual(acks.map((a) => a.params.sessionId), [1, 2, 3]);
  assert.equal(cast.stats.empfangen, 3);
  assert.equal(cast.stats.verworfen, 2);
});

test("Drosselung haelt die Bildrate ein", async () => {
  const session = fakeSession();
  const clock = fakeClock(1000);
  const veroeffentlicht = [];
  const cast = createScreencast({ fps: 2, publish: async (b) => veroeffentlicht.push(b), clock });
  await cast.start(session);

  await session.bildEinspeisen(bild(1));   // erstes Bild kommt sofort durch
  clock.vor(200);
  await session.bildEinspeisen(bild(2));   // 200 ms < 500 ms -> verworfen
  clock.vor(400);
  await session.bildEinspeisen(bild(3));   // 600 ms seit dem letzten -> durch

  assert.equal(veroeffentlicht.length, 2);
  assert.equal(veroeffentlicht[0].toString(), "bild-1");
  assert.equal(veroeffentlicht[1].toString(), "bild-3");
});

test("Fehler beim Veroeffentlichen beenden den Lauf nicht", async () => {
  const session = fakeSession();
  const clock = fakeClock(1000);
  const cast = createScreencast({ fps: 1, publish: async () => { throw new Error("e2 weg"); }, clock });
  await cast.start(session);

  await assert.doesNotReject(session.bildEinspeisen(bild(1)));
  assert.equal(cast.stats.fehler, 1);
  assert.equal(cast.stats.veroeffentlicht, 0);
  // Trotz Fehler weiter bestaetigen, sonst stirbt der Strom.
  assert.equal(session.gesendet.filter((a) => a.method === "Page.screencastFrameAck").length, 1);
});

test("start scheitert leise und hinterlaesst keinen Listener", async () => {
  const session = fakeSession({ startFails: true });
  const cast = createScreencast({ fps: 2, publish: async () => {} });
  assert.equal(await cast.start(session), false);
  assert.equal(cast.aktiv, false);
  assert.equal(session.hatListener("Page.screencastFrame"), false, "Listener muss abgeraeumt sein");
});

test("stop haelt den Strom an und raeumt auf", async () => {
  const session = fakeSession();
  const cast = createScreencast({ fps: 2, publish: async () => {} });
  await cast.start(session);
  assert.equal(cast.aktiv, true);

  assert.equal(await cast.stop(), true);
  assert.equal(cast.aktiv, false);
  assert.ok(session.gesendet.some((a) => a.method === "Page.stopScreencast"));
  assert.equal(session.hatListener("Page.screencastFrame"), false);
  assert.equal(await cast.stop(), false, "zweites stop ist wirkungslos, nicht fehlerhaft");
});

test("fps 0 schaltet die Funktion vollstaendig aus", async () => {
  const session = fakeSession();
  const cast = createScreencast({ fps: 0, publish: async () => {} });
  assert.equal(await cast.start(session), false);
  assert.equal(session.gesendet.length, 0, "ohne Bildrate darf gar nichts gesendet werden");
});

test("resolveLiveFps ist fail-closed und hart gedeckelt", () => {
  assert.equal(resolveLiveFps({}), 0, "ohne Variable bleibt die Funktion aus");
  assert.equal(resolveLiveFps({ SMEJJ_MAUS_LIVE_FPS: "" }), 0);
  assert.equal(resolveLiveFps({ SMEJJ_MAUS_LIVE_FPS: "kaputt" }), 0);
  assert.equal(resolveLiveFps({ SMEJJ_MAUS_LIVE_FPS: "-5" }), 0);
  assert.equal(resolveLiveFps({ SMEJJ_MAUS_LIVE_FPS: "3" }), 3);
  assert.equal(resolveLiveFps({ SMEJJ_MAUS_LIVE_FPS: "999" }), 10, "Obergrenze schuetzt vor Kostenlawine");
});
