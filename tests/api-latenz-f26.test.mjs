// F26 (A-bis-Z 2026-09-14): API-Latenz der drei Leseklemmen.
//
// Gemessen 14.09. (20 Anfragen je Route, frische Verbindung je Anfrage):
//   /api/chats?nurAbgleich=1  p50 569 / p95 957 ms
//   /api/models/status        p50 414 / p95 951 ms
//   /api/health               p95 741 ms
// Mit warmer Verbindung (Handshake nur einmal) blieben davon ~150 ms Netz und
// ~200 ms Serverzeit bei models/status, ~50 ms bei health. Serverseitig kostete:
//   nurAbgleich   zwei Rundreisen NACHEINANDER (Objektliste, dann Index-Datei)
//   models/status zwei Objektlisten je Aufruf (Kimi- und GLM-Tresor)
//   health        alle 60 s die volle Speicher-Sonde (bis 4 s) im Aufruf selbst
// Diese Tests sichern die drei Abkuerzungen — und ihre Sicherheitsgrenzen.
import test from "node:test";
import assert from "node:assert/strict";
import { INDEX_DATEI, INDEX_VERSION, eintraegeMitZeit } from "../control-server/src/chats/chatIndex.js";
import { ladeChats, vergissIndexHaltespeicher } from "../control-server/src/chats/chatSyncStore.js";
import { readModelStatus, vergissVaultStand, VAULT_HALTE_MS } from "../control-server/src/routes/modelRoutes.js";
import { MODEL_STATUSES } from "../src/shared/platform.js";
import {
  trainingsSpeicherStand,
  vergissTrainingsSpeicherStand,
  warteAufTrainingsSpeicherStand
} from "../src/training/speicherStand.js";

const ENV = {
  SMEJJ_CHAT_SYNC_ENABLED: "1",
  IDRIVE_E2_ENDPOINT: "https://e2.example.com",
  IDRIVE_E2_ACCESS_KEY: "a",
  IDRIVE_E2_SECRET_KEY: "s",
  IDRIVE_E2_BUCKET: "smejj-app"
};

/** Antwort wie der echte Speicher: signedS3Get liest arrayBuffer() und den ETag-Kopf. */
function antwort(status, koerper, etag = null) {
  const bytes = Buffer.from(String(koerper ?? ""), "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(koerper ?? ""),
    arrayBuffer: async () => bytes,
    headers: { get: (name) => (String(name).toLowerCase() === "etag" ? etag : null) }
  };
}

/**
 * S3-Doppel fuer den Abgleich: Liste mit ETag je Objekt (wie ListObjectsV2 sie
 * liefert, Anfuehrungszeichen als &quot;), Index-Datei mit ETag-Kopf.
 * `indexEtag` laesst sich zwischen zwei Aufrufen umstellen — wie nach einem
 * Nachtragen auf dem anderen Geraet.
 */
function abgleichDoppel({ anzahl = 20, mitEtag = true }) {
  const chats = Array.from({ length: anzahl }, (_, i) => ({ id: `chat_${i}`, updatedAt: "2026-09-14T09:00:00.000Z", ownerId: "user_a" }));
  const lage = { indexEtag: '"etag-1"', indexRumpf: JSON.stringify({ version: INDEX_VERSION, chats }) };
  const anfragen = [];
  const etagXml = (etag) => (mitEtag ? `<ETag>${etag.replace(/"/g, "&quot;")}</ETag>` : "");
  const fetchImpl = async (url, init) => {
    const u = String(url);
    anfragen.push({ url: u, method: init?.method || "GET" });
    if (u.includes("list-type")) {
      const bloecke = chats.map((c) => `<Contents><Key>chats/user_a/${c.id}.json</Key><LastModified>2026-09-14T10:00:00.000Z</LastModified>${etagXml('"chat"')}</Contents>`).join("");
      const index = `<Contents><Key>chats/user_a/${INDEX_DATEI}</Key><LastModified>2026-09-14T10:00:09.000Z</LastModified>${etagXml(lage.indexEtag)}</Contents>`;
      return antwort(200, `<ListBucketResult>${bloecke}${index}</ListBucketResult>`);
    }
    if (u.includes(INDEX_DATEI)) return antwort(200, lage.indexRumpf, mitEtag ? lage.indexEtag : null);
    return antwort(404, "");
  };
  const indexAbrufe = () => anfragen.filter((a) => a.method === "GET" && a.url.includes(INDEX_DATEI)).length;
  const listenAbrufe = () => anfragen.filter((a) => a.url.includes("list-type")).length;
  return { fetchImpl, anfragen, lage, chats, indexAbrufe, listenAbrufe };
}

