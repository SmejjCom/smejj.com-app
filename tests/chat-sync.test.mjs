// Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md): Server-Bausteine.
import test from "node:test";
import assert from "node:assert/strict";
import {
  chatKennungGueltig,
  konfliktSieger,
  kontoKennung,
  pruefeChat,
  schluessel,
  syncAktiv
} from "../control-server/src/chats/chatSyncStore.js";
import { createChatSyncRoutes } from "../control-server/src/routes/chatSyncRoutes.js";

test("syncAktiv: aus ohne Flag, an mit Flag", () => {
  assert.equal(syncAktiv({}), false);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "0" }), false);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "1" }), true);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "true" }), true);
});

test("kontoKennung: stabil, dateisicher, leere Sitzung ergibt leer", () => {
  // Stabil: dieselbe Adresse ergibt immer denselben Ordner, unabhaengig von
  // Gross-/Kleinschreibung und Leerzeichen — sonst verlaere ein Nutzer beim
  // naechsten Anmelden seinen Verlauf.
  const a = kontoKennung({ email: "SmejjCom@Gmail.com" });
  assert.equal(a, kontoKennung({ email: "  smejjcom@gmail.com  " }));
  assert.match(a, /^user_[0-9a-f]{32}$/, "Kennung ist nicht dateisicher");
  assert.equal(kontoKennung({}), "");
  assert.equal(kontoKennung(null), "");
});

test("kontoKennung: VERSCHIEDENE Konten bekommen NIE denselben Ordner", () => {
  // BEFUND 2026-08-15: die alte Regel ersetzte jedes Sonderzeichen durch "_".
  // Diese fuenf Adressen ergaben damit alle `user_max_mustermann_example_com`
  // — wer sich mit der Bindestrich-Schreibweise anmeldete, las und ueberschrieb
  // die Gespraeche desjenigen mit der Punkt-Schreibweise.
  //
  // Das ist die kaputte Probe zum Waechter: mit der alten Regel faellt dieser
  // Test um, mit der neuen nicht.
  const konten = [
    "max.mustermann@example.com",
    "max-mustermann@example.com",
    "max_mustermann@example.com",
    "max+mustermann@example.com",
    "maxmustermann@example.com",
    "max.mustermann@example.co",
    "max.mustermann@examples.com"
  ];
  const kennungen = konten.map((email) => kontoKennung({ email }));
  assert.equal(new Set(kennungen).size, konten.length,
    `Kollision: ${konten.length} Konten ergaben nur ${new Set(kennungen).size} Ordner`);

  // Auch quer ueber die beiden Quellen (E-Mail und Konto-ID) darf nichts
  // zusammenfallen: sonst uebernaehme eine ID den Ordner einer Adresse.
  assert.notEqual(kontoKennung({ email: "abc" }), kontoKennung({ userId: "abc" }));
});

test("kontoKennung: die Adresse steht NICHT mehr im Ablagepfad", () => {
  // Nebengewinn der Umstellung: wer die Dateiliste des Eimers sieht, sieht
  // keine Postfaecher mehr. Datenminimierung, ohne dass es etwas kostet.
  const kennung = kontoKennung({ email: "geheim.person@example.com" });
  assert.ok(!kennung.includes("geheim"), "die Adresse steckt noch im Pfad");
  assert.ok(!kennung.includes("example"), "die Domain steckt noch im Pfad");
});

test("chatKennungGueltig: Pfad-Tricks werden abgewiesen", () => {
  assert.equal(chatKennungGueltig("chat_1786_abc"), true);
  assert.equal(chatKennungGueltig("../fremd"), false);
  assert.equal(chatKennungGueltig("a/b"), false);
  assert.equal(chatKennungGueltig(""), false);
  assert.equal(chatKennungGueltig("x".repeat(65)), false);
});

test("schluessel: chats/<konto>/<chat>.json", () => {
  assert.equal(schluessel("user_a", "chat_1"), "chats/user_a/chat_1.json");
});

