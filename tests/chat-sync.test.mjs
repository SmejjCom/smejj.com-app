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

test("kontoKennung: gleiche Regel wie das Frontend, leere Sitzung ergibt leer", () => {
  assert.equal(kontoKennung({ email: "SmejjCom@Gmail.com" }), "user_smejjcom_gmail_com");
  assert.equal(kontoKennung({ email: "smejjcom+test@gmail.com" }), "user_smejjcom_test_gmail_com");
  assert.equal(kontoKennung({}), "");
  assert.equal(kontoKennung(null), "");
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

// --- Der stille Datenverlust ist abgestellt (Befund 2026-08-14) -------------
//
// Bis heute prueften beide Sende-Wege in public/chat-sync.js NUR auf 503. Ein
// 400 — "diesen Chat nehme ich nicht" — fiel durch das catch und war fuer
// niemanden sichtbar. Gemessen: jeder Chat mit einem erzeugten Bild lag mit
// ~585 KB ueber dem 512-KB-Deckel und wurde KOMPLETT abgewiesen, waehrend der
// Nutzer ihn fuer gesichert hielt.
//
// Geprueft wird die QUELLE: chat-sync.js laeuft nur im Browser (fetch,
// localStorage, dynamischer Import), ein Modulimport waere hier kein Test der
// echten Datei, sondern eines Nachbaus.

import { readFileSync } from "node:fs";

const SYNC_QUELLE = readFileSync("public/chat-sync.js", "utf8");

test("eine 4xx-Ablehnung wird gemeldet statt verschluckt — auf BEIDEN Sende-Wegen", () => {
  const meldungen = SYNC_QUELLE.match(/await meldeAbweisung\(/g) || [];
  assert.equal(meldungen.length, 2, "Chat-Push und Projekte-Push muessen beide melden");
  assert.match(SYNC_QUELLE, /antwort\.status >= 400 && antwort\.status < 500/,
    "der ganze 4xx-Bereich zaehlt, nicht nur die 400 selbst");
});

test("die Meldung nennt beim Groessen-Fall den KLARTEXT, nicht den Fehlercode", () => {
  // "chat_zu_gross" sagt einem Nutzer nichts. Er muss erfahren, was das fuer
  // ihn bedeutet: der Chat liegt nur noch auf diesem Geraet.
  assert.match(SYNC_QUELLE, /grund === "chat_zu_gross"/);
  assert.match(SYNC_QUELLE, /zu gross und wurde NICHT gesichert/);
  assert.match(SYNC_QUELLE, /nur auf diesem Geraet/);
});

test("gemeldet wird EINMAL je Chat — push() laeuft nach jeder Aenderung", () => {
  // Ohne Bremse gaebe es alle vier Sekunden (PUSH_ENTPRELLUNG_MS) denselben
  // Hinweis; nach dem dritten wuerde ihn niemand mehr lesen.
  assert.match(SYNC_QUELLE, /const abgewiesen = new Set\(\)/);
  assert.match(SYNC_QUELLE, /if \(abgewiesen\.has\(kennung\)\) return;\s*\n\s*abgewiesen\.add\(kennung\);/,
    "erst pruefen, dann merken — sonst meldet der zweite Aufruf erneut");
});

test("503 bleibt der Abschalter, 4xx bricht die Schleife NICHT ab", () => {
  // Ein zu grosser Chat darf die uebrigen nicht mitreissen: nach der Meldung
  // laeuft die Schleife weiter, nur 503 setzt den Sitzungs-Schalter.
  assert.match(SYNC_QUELLE, /if \(antwort\.status === 503\) \{ serverSagtNein = true; break; \}/);
  // HINTER dem gefundenen break beginnen — sonst zaehlt der Test genau das
  // break mit, das er sucht (erster Entwurf lief prompt hinein).
  const marke = "serverSagtNein = true; break; }";
  const nachDem503 = SYNC_QUELLE.slice(SYNC_QUELLE.indexOf(marke) + marke.length);
  const bis4xx = nachDem503.slice(0, nachDem503.indexOf("meldeAbweisung"));
  assert.ok(!bis4xx.includes("break"), "zwischen 503 und der 4xx-Meldung darf kein weiteres break stehen");
});

test("scheitert sogar der Hinweis, bleibt der Grund auffindbar", () => {
  // Der Import des Toasts kann fehlschlagen (Modul nicht geladen, CSP). Dann
  // muss der Grund wenigstens in der Konsole stehen — genau die Stille war
  // ja der Fehler.
  assert.match(SYNC_QUELLE, /catch \{[\s\S]{0,400}console\.warn\(/);
  assert.match(SYNC_QUELLE, /smejj Verlauf-Sync: Chat \$\{kennung\} abgewiesen/);
});

test("der Grund wird aus einer KOPIE der Antwort gelesen", () => {
  // antwort.json() wuerde den Rumpf verbrauchen; ein spaeterer Leser bekaeme
  // nichts mehr. clone() haelt beide Wege offen.
  assert.match(SYNC_QUELLE, /await antwort\.clone\(\)\.json\(\)/);
});