test("nurAbgleich: gleicher Index-ETag in der Liste -> der Index wird NICHT ein zweites Mal gelesen", async () => {
  vergissIndexHaltespeicher();
  const doppel = abgleichDoppel({});
  const erster = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(erster.ausIndex, true);
  assert.equal(doppel.indexAbrufe(), 1, "beim ersten Mal muss der Index gelesen werden");
  const zweiter = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(zweiter.ausIndex, true);
  assert.equal(zweiter.ausHaltespeicher, true, "der zweite Aufruf kommt aus dem Haltespeicher");
  assert.equal(doppel.indexAbrufe(), 1, "die zweite Rundreise (Index-Datei) entfaellt — das ist F26");
  assert.equal(doppel.listenAbrufe(), 2, "die Objektliste bleibt bei JEDEM Aufruf der Frische-Beweis");
  assert.deepEqual(zweiter.chats, erster.chats, "inhaltlich derselbe Abgleich");
  // Kopien, keine geteilten Objekte: wer die Antwort veraendert, veraendert nicht den Speicher.
  zweiter.chats[0].updatedAt = "manipuliert";
  const dritter = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.notEqual(dritter.chats[0].updatedAt, "manipuliert");
});

test("nurAbgleich: anderer Index-ETag in der Liste -> der Index wird neu gelesen (Geraet B hat nachgetragen)", async () => {
  vergissIndexHaltespeicher();
  const doppel = abgleichDoppel({});
  await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  // Auf dem anderen Geraet wurde chat_0 bearbeitet und der Index nachgetragen.
  doppel.lage.indexEtag = '"etag-2"';
  doppel.lage.indexRumpf = JSON.stringify({ version: INDEX_VERSION, chats: doppel.chats.map((c, i) => (i === 0 ? { ...c, updatedAt: "2026-09-14T11:00:00.000Z" } : c)) });
  const zweiter = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(doppel.indexAbrufe(), 2, "neuer ETag = neuer Rumpf = lesen");
  assert.equal(zweiter.ausHaltespeicher, undefined);
  assert.equal(zweiter.chats[0].id, "chat_0");
  assert.equal(zweiter.chats[0].updatedAt, "2026-09-14T11:00:00.000Z", "die Aenderung von Geraet B kommt an — kein Stillstand durch den Haltespeicher");
});

test("nurAbgleich: ohne ETag in der Liste wird gelesen wie bisher (fail-closed)", async () => {
  vergissIndexHaltespeicher();
  const doppel = abgleichDoppel({ mitEtag: false });
  await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  const zweiter = await ladeChats({ kontoId: "user_a", env: ENV, fetchImpl: doppel.fetchImpl, nurAbgleich: true });
  assert.equal(zweiter.ausIndex, true);
  assert.equal(doppel.indexAbrufe(), 2, "kein Beweis, kein Haltespeicher");
});

test("Objektliste: der ETag wird gelesen und wie der GET-Kopf geschrieben", () => {
  const xml = '<ListBucketResult><Contents><Key>chats/u/_index.json</Key><LastModified>2026-09-14T10:00:09.000Z</LastModified><ETag>&quot;abc123&quot;</ETag></Contents>'
    + '<Contents><Key>chats/u/chat_1.json</Key><LastModified>2026-09-14T10:00:00.000Z</LastModified></Contents></ListBucketResult>';
  const [index, chat] = eintraegeMitZeit(xml);
  assert.equal(index.etag, '"abc123"');
  assert.equal(chat.etag, "", "ohne <ETag> bleibt der Wert leer — nie geraten");
});

