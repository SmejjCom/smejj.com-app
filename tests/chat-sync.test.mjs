// Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md): Server-Bausteine.
import test from "node:test";
import assert from "node:assert/strict";
import {
  chatKennungGueltig,
  konfliktSieger,
  kontoKennung,
  ladeChat,
  ladeChats,
  ohneNachrichten,
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
  // Seit dem Konto-Index (2026-08-20) wird zusaetzlich der Index nachgetragen —
  // sonst truege er weiter den alten Zeitstempel und die Loeschung erreichte das
  // zweite Geraet nie. Entscheidend bleibt: KEIN DELETE, und genau EIN Schreiben
  // auf die Chat-Datei.
  assert.equal(anfragen.some((a) => a.method === "DELETE"), false, "der Schluessel darf nicht loeschen");
  const aufChatDatei = anfragen.filter((a) => /chats\/user_a\/chat_1\.json/.test(a.url));
  assert.equal(aufChatDatei.length, 1);
  assert.equal(aufChatDatei[0].method, "PUT");
  // Der Index wurde gelesen; geschrieben wird er hier nicht, weil das Doppel
  // einen leeren Rumpf liefert — ein unlesbarer Index wird neu gebaut, wo die
  // Chats ohnehin vorliegen (Lesepfad), nicht im Loeschen.
  assert.equal(anfragen.some((a) => /_index\.json/.test(a.url) && a.method !== "PUT"), true);
  const rumpf = JSON.parse(String(aufChatDatei[0].body));
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

// ---------------------------------------------------------------------------
// KLEINE LISTE — gefunden durch die Performance-Messung am 2026-08-19.
//
// `/api/chats` lieferte 2,50 MB bei 88 Chats, weil jeder Eintrag sein
// komplettes `messages`-Feld mitschleppte, bei JEDEM Seitenaufruf und ungecacht.
// Das waren 65 % des Seitengewichts und brach Static-First.
//
// Die Tests sichern beide Seiten ab: die Liste muss klein werden, UND der alte
// Vertrag muss unveraendert bleiben — sonst importiert ein Client aus dem
// Browser-Cache leere Chats ueber seinen eigenen Verlauf.
// ---------------------------------------------------------------------------
const S3_ENV = {
  SMEJJ_CHAT_SYNC_ENABLED: "1",
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_ACCESS_KEY: "k",
  IDRIVE_E2_SECRET_KEY: "s",
  IDRIVE_E2_BUCKET: "b",
  IDRIVE_E2_REGION: "us-west-2"
};

// Die Attrappe muss liefern, was der echte Signierer liest: signedS3Get nimmt
// `arrayBuffer()` und fragt `headers.get("etag")`. Ein Doppel, das nur `text()`
// kann, laesst die Tests scheitern, obwohl der Code stimmt — genau das ist hier
// beim ersten Anlauf passiert.
function antwort(status, koerper) {
  const bytes = Buffer.from(koerper, "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => koerper,
    arrayBuffer: async () => bytes,
    headers: { get: () => null }
  };
}

function s3Doppel(chats) {
  const liste = chats.map((c) => `<Key>chats/user_a/${c.id}.json</Key>`).join("");
  return async (url) => {
    const text = String(url);
    if (text.includes("list-type")) return antwort(200, `<ListBucketResult>${liste}</ListBucketResult>`);
    const treffer = chats.find((c) => text.includes(`${c.id}.json`));
    if (!treffer) return antwort(404, "");
    return antwort(200, JSON.stringify(treffer));
  };
}

const CHAT_A = { id: "chat_a", ownerId: "user_a", title: "A", updatedAt: "2026-08-19T10:00:00Z", messages: [{ role: "user", content: "x".repeat(500) }, { role: "assistant", content: "y" }] };
const CHAT_B = { id: "chat_b", ownerId: "user_a", title: "B", updatedAt: "2026-08-19T09:00:00Z", messages: [{ role: "user", content: "z" }] };

test("ohneNachrichten nimmt die Nachrichten weg und nennt ihre Anzahl", () => {
  const schlank = ohneNachrichten(CHAT_A);
  assert.equal(schlank.messages, undefined, "genau das war die halbe Megabyte-Last");
  assert.equal(schlank.nachrichtenAnzahl, 2, "die Anzahl bleibt, damit die Liste etwas anzeigen kann");
  assert.equal(schlank.id, "chat_a");
  assert.equal(schlank.updatedAt, "2026-08-19T10:00:00Z", "der Abgleich braucht genau dieses Feld");
  assert.equal(schlank.title, "A");
  // Gegenstueck: Unsinn faellt nicht um.
  assert.equal(ohneNachrichten(null).nachrichtenAnzahl, 0);
});

test("nurListe=true liefert die Liste OHNE Nachrichten", async () => {
  const ergebnis = await ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]), nurListe: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats.length, 2);
  for (const c of ergebnis.chats) assert.equal(c.messages, undefined, "kein Chat darf Nachrichten tragen");
  assert.equal(ergebnis.chats[0].nachrichtenAnzahl, 2);
});

