// Waechter fuer den Konto-Index.
//
// Der Index ersetzt 92 Abrufe durch einen. Sein Risiko ist genau eines: gilt er
// faelschlich als frisch, erreicht ein auf Geraet A bearbeiteter Chat das
// Geraet B NIE. Die Tests pruefen deshalb vor allem, wann er NICHT benutzt
// werden darf.
import test from "node:test";
import assert from "node:assert/strict";
import {
  INDEX_DATEI,
  INDEX_VERSION,
  baueIndex,
  eintraegeMitZeit,
  indexEintragSetzen,
  indexIstFrisch,
  indexSchluessel,
  istIndexSchluessel,
  leseIndex
} from "../control-server/src/chats/chatIndex.js";

const KONTO = "user_abc";
const INDEX_KEY = indexSchluessel("chats", KONTO);

/** Baut eine ListObjectsV2-Antwort, wie der Objektspeicher sie liefert. */
function liste(eintraege) {
  const bloecke = eintraege
    .map(([key, zeit]) => `<Contents><Key>${key}</Key><LastModified>${zeit}</LastModified><Size>10</Size></Contents>`)
    .join("");
  return `<?xml version="1.0"?><ListBucketResult>${bloecke}</ListBucketResult>`;
}

test("der Index wird am SCHLUESSEL erkannt, nicht an der Kennung", () => {
  assert.equal(indexSchluessel("chats", KONTO), `chats/${KONTO}/${INDEX_DATEI}`);
  assert.equal(istIndexSchluessel(INDEX_KEY), true);
  assert.equal(istIndexSchluessel(`chats/${KONTO}/chat_1.json`), false);
  // Der Grund fuer die Schluessel-Pruefung: "_index" waere eine GUELTIGE
  // Chat-Kennung (Unterstriche sind erlaubt). Wer an der Kennung filtert,
  // laesst den Index als Schein-Chat durch.
  assert.match("_index", /^[A-Za-z0-9_-]{1,64}$/);
});

test("Schluessel und Zeit werden aus der Objektliste gelesen", () => {
  const eintraege = eintraegeMitZeit(liste([
    [`chats/${KONTO}/chat_1.json`, "2026-08-20T10:00:00.000Z"],
    [INDEX_KEY, "2026-08-20T10:00:05.000Z"]
  ]));
  assert.equal(eintraege.length, 2);
  assert.equal(eintraege[0].key, `chats/${KONTO}/chat_1.json`);
  assert.equal(eintraege[0].zeitMs, Date.parse("2026-08-20T10:00:00.000Z"));
  assert.deepEqual(eintraegeMitZeit(""), []);
  assert.deepEqual(eintraegeMitZeit(null), []);
});

test("frisch ist der Index nur, wenn er JUENGER ist als jede Chat-Datei", () => {
  const frisch = eintraegeMitZeit(liste([
    [`chats/${KONTO}/chat_1.json`, "2026-08-20T10:00:00.000Z"],
    [`chats/${KONTO}/chat_2.json`, "2026-08-20T10:00:03.000Z"],
    [INDEX_KEY, "2026-08-20T10:00:05.000Z"]
  ]));
  assert.equal(indexIstFrisch(frisch, INDEX_KEY), true);
});

test("ein spaeter geschriebener Chat macht den Index ungueltig", () => {
  // GENAU DER FALL, DER DATEN KOSTEN WUERDE: das Schreiben des Index schlug
  // fehl, der Chat liegt aber neu im Speicher. Wird er hier fuer frisch
  // gehalten, sieht das zweite Geraet die Aenderung nie.
  const veraltet = eintraegeMitZeit(liste([
    [`chats/${KONTO}/chat_1.json`, "2026-08-20T10:00:09.000Z"],
    [INDEX_KEY, "2026-08-20T10:00:05.000Z"]
  ]));
  assert.equal(indexIstFrisch(veraltet, INDEX_KEY), false);
});