test("pruefeChat: verlangt Kennung, Nachrichten, Zeitstempel und Groessendeckel", () => {
  const gut = { id: "chat_1", messages: [], updatedAt: new Date().toISOString() };
  assert.equal(pruefeChat(gut).ok, true);
  assert.equal(pruefeChat(null).ok, false);
  assert.equal(pruefeChat({ ...gut, id: "../x" }).error, "chat_id_ungueltig");
  assert.equal(pruefeChat({ ...gut, messages: "nein" }).error, "nachrichten_fehlen");
  assert.equal(pruefeChat({ ...gut, updatedAt: "gestern" }).error, "zeitstempel_ungueltig");
  const dick = { ...gut, messages: [{ text: "x".repeat(600 * 1024) }] };
  assert.equal(pruefeChat(dick).error, "chat_zu_gross");
});

test("konfliktSieger: juengerer Stand gewinnt, Gleichstand tut nichts", () => {
  assert.equal(konfliktSieger("2026-08-13T10:00:00Z", "2026-08-13T09:00:00Z"), "neu");
  assert.equal(konfliktSieger("2026-08-13T09:00:00Z", "2026-08-13T10:00:00Z"), "server");
  assert.equal(konfliktSieger("2026-08-13T10:00:00Z", "2026-08-13T10:00:00Z"), "gleich");
  assert.equal(konfliktSieger("kaputt", "2026-08-13T10:00:00Z"), "server");
});

test("loescheChat schreibt einen Grabstein (kein S3-Delete: Schluessel darf nicht, und Loeschung muss sich verbreiten)", async () => {
  const { loescheChat } = await import("../control-server/src/chats/chatSyncStore.js");
  const env = { IDRIVE_E2_ENDPOINT: "https://e2.example.com", IDRIVE_E2_ACCESS_KEY: "a", IDRIVE_E2_SECRET_KEY: "s", IDRIVE_E2_BUCKET: "smejj-app" };
  const anfragen = [];
  const fetchImpl = async (url, init) => { anfragen.push({ url: String(url), method: init?.method, body: init?.body }); return { ok: true, status: 200, text: async () => "" }; };
  const ergebnis = await loescheChat({ kontoId: "user_a", chatId: "chat_1", env, fetchImpl, jetztMs: Date.parse("2026-08-13T12:00:00Z") });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.grabstein, true);
  assert.equal(anfragen.length, 1);
  assert.equal(anfragen[0].method, "PUT");
  assert.match(anfragen[0].url, /chats\/user_a\/chat_1\.json/);
  const rumpf = JSON.parse(String(anfragen[0].body));
  assert.equal(rumpf.geloescht, true);
  assert.equal(rumpf.messages.length, 0); // Inhalt ist wirklich weg
  assert.equal(rumpf.updatedAt, "2026-08-13T12:00:00.000Z");
  // Und der Grabstein gewinnt gegen jeden aelteren Push:
  assert.equal(konfliktSieger("2026-08-13T11:59:00Z", rumpf.updatedAt), "server");
});

// ---- Routen: Sitzung ist Pflicht, Kontokennung kommt NIE aus der Anfrage ----

function fakeRes() {
  return { status: 0, payload: null };
}
function fakeJson(res, status, payload) { res.status = status; res.payload = payload; }

test("Route: ohne Flag ehrlich 503", async () => {
  const routen = createChatSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/chats"));
  assert.equal(behandelt, true);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "chat_sync_deaktiviert");
});

test("Route: ohne Sitzung 401 — auch wenn der Rumpf eine userId behauptet", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => null,
    json: fakeJson,
    readJson: async () => ({ chat: { id: "chat_1", messages: [], updatedAt: new Date().toISOString(), ownerId: "user_fremd" } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/chats"));
  assert.equal(res.status, 401);
});

test("Route: PUT mit kaputtem Chat wird mit 400 abgewiesen", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({ chat: { id: "../boese", messages: [], updatedAt: new Date().toISOString() } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/chats"));
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "chat_id_ungueltig");
});

test("Route: DELETE prueft die Kennung, fremde Pfade kommen nicht durch", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({})
  });
  const res = fakeRes();
  await routen.handle({ method: "DELETE" }, res, new URL("https://x/api/chats?id=../fremd"));
  assert.equal(res.status, 400);
});

test("Route: andere Pfade bleiben unberuehrt", async () => {
  const routen = createChatSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/health"));
  assert.equal(behandelt, false);
  assert.equal(res.status, 0);
});