test("die Chat-Liste holt NEBENLAEUFIG — 88 Chats dauern nicht 88 Rundreisen", async () => {
  // Live gemessen 2026-08-20: die Startseite wartete 10,9 s auf ihre Chat-Liste,
  // weil jede Chat-Datei EINZELN geholt wurde. Dieser Test haelt die Heilung
  // fest, ohne auf echte Uhrzeiten zu bauen: er misst die groesste Zahl
  // GLEICHZEITIG offener Anfragen. Nacheinander waere sie 1.
  const viele = Array.from({ length: 88 }, (_, i) => ({
    id: `chat_${String(i).padStart(3, "0")}`, ownerId: "user_a", title: `T${i}`,
    updatedAt: `2026-08-19T10:00:00Z`, messages: [{ role: "user", content: "x" }]
  }));
  const liste = viele.map((c) => `<Key>chats/user_a/${c.id}.json</Key>`).join("");
  let offen = 0;
  let hoechstensGleichzeitig = 0;
  const fetchImpl = async (url) => {
    const text = String(url);
    if (text.includes("list-type")) return antwort(200, `<ListBucketResult>${liste}</ListBucketResult>`);
    offen += 1;
    hoechstensGleichzeitig = Math.max(hoechstensGleichzeitig, offen);
    await new Promise((fertig) => setTimeout(fertig, 1)); // eine Rundreise
    offen -= 1;
    const treffer = viele.find((c) => text.includes(`${c.id}.json`));
    return treffer ? antwort(200, JSON.stringify(treffer)) : antwort(404, "");
  };

  const ergebnis = await ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl, nurListe: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats.length, 88, "kein Chat darf beim Nebenlaeufigmachen verloren gehen");
  assert.ok(hoechstensGleichzeitig > 1, `holte nacheinander (hoechstens ${hoechstensGleichzeitig} gleichzeitig)`);
  assert.ok(hoechstensGleichzeitig <= 16, `zu viele gleichzeitig (${hoechstensGleichzeitig}) — der Server hat 2 vCPU`);
});

test("ein unlesbarer Chat kippt die Liste nicht", async () => {
  // Das leere catch der alten Schleife hatte genau diesen Zweck; mapMitGrenze
  // liefert stattdessen null. Beides muss dasselbe bedeuten: der Rest kommt an.
  const fetchImpl = async (url) => {
    const text = String(url);
    if (text.includes("list-type")) {
      return antwort(200, "<ListBucketResult><Key>chats/user_a/chat_a.json</Key><Key>chats/user_a/kaputt.json</Key></ListBucketResult>");
    }
    if (text.includes("kaputt.json")) return antwort(200, "{ kein gueltiges JSON");
    return antwort(200, JSON.stringify(CHAT_A));
  };
  const ergebnis = await ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats.length, 1, "der lesbare Chat muss ankommen");
  assert.equal(ergebnis.chats[0].id, "chat_a");
});

test("OHNE nurListe bleibt der alte Vertrag unveraendert", async () => {
  // Der wichtigere Test: ein alter Client aus dem Browser-Cache ruft weiterhin
  // /api/chats ohne Parameter. Bekaeme er ploetzlich Chats ohne Nachrichten,
  // importierte er sie leer ueber seinen eigenen Verlauf — Datenverlust,
  // ausgeloest von einem Performance-Fix.
  const ergebnis = await ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]) });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats[0].messages.length, 2, "die Nachrichten muessen da sein");
  assert.equal(ergebnis.chats[0].nachrichtenAnzahl, undefined, "und kein neues Feld dazukommen");
});

test("ladeChat holt genau einen Chat, vollstaendig", async () => {
  const ergebnis = await ladeChat({ kontoId: "user_a", chatId: "chat_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]) });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chat.id, "chat_a");
  assert.equal(ergebnis.chat.messages.length, 2, "hier MUESSEN die Nachrichten kommen");
});

test("ladeChat weist eine ungueltige Kennung ab, statt danach zu suchen", async () => {
  const ergebnis = await ladeChat({ kontoId: "user_a", chatId: "../fremd", env: S3_ENV, fetchImpl: s3Doppel([]) });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "chat_id_ungueltig");
});

test("ladeChat liefert null statt zu werfen, wenn es den Chat nicht gibt", async () => {
  const ergebnis = await ladeChat({ kontoId: "user_a", chatId: "chat_weg", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A]) });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chat, null);
});

test("Route: ?id= liefert einen Chat, ?nurListe=1 die kleine Liste", async () => {
  const bauen = () => createChatSyncRoutes({
    env: S3_ENV,
    readSession: () => ({ userId: "user_a" }),
    json: fakeJson,
    readJson: async () => ({}),
    fetchImpl: s3Doppel([CHAT_A, CHAT_B])
  });

  const einzeln = fakeRes();
  await bauen().handle({ method: "GET" }, einzeln, new URL("https://x/api/chats?id=chat_a"));
  assert.equal(einzeln.status, 200);
  assert.equal(einzeln.payload.chat.messages.length, 2);

  const klein = fakeRes();
  await bauen().handle({ method: "GET" }, klein, new URL("https://x/api/chats?nurListe=1"));
  assert.equal(klein.status, 200);
  assert.equal(klein.payload.chats[0].messages, undefined);

  const alt = fakeRes();
  await bauen().handle({ method: "GET" }, alt, new URL("https://x/api/chats"));
  assert.equal(alt.status, 200);
  assert.ok(Array.isArray(alt.payload.chats[0].messages), "der alte Weg bleibt vollstaendig");
});

test("Route: ?id= mit ungueltiger Kennung gibt 400, nicht 200 mit null", async () => {
  const routen = createChatSyncRoutes({
    env: S3_ENV,
    readSession: () => ({ userId: "user_a" }),
    json: fakeJson,
    readJson: async () => ({}),
    fetchImpl: s3Doppel([])
  });
  const res = fakeRes();
  await routen.handle({ method: "GET" }, res, new URL("https://x/api/chats?id=..%2Ffremd"));
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "chat_id_ungueltig");
});