test("gleiche Sekunde zaehlt als NICHT frisch — lieber einmal zuviel bauen", () => {
  // LastModified ist sekundengenau. Bei Gleichstand laesst sich die Reihenfolge
  // nicht beweisen, also wird neu gebaut.
  const gleich = eintraegeMitZeit(liste([
    [`chats/${KONTO}/chat_1.json`, "2026-08-20T10:00:05.000Z"],
    [INDEX_KEY, "2026-08-20T10:00:05.000Z"]
  ]));
  assert.equal(indexIstFrisch(gleich, INDEX_KEY), false);
});

test("fehlt der Index ganz, ist nichts frisch", () => {
  const ohne = eintraegeMitZeit(liste([[`chats/${KONTO}/chat_1.json`, "2026-08-20T10:00:00.000Z"]]));
  assert.equal(indexIstFrisch(ohne, INDEX_KEY), false);
  assert.equal(indexIstFrisch([], INDEX_KEY), false);
});

test("eine unlesbare Zeit gilt als unbekannt, nicht als alt", () => {
  const kaputt = eintraegeMitZeit(liste([
    [`chats/${KONTO}/chat_1.json`, "kein datum"],
    [INDEX_KEY, "2026-08-20T10:00:05.000Z"]
  ]));
  assert.equal(indexIstFrisch(kaputt, INDEX_KEY), false, "unbekannt darf nie als frisch durchgehen");
});

test("ein Konto ohne Chats hat einen frischen Index", () => {
  const leer = eintraegeMitZeit(liste([[INDEX_KEY, "2026-08-20T10:00:05.000Z"]]));
  assert.equal(indexIstFrisch(leer, INDEX_KEY), true);
});

test("der Index traegt den ECHTEN updatedAt, nicht die Hochladezeit", () => {
  const index = baueIndex([
    { id: "chat_1", updatedAt: "2026-08-20T09:59:00.000Z", ownerId: KONTO, messages: [{ role: "user" }] }
  ]);
  assert.equal(index.version, INDEX_VERSION);
  assert.deepEqual(index.chats, [{ id: "chat_1", updatedAt: "2026-08-20T09:59:00.000Z", ownerId: KONTO }]);
  assert.equal("messages" in index.chats[0], false, "Nachrichten gehoeren nie in den Index");
});

test("Chats ohne Kennung kommen nicht in den Index", () => {
  assert.deepEqual(baueIndex([{ updatedAt: "x" }, null, { id: "chat_2", updatedAt: "y" }]).chats,
    [{ id: "chat_2", updatedAt: "y" }]);
  assert.deepEqual(baueIndex(null).chats, []);
});

test("ein kaputter oder fremder Index wird verworfen, nicht geraten", () => {
  assert.equal(leseIndex("{kein json"), null);
  assert.equal(leseIndex(""), null);
  assert.equal(leseIndex(JSON.stringify({ version: 99, chats: [] })), null, "fremde Version");
  assert.equal(leseIndex(JSON.stringify({ version: INDEX_VERSION, chats: "nein" })), null);
  assert.equal(leseIndex(JSON.stringify({ version: INDEX_VERSION, chats: [{ updatedAt: "x" }] })), null,
    "ein Eintrag ohne Kennung macht den ganzen Index unbrauchbar");
  assert.deepEqual(leseIndex(JSON.stringify({ version: INDEX_VERSION, chats: [{ id: "a", updatedAt: "x" }] })),
    [{ id: "a", updatedAt: "x" }]);
});

test("ein Eintrag wird ersetzt, nicht verdoppelt", () => {
  const erst = indexEintragSetzen([], { id: "chat_1", updatedAt: "alt", ownerId: KONTO });
  const dann = indexEintragSetzen(erst, { id: "chat_1", updatedAt: "neu", ownerId: KONTO });
  assert.equal(dann.length, 1);
  assert.equal(dann[0].updatedAt, "neu");
  const zwei = indexEintragSetzen(dann, { id: "chat_2", updatedAt: "x", ownerId: KONTO });
  assert.equal(zwei.length, 2);
});