test("models/status: der Tresor-Stand wird 30 s gehalten; Fehler und frisch:true lesen live", async () => {
  vergissVaultStand();
  const model = Object.values(MODEL_STATUSES)[0];
  let listen = 0;
  let status = 200;
  const fetchImpl = async () => { listen += 1; return antwort(status, "<ListBucketResult><Contents><Key>a</Key></Contents></ListBucketResult>"); };
  const t0 = 1_000_000;
  const a = await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 });
  assert.equal(a.configured, true);
  assert.equal(a.liveStorage.objectCount, 1);
  const b = await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 + VAULT_HALTE_MS - 1 });
  assert.equal(listen, 1, "innerhalb der Haltezeit KEINE zweite Objektliste");
  assert.equal(b.liveStorage.checkedAt, a.liveStorage.checkedAt, "die Messzeit bleibt ehrlich die alte");
  await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 + 1, frisch: true });
  assert.equal(listen, 2, "frisch:true (Worker-Preflight) liest immer live");
  await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 + VAULT_HALTE_MS + 1 });
  assert.equal(listen, 3, "nach Ablauf wird neu gemessen");
  // Ein Fehler wird nicht gehalten: der naechste Aufruf misst sofort wieder.
  vergissVaultStand();
  status = 403; // 4xx wird vom Signierer nicht wiederholt — der Test bleibt schnell
  const fehler = await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 });
  assert.equal(fehler.ok, false);
  assert.equal(fehler.liveStorage.status, 403);
  const vorher = listen;
  status = 200;
  const wieder = await readModelStatus(model, ENV, { fetchImpl, jetztMs: t0 + 1 });
  assert.equal(wieder.liveStorage.objectCount, 1, "die gelungene Liste zaehlt wieder");
  assert.equal(listen, vorher + 1, "nach einem Fehler wird sofort neu gelesen, nicht 30 s gewartet");
});

test("health: abgelaufener Speicher-Stand wird sofort geliefert, die neue Messung laeuft im Hintergrund", async () => {
  vergissTrainingsSpeicherStand();
  const env = {
    IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com",
    IDRIVE_E2_ACCESS_KEY: "AKIAHAUPT",
    IDRIVE_E2_SECRET_KEY: "geheim-haupt",
    IDRIVE_E2_TRAINING_ENDPOINT: "verweis:IDRIVE_E2_ENDPOINT",
    IDRIVE_E2_TRAINING_REGION: "us-west-2",
    IDRIVE_E2_TRAINING_ACCESS_KEY: "verweis:IDRIVE_E2_ACCESS_KEY",
    IDRIVE_E2_TRAINING_SECRET_KEY: "verweis:IDRIVE_E2_SECRET_KEY",
    IDRIVE_E2_TRAINING_BUCKET: "smejj-app",
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: "training/consents/"
  };
  let t = 1_000_000;
  let aufrufe = 0;
  let freigeben = () => {};
  const langsam = new Promise((resolve) => { freigeben = resolve; });
  const fetchImpl = async () => {
    aufrufe += 1;
    if (aufrufe === 1) return new Response("", { status: 403 });
    await langsam; // die zweite Messung haengt, bis der Test sie freigibt
    return new Response("<ListBucketResult></ListBucketResult>", { status: 200 });
  };
  const erster = await trainingsSpeicherStand(env, { fetchImpl, jetzt: () => t });
  assert.equal(erster.fehler, "list_http_403");
  t += 61_000;
  // Ohne den Fix haengt dieser Aufruf an der zweiten Messung — dann gewinnt der Wecker.
  const wecker = new Promise((resolve) => setTimeout(() => resolve("wecker"), 300));
  const zweiter = await Promise.race([trainingsSpeicherStand(env, { fetchImpl, jetzt: () => t }), wecker]);
  assert.notEqual(zweiter, "wecker", "der abgelaufene Stand muss SOFORT kommen, nicht erst nach der Messung");
  assert.equal(zweiter.fehler, "list_http_403", "geliefert wird der gehaltene Stand");
  assert.equal(aufrufe, 2, "die neue Messung wurde angestossen");
  // Ein dritter Aufruf waehrend der laufenden Messung stoesst KEINE weitere an.
  await trainingsSpeicherStand(env, { fetchImpl, jetzt: () => t });
  assert.equal(aufrufe, 2, "nie zwei Messungen nebeneinander");
  freigeben();
  await warteAufTrainingsSpeicherStand();
  const dritter = await trainingsSpeicherStand(env, { fetchImpl, jetzt: () => t + 1 });
  assert.equal(dritter.ok, true, "sobald die Messung fertig ist, gilt der neue Stand");
});
