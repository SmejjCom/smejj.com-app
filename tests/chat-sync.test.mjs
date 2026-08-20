// Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md): Server-Bausteine.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gehoertNutzer } from "../public/chat-owner.js";
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

test("nurAbgleich=true liefert NUR id, updatedAt und ownerId", async () => {
  const ergebnis = await ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]), nurAbgleich: true });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.chats.length, 2);
  for (const c of ergebnis.chats) {
    assert.deepEqual(Object.keys(c).sort(), ["id", "ownerId", "updatedAt"],
      "jedes zusaetzliche Feld ist Bandbreite, die pull() sofort verwirft");
  }
  assert.equal(ergebnis.chats[0].id, "chat_a");
  assert.equal(ergebnis.chats[0].updatedAt, "2026-08-19T10:00:00Z");
});

test("nurAbgleich ist WIRKLICH kleiner als nurListe", async () => {
  // Ohne diese Messung waere die neue Stufe nur eine Behauptung. Gemessen am
  // echten Konto: 88 Chats = 42 KB mit nurListe, ~10 KB mit nurAbgleich.
  const [abgleich, liste] = await Promise.all([
    ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]), nurAbgleich: true }),
    ladeChats({ kontoId: "user_a", env: S3_ENV, fetchImpl: s3Doppel([CHAT_A, CHAT_B]), nurListe: true })
  ]);
  const bytes = (x) => JSON.stringify(x.chats).length;
  assert.ok(bytes(abgleich) < bytes(liste),
    `nurAbgleich (${bytes(abgleich)} B) muss kleiner sein als nurListe (${bytes(liste)} B)`);
});

test("die drei Felder reichen dem Abgleich — mehr liest pull() nicht", async () => {
  // Diese Zusicherung ist der eigentliche Schutz: sie haelt fest, WARUM drei
  // Felder genuegen. Wer pull() spaeter um ein viertes Feld erweitert, muss
  // hier vorbeikommen — sonst faehrt der Abgleich mit einem `undefined`.
  const quelle = fs.readFileSync("public/chat-sync.js", "utf8");
  const pullBlock = quelle.slice(quelle.indexOf("async function pull()"), quelle.indexOf("async function push()"));
  const gelesen = [...pullBlock.matchAll(/\bfern\.([a-zA-Z]+)/g)].map((t) => t[1]);
  const erlaubt = new Set(["id", "updatedAt", "messages"]); // messages nur als Vorhandenseins-Pruefung
  const unerwartet = [...new Set(gelesen)].filter((f) => !erlaubt.has(f));
  assert.deepEqual(unerwartet, [], `pull() liest Felder, die nurAbgleich nicht liefert: ${unerwartet.join(", ")}`);
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

// ---------------------------------------------------------------------------
// DIE KENNUNGSLUECKE — gefunden am LIVE-Konto (2026-08-19), nicht im Test.
//
// Der Server stellte am 15.08. die Kontokennung auf SHA-256 um (Kollisionsleck,
// siehe chatSyncStore.js) — bewusst OHNE Rueckfall. Der Client stempelt seine
// Chats aber weiter nach der alten Regel `user_<adresse_mit_unterstrichen>`.
// Folge: `gehoertNutzer` haelt die eigenen Server-Chats fuer fremd, `importChat`
// gibt false, und der Abgleich holt sie bei JEDEM Seitenaufruf erneut.
//
// Diese Tests halten den Befund fest. Sie beschreiben den IST-Zustand — nicht
// den gewuenschten. Wird die Luecke geschlossen, muessen sie angepasst werden;
// genau das ist ihr Zweck: die Aenderung soll nicht unbemerkt durchgehen.
// ---------------------------------------------------------------------------
test("BEFUND: Server- und Client-Kennung desselben Kontos sind verschieden", () => {
  const serverSeitig = kontoKennung({ email: "smejjcom@gmail.com" });
  const clientSeitig = `user_${"smejjcom@gmail.com".replace(/[^a-z0-9]+/g, "_")}`;
  assert.equal(serverSeitig, "user_158c1e609cc03bb4c36f70b7e059fbfd", "am Live-Konto gemessen");
  assert.equal(clientSeitig, "user_smejjcom_gmail_com", "so stempelt der Client lokal");
  assert.notEqual(serverSeitig, clientSeitig, "genau daran scheitert der Geraete-Sync");
});

test("BEFUND: gehoertNutzer weist den eigenen Server-Chat ab", () => {
  const vomServer = { id: "chat_1", ownerId: kontoKennung({ email: "smejjcom@gmail.com" }) };
  assert.equal(
    gehoertNutzer(vomServer, "user_smejjcom_gmail_com", ""),
    false,
    "der Chat gehoert demselben Menschen — die Kennung sagt etwas anderes"
  );
  // Gegenstueck: mit passender Kennung wuerde er angenommen. Die Pruefung selbst
  // ist also in Ordnung; falsch ist nur, dass beide Seiten anders rechnen.
  assert.equal(gehoertNutzer(vomServer, vomServer.ownerId, ""), true);
});

test("der Abgleich ueberspringt genau das, was der Import abweisen wuerde", () => {
  // Das ist die Zusage der Sparmassnahme in chat-sync.js: uebersprungen wird nur,
  // was ohnehin nicht angekommen waere. Beide Seiten fragen dieselbe Funktion.
  const meine = "user_abc";
  const proben = [
    [{ id: "a", ownerId: "user_abc" }, true],
    [{ id: "b", ownerId: "user_xyz" }, false],
    [{ id: "c" }, true] // Altbestand ohne Besitzer, kein Geraete-Merker
  ];
  for (const [chat, erwartet] of proben) {
    const wuerdeImportiert = gehoertNutzer(chat, meine, "");
    assert.equal(wuerdeImportiert, erwartet, `falsch bewertet: ${chat.id}`);
  }
});