test("indexEintragSetzen laesst den uebergebenen Index unveraendert", () => {
  const vorher = [{ id: "chat_1", updatedAt: "alt" }];
  const nachher = indexEintragSetzen(vorher, { id: "chat_1", updatedAt: "neu" });
  assert.equal(vorher[0].updatedAt, "alt", "reine Funktion — kein Nebeneffekt");
  assert.equal(nachher[0].updatedAt, "neu");
});

// ---------------------------------------------------------------------------
// DER SPEICHER SELBST — greift der schnelle Weg, und faellt er zuverlaessig
// zurueck? Das Doppel zaehlt die Abrufe: genau daran haengt die Ersparnis.
// ---------------------------------------------------------------------------
const ENV = {
  IDRIVE_E2_ENDPOINT: "https://e2.example.com",
  IDRIVE_E2_ACCESS_KEY: "a",
  IDRIVE_E2_SECRET_KEY: "s",
  IDRIVE_E2_BUCKET: "smejj-app"
};

/**
 * Antwort wie der echte Speicher sie liefert.
 * WICHTIG: `signedS3Get` liest `arrayBuffer()`, nicht `text()` — ein Doppel mit
 * nur `text()` liefert stillschweigend leere Rumpfe, und der Test misst dann
 * etwas anderes, als er zu messen glaubt.
 */
function antwort(status, koerper) {
  const bytes = Buffer.from(String(koerper ?? ""), "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(koerper ?? ""),
    arrayBuffer: async () => bytes,
    headers: { get: () => null }
  };
}

/** S3-Doppel: kennt die Objektliste, den Index und die Chat-Dateien. */
function speicherDoppel({ chats, indexZeit, indexRumpf }) {
  const anfragen = [];
  const bloecke = chats
    .map((c) => `<Contents><Key>chats/user_a/${c.id}.json</Key><LastModified>${c.zeit}</LastModified></Contents>`)
    .join("");
  const indexBlock = indexZeit
    ? `<Contents><Key>chats/user_a/${INDEX_DATEI}</Key><LastModified>${indexZeit}</LastModified></Contents>`
    : "";
  const fetchImpl = async (url, init) => {
    const u = String(url);
    anfragen.push({ url: u, method: init?.method || "GET" });
    if (u.includes("list-type")) return antwort(200, `<ListBucketResult>${bloecke}${indexBlock}</ListBucketResult>`);
    if (u.includes(INDEX_DATEI)) return antwort(200, indexRumpf ?? "");
    const id = (u.match(/(chat_[A-Za-z0-9_]+)\.json/) || [])[1];
    const chat = chats.find((c) => c.id === id);
    return antwort(200, JSON.stringify({ id, updatedAt: chat?.updatedAt, ownerId: "user_a", messages: [{ role: "user", content: "x" }] }));
  };
  return { fetchImpl, anfragen, chatAbrufe: () => anfragen.filter((a) => /chat_[A-Za-z0-9_]+\.json/.test(a.url)).length };
}

test("frischer Index: EIN Abruf statt einem je Chat", async () => {
  const { ladeChats } = await import("../control-server/src/chats/chatSyncStore.js");
  const chats = Array.from({ length: 20 }, (_, i) => ({ id: `chat_${i}`, zeit: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T09:00:00.000Z" }));
  const doppel = speicherDoppel({
    chats,
    indexZeit: "2026-08-20T10:00:09.000Z",
    indexRumpf: JSON.stringify({ version: INDEX_VERSION, chats: chats.map((c) => ({ id: c.id, updatedAt: c.updatedAt, ownerId: "user_a" })) })
  });
  const ergebnis = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.ausIndex, true, "der schnelle Weg haette greifen muessen");
  assert.equal(ergebnis.chats.length, 20);
  assert.equal(doppel.chatAbrufe(), 0, "keine einzige Chat-Datei darf gelesen werden");
  // Und der Index traegt den ECHTEN updatedAt, nicht die Hochladezeit:
  assert.equal(ergebnis.chats[0].updatedAt, "2026-08-20T09:00:00.000Z");
});

test("veralteter Index: alles wird gelesen UND der Index neu geschrieben", async () => {
  const { ladeChats } = await import("../control-server/src/chats/chatSyncStore.js");
  const chats = Array.from({ length: 5 }, (_, i) => ({ id: `chat_${i}`, zeit: "2026-08-20T10:00:09.000Z", updatedAt: "2026-08-20T09:00:00.000Z" }));
  const doppel = speicherDoppel({ chats, indexZeit: "2026-08-20T10:00:00.000Z", indexRumpf: "{}" });
  const ergebnis = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.ausIndex, undefined, "hier darf der schnelle Weg NICHT greifen");
  assert.equal(ergebnis.chats.length, 5);
  assert.equal(doppel.chatAbrufe(), 5, "der regulaere Weg liest jede Datei");
  assert.equal(doppel.anfragen.some((a) => a.method === "PUT" && a.url.includes(INDEX_DATEI)), true,
    "der naechste Aufruf soll mit einem Abruf auskommen");
});

test("unvollstaendiger Index (weniger Eintraege als Dateien) wird neu gebaut", async () => {
  // Live 2026-08-23: Index aus 100 gekappten Chats gebaut, danach nur
  // nachgetragen — fuenf gueltige Chats fehlten dauerhaft, obwohl er nach
  // Zeit "frisch" war.
  const { ladeChats } = await import("../control-server/src/chats/chatSyncStore.js");
  const chats = Array.from({ length: 8 }, (_, i) => ({ id: `chat_${i}`, zeit: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T09:00:00.000Z" }));
  const doppel = speicherDoppel({
    chats,
    indexZeit: "2026-08-20T10:00:09.000Z",
    indexRumpf: JSON.stringify({ version: INDEX_VERSION, chats: chats.slice(0, 5).map((c) => ({ id: c.id, updatedAt: c.updatedAt, ownerId: "user_a" })) })
  });
  const ergebnis = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.ausIndex, undefined, "ein Index mit Luecken darf nicht ausgeliefert werden");
  assert.equal(ergebnis.chats.length, 8, "alle acht Chats, nicht nur die fuenf im Index");
  assert.equal(doppel.chatAbrufe(), 8);
  assert.equal(doppel.anfragen.some((a) => a.method === "PUT" && a.url.includes(INDEX_DATEI)), true, "der Index wird vollstaendig neu geschrieben");
});

test("kaputter Index faellt zurueck, statt halbe Angaben auszuliefern", async () => {
  const { ladeChats } = await import("../control-server/src/chats/chatSyncStore.js");
  const chats = [{ id: "chat_0", zeit: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T09:00:00.000Z" }];
  const doppel = speicherDoppel({ chats, indexZeit: "2026-08-20T10:00:09.000Z", indexRumpf: "{kein json" });
  const ergebnis = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats.length, 1);
  assert.equal(doppel.chatAbrufe(), 1, "lieber alles lesen als raten");
});

test("der Index taucht NIE als Chat in der Antwort auf", async () => {
  const { ladeChats } = await import("../control-server/src/chats/chatSyncStore.js");
  const chats = [{ id: "chat_0", zeit: "2026-08-20T10:00:09.000Z", updatedAt: "2026-08-20T09:00:00.000Z" }];
  // Index ist veraltet -> regulaerer Weg -> die Schluesselliste enthaelt ihn.
  const doppel = speicherDoppel({ chats, indexZeit: "2026-08-20T10:00:00.000Z", indexRumpf: "{}" });
  const ergebnis = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl });
  assert.equal(ergebnis.chats.length, 1, "nur der echte Chat");
  assert.equal(ergebnis.chats.every((c) => c.id && c.id !== "_index"), true);
  assert.equal(doppel.anfragen.some((a) => a.method === "GET" && a.url.includes(INDEX_DATEI)), false,
    "der alte Vertrag liest den Index gar nicht erst");
});
