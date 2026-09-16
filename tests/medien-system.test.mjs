// smejj.com — Medien-System A bis Z (Betreiber-Auftrag 2026-09-17).
//
// Die Zusagen, die diese Tests halten — jede entspricht einem Punkt des Auftrags:
//   - Konto A laedt hoch, A sieht es; Konto C (fremd) und Abgemeldete nicht.
//   - Die signierte Anzeige-Adresse verraet nichts und laeuft ab.
//   - Ein Teilen-Link entsteht nur ausdruecklich, ist widerrufbar, befristbar,
//     in der Nutzung begrenzbar, und ein Vorschau-Roboter verbraucht ihn nicht.
//   - Bild, Video, Audio, PDF gehen; falsche Typen, falscher Inhalt und zu
//     grosse Dateien werden abgewiesen.
//   - Video/Audio kommen in Teilstuecken (Range).
//   - Alte Adressen (?id=) funktionieren weiter.
//   - Beim Loeschen bleibt nichts verwaist — aber nichts, was ein anderer
//     Chat noch braucht, verschwindet.
//
// Der Server laeuft echt (node:http), nur der Objektspeicher ist eine Attrappe
// im Speicher, die SigV4-Anfragen wie IDrive e2 beantwortet.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createChatMedienRoutes, istErsterAbruf, istRoboter } from "../control-server/src/routes/chatMedienRoutes.js";
import { createChatSyncRoutes } from "../control-server/src/routes/chatSyncRoutes.js";
import { json, readJson } from "../control-server/src/http/respond.js";
import { kontoKennung } from "../control-server/src/chats/chatSyncStore.js";
import { inhaltPasstZuTyp, kennungGueltig, pruefeRohdatei, MAX_DATEI_BYTES } from "../control-server/src/chats/medienStore.js";
import { ablaufFuer, erzeugeZugang, pruefeZugang } from "../control-server/src/chats/medienZugang.js";
import { createMedienTeilen, linkStatus, neuerToken, tokenGueltig } from "../control-server/src/chats/medienTeilen.js";
import { createMedienAufraeumer, kennungenIn, raeumeKontoAuf, waehleLoeschbare, SCHONFRIST_WAISE_MS } from "../control-server/src/chats/medienAufraeumen.js";

const GEHEIMNIS = "x".repeat(48);
const ENV = {
  SMEJJ_CHAT_SYNC_ENABLED: "1",
  SMEJJ_SESSION_SECRET: GEHEIMNIS,
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_ACCESS_KEY: "k",
  IDRIVE_E2_SECRET_KEY: "s",
  IDRIVE_E2_BUCKET: "eimer",
  IDRIVE_E2_REGION: "us-west-2"
};

// ---- Echte Dateikoepfe -------------------------------------------------------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("bilddaten-a")]);
const PNG_B = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("bilddaten-b")]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(4000, 7)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(500, 1)]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(20, 3)]);

// ---- Objektspeicher-Attrappe --------------------------------------------------
function objektSpeicher({ loeschenVerboten = false } = {}) {
  const objekte = new Map(); // key -> {daten, typ, zeit}
  const antwort = (status, daten = Buffer.alloc(0), koepfe = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => Buffer.from(daten).toString("utf8"),
    arrayBuffer: async () => Buffer.from(daten),
    headers: { get: (name) => koepfe[String(name).toLowerCase()] ?? null }
  });
  async function fetchImpl(url, init = {}) {
    const adresse = new URL(String(url));
    const methode = init.method || "GET";
    const key = decodeURIComponent(adresse.pathname.replace(/^\/eimer\/?/, ""));
    if (methode === "GET" && adresse.searchParams.get("list-type") === "2") {
      const prefix = adresse.searchParams.get("prefix") || "";
      const inhalt = [...objekte.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, o]) =>
        `<Contents><Key>${k}</Key><LastModified>${new Date(o.zeit).toISOString()}</LastModified><ETag>"e"</ETag><Size>${o.daten.length}</Size></Contents>`).join("");
      return antwort(200, Buffer.from(`<ListBucketResult><IsTruncated>false</IsTruncated>${inhalt}</ListBucketResult>`));
    }
    if (methode === "PUT") {
      objekte.set(key, { daten: Buffer.from(init.body || Buffer.alloc(0)), typ: init.headers?.["Content-Type"], zeit: speicher.jetzt() });
      return antwort(200);
    }
    if (methode === "DELETE") {
      if (loeschenVerboten) return antwort(403);
      objekte.delete(key);
      return antwort(204);
    }
    const objekt = objekte.get(key);
    if (!objekt) return antwort(404, Buffer.from("<Error>NoSuchKey</Error>"));
    const range = init.headers?.Range;
    if (range) {
      const [, a, b] = String(range).match(/^bytes=(\d*)-(\d*)$/) || [];
      const start = Number(a || 0);
      const ende = Math.min(b === "" || b === undefined ? objekt.daten.length - 1 : Number(b), objekt.daten.length - 1);
      if (start >= objekt.daten.length) return antwort(416, Buffer.from("InvalidRange"));
      return antwort(206, objekt.daten.subarray(start, ende + 1), { "content-range": `bytes ${start}-${ende}/${objekt.daten.length}` });
    }
    return antwort(200, objekt.daten, { etag: '"e"' });
  }
  const speicher = { objekte, fetchImpl, jetzt: () => Date.now() };
  return speicher;
}

// ---- Echter HTTP-Server mit den Routen ----------------------------------------
async function starteServer({ speicher, uhr = { jetzt: Date.now() }, env = ENV } = {}) {
  const teilen = createMedienTeilen({ env, fetchImpl: speicher.fetchImpl, jetzt: () => uhr.jetzt });
  const geplant = [];
  const aufraeumer = { plane: (k, ids) => geplant.push({ k, ids }), taeglich: () => {} };
  const dienste = { teilen, aufraeumer };
  const readSession = (req) => {
    const email = req.headers["x-test-konto"];
    return email ? { email } : null;
  };
  const routen = createChatMedienRoutes({ env, readSession, json, readJson, fetchImpl: speicher.fetchImpl, dienste, jetzt: () => uhr.jetzt });
  const sync = createChatSyncRoutes({ env, readSession, json, readJson, fetchImpl: speicher.fetchImpl, medienDienste: dienste });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (routen.zustaendig(url.pathname) && await routen.handle(req, res, url)) return;
    if (await sync.handle(req, res, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise((fertig) => server.listen(0, "127.0.0.1", fertig));
  const basis = `http://127.0.0.1:${server.address().port}`;
  return { server, basis, geplant, teilen, schliessen: () => new Promise((f) => server.close(f)) };
}

const als = (email, extra = {}) => ({ "x-test-konto": email, ...extra });
const A = "a@beispiel.de";
const B_GERAET = "a@beispiel.de"; // "Benutzer B" im Sinne des Auftrags = berechtigtes zweites Geraet desselben Kontos
const C = "c@fremd.de";

async function hochladen(basis, email, daten, typ) {
  const antwort = await fetch(`${basis}/api/chat-medien`, { method: "POST", headers: als(email, { "Content-Type": typ }), body: daten });
  return { status: antwort.status, rumpf: await antwort.json() };
}

async function adressen(basis, email, ids, vorschau = false) {
  const antwort = await fetch(`${basis}/api/chat-medien/zugang`, {
    method: "POST", headers: als(email, { "Content-Type": "application/json" }), body: JSON.stringify({ ids, vorschau })
  });
  return { status: antwort.status, rumpf: await antwort.json() };
}

// ================================================================================
// Reine Pruefungen
// ================================================================================

test("Dateikennung: der Inhalt muss zum behaupteten Typ passen", () => {
  assert.equal(inhaltPasstZuTyp(PNG, "image/png"), true);
  assert.equal(inhaltPasstZuTyp(MP4, "video/mp4"), true);
  assert.equal(inhaltPasstZuTyp(MP3, "audio/mpeg"), true);
  assert.equal(inhaltPasstZuTyp(PDF, "application/pdf"), true);
  assert.equal(inhaltPasstZuTyp(WEBP, "image/webp"), true);
  const html = Buffer.from("<html><script>alert(1)</script></html>");
  for (const typ of ["image/png", "image/jpeg", "video/mp4", "application/pdf", "audio/mpeg"]) {
    assert.equal(inhaltPasstZuTyp(html, typ), false, `HTML als ${typ} darf nicht durch`);
  }
  assert.equal(pruefeRohdatei(PNG, "image/svg+xml").error, "typ_nicht_erlaubt");
  assert.equal(pruefeRohdatei(Buffer.from("<svg onload=alert(1)>"), "text/html").error, "typ_nicht_erlaubt");
  assert.equal(pruefeRohdatei(PDF, "image/png").error, "inhalt_passt_nicht_zum_typ", "manipulierte Endung/Typ");
  assert.equal(pruefeRohdatei(Buffer.alloc(0), "image/png").error, "leer");
});

test("Kennungen: kein Pfad, kein Durchlaufen, keine fremden Endungen", () => {
  assert.equal(kennungGueltig(`${"a".repeat(40)}.png`), true);
  assert.equal(kennungGueltig(`${"a".repeat(40)}.pdf`), true);
  for (const boese of ["../../etc/passwd", `${"a".repeat(40)}.png/../x`, `${"a".repeat(40)}.svg`, `${"a".repeat(40)}.html`, `${"A".repeat(40)}.png`, "", `..%2f${"a".repeat(36)}.png`]) {
    assert.equal(kennungGueltig(boese), false, boese);
  }
});

test("Signierte Adresse: verschluesselt, manipulationssicher, laeuft ab", () => {
  const kontoId = kontoKennung({ email: A });
  const id = `${"b".repeat(40)}.png`;
  const t0 = Date.UTC(2026, 8, 17, 10, 5, 0);
  const zugang = erzeugeZugang({ kontoId, id, jetztMs: t0, env: ENV });
  assert.ok(zugang?.token);
  assert.equal(zugang.token.includes(kontoId), false, "Konto nicht im Token lesbar");
  assert.equal(Buffer.from(zugang.token, "base64url").toString("latin1").includes(id.slice(0, 10)), false, "Kennung nicht lesbar");
  // Gleiches Fenster → gleiche Adresse (Browser-Cache greift).
  assert.equal(erzeugeZugang({ kontoId, id, jetztMs: t0 + 60_000, env: ENV }).token, zugang.token);
  const gut = pruefeZugang(zugang.token, { jetztMs: t0, env: ENV });
  assert.equal(gut.ok, true);
  assert.equal(gut.kontoId, kontoId);
  assert.ok(gut.restSekunden > 30 * 60 && gut.restSekunden <= 60 * 60, `Rest ${gut.restSekunden}`);
  // Abgelaufen
  assert.equal(pruefeZugang(zugang.token, { jetztMs: (ablaufFuer(t0) + 1) * 1000, env: ENV }).error, "zugang_abgelaufen");
  // Manipuliert: ein Zeichen geaendert
  const kaputt = `${zugang.token.slice(0, 20)}${zugang.token[20] === "A" ? "B" : "A"}${zugang.token.slice(21)}`;
  assert.equal(pruefeZugang(kaputt, { jetztMs: t0, env: ENV }).ok, false);
  // Anderes Server-Geheimnis
  assert.equal(pruefeZugang(zugang.token, { jetztMs: t0, env: { SMEJJ_SESSION_SECRET: "y".repeat(48) } }).ok, false);
  // Ohne Geheimnis: aus
  assert.equal(erzeugeZugang({ kontoId, id, env: {} }), null);
  assert.equal(pruefeZugang(zugang.token, { env: {} }).error, "zugang_aus");
});

test("Teilen-Token: zufaellig, lang genug, keine Aufzaehlung", () => {
  const menge = new Set(Array.from({ length: 2000 }, () => neuerToken()));
  assert.equal(menge.size, 2000);
  for (const token of menge) assert.equal(tokenGueltig(token), true);
  assert.equal(tokenGueltig("../../x"), false);
  assert.equal(linkStatus({ token: "A".repeat(16), id: `${"a".repeat(40)}.png`, widerrufenAm: "x" }), "widerrufen");
  assert.equal(linkStatus({ token: "A".repeat(16), id: `${"a".repeat(40)}.png`, maxAufrufe: 1, aufrufe: 1 }), "aufgebraucht");
  assert.equal(linkStatus({ token: "A".repeat(16), id: `${"a".repeat(40)}.png`, ablaufAm: "2020-01-01T00:00:00Z" }), "abgelaufen");
});

test("Vorschau-Roboter und Spulen verbrauchen keinen Aufruf", () => {
  assert.equal(istRoboter("WhatsApp/2.23.20.0"), true);
  assert.equal(istRoboter("TelegramBot (like TwitterBot)"), true);
  assert.equal(istRoboter("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari"), false);
  assert.equal(istErsterAbruf(""), true);
  assert.equal(istErsterAbruf("bytes=0-"), true);
  assert.equal(istErsterAbruf("bytes=5000-"), false);
});

// ================================================================================
// Ende-zu-Ende ueber HTTP
// ================================================================================

test("A laedt ein Bild hoch; A (auch auf zweitem Geraet) sieht es; C und Abgemeldete nicht", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const hoch = await hochladen(s.basis, A, PNG, "image/png");
    assert.equal(hoch.status, 200, JSON.stringify(hoch.rumpf));
    const id = hoch.rumpf.id;
    assert.match(id, /^[a-f0-9]{40}\.png$/);
    // Im Speicher liegt es unter dem Konto — der Originalname existiert nirgends.
    assert.ok([...speicher.objekte.keys()].some((k) => k === `chat-medien/${kontoKennung({ email: A })}/${id}`));

    const zweitesGeraet = await adressen(s.basis, B_GERAET, [id]);
    assert.equal(zweitesGeraet.status, 200);
    const url = zweitesGeraet.rumpf.adressen[id];
    assert.match(url, /\/medium\/[A-Za-z0-9_-]+$/);
    assert.equal(url.includes("chat-medien"), false, "keine internen Pfade");
    assert.equal(url.includes("eimer"), false, "kein Bucket");
    const bild = await fetch(url.replace("https://api.smejj.com", s.basis));
    assert.equal(bild.status, 200);
    assert.deepEqual(Buffer.from(await bild.arrayBuffer()), PNG);
    assert.match(bild.headers.get("cache-control"), /^private, max-age=\d+, immutable$/);
    assert.equal(bild.headers.get("x-content-type-options"), "nosniff");
    assert.match(bild.headers.get("content-security-policy"), /sandbox/);
    assert.equal(bild.headers.get("cross-origin-resource-policy"), "same-site", "Hotlinking von fremden Seiten gesperrt");

    // C: eigene Adresse fuer A's Kennung → zeigt in C's Konto → nichts.
    const fremd = await adressen(s.basis, C, [id]);
    const fremdBild = await fetch(fremd.rumpf.adressen[id].replace("https://api.smejj.com", s.basis));
    assert.equal(fremdBild.status, 404);
    // C ueber den alten Weg: ebenfalls nichts.
    assert.equal((await fetch(`${s.basis}/api/chat-medien?id=${id}`, { headers: als(C) })).status, 404);
    // Abgemeldet: weder alter Weg noch Adressen-Ausgabe.
    assert.equal((await fetch(`${s.basis}/api/chat-medien?id=${id}`)).status, 401);
    assert.equal((await fetch(`${s.basis}/api/chat-medien/zugang`, { method: "POST", body: "{}" })).status, 401);
    // Geratener Token ohne Signatur
    assert.equal((await fetch(`${s.basis}/medium/${"A".repeat(120)}`)).status, 403);
  } finally { await s.schliessen(); }
});

test("Signierte Adresse laeuft auch ueber HTTP ab", async () => {
  const speicher = objektSpeicher();
  const uhr = { jetzt: Date.UTC(2026, 8, 17, 12, 0, 0) };
  const s = await starteServer({ speicher, uhr });
  try {
    const { rumpf } = await hochladen(s.basis, A, PNG, "image/png");
    const url = (await adressen(s.basis, A, [rumpf.id])).rumpf.adressen[rumpf.id].replace("https://api.smejj.com", s.basis);
    assert.equal((await fetch(url)).status, 200);
    uhr.jetzt += 61 * 60 * 1000;
    const spaeter = await fetch(url);
    assert.equal(spaeter.status, 403);
    assert.equal(await spaeter.text(), "Adresse abgelaufen.");
  } finally { await s.schliessen(); }
});

test("Bild, Video, Audio, PDF: Upload und Abruf; Video in Teilstuecken", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    for (const [daten, typ] of [[PNG, "image/png"], [MP4, "video/mp4"], [MP3, "audio/mpeg"], [PDF, "application/pdf"]]) {
      const hoch = await hochladen(s.basis, A, daten, typ);
      assert.equal(hoch.status, 200, `${typ}: ${JSON.stringify(hoch.rumpf)}`);
      const url = (await adressen(s.basis, A, [hoch.rumpf.id])).rumpf.adressen[hoch.rumpf.id].replace("https://api.smejj.com", s.basis);
      const ganz = await fetch(url);
      assert.equal(ganz.status, 200, typ);
      assert.equal(ganz.headers.get("content-type"), typ);
      if (typ === "application/pdf") assert.match(ganz.headers.get("content-disposition"), /^attachment/);
      if (typ === "video/mp4") {
        const stueck = await fetch(url, { headers: { Range: "bytes=100-199" } });
        assert.equal(stueck.status, 206);
        assert.equal(stueck.headers.get("content-range"), `bytes 100-199/${MP4.length}`);
        assert.equal((await stueck.arrayBuffer()).byteLength, 100);
        assert.equal(stueck.headers.get("accept-ranges"), "bytes");
        const kopf = await fetch(url, { method: "HEAD" });
        assert.equal(kopf.status, 200);
      }
    }
  } finally { await s.schliessen(); }
});

test("Falsche Typen, falscher Inhalt und zu grosse Dateien werden abgewiesen", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    assert.equal((await hochladen(s.basis, A, Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).status, 415);
    assert.equal((await hochladen(s.basis, A, Buffer.from("<html></html>"), "text/html")).status, 415);
    const getarnt = await hochladen(s.basis, A, Buffer.from("<html><script>alert(1)</script>"), "image/png");
    assert.equal(getarnt.status, 400);
    assert.equal(getarnt.rumpf.error, "inhalt_passt_nicht_zum_typ");
    const exe = await hochladen(s.basis, A, Buffer.from("MZ\x90\x00 Windows-Programm"), "application/pdf");
    assert.equal(exe.status, 400);
    const riesig = Buffer.concat([PNG, Buffer.alloc(MAX_DATEI_BYTES)]);
    const gross = await hochladen(s.basis, A, riesig, "image/png");
    assert.equal(gross.status, 413);
    assert.equal(gross.rumpf.error, "zu_gross");
    // Nichts davon liegt im Speicher.
    assert.equal(speicher.objekte.size, 0);
  } finally { await s.schliessen(); }
});

test("Alte Chat-Medien: ?id=-Adresse und data:-URL-Upload funktionieren weiter", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const alt = await fetch(`${s.basis}/api/chat-medien`, {
      method: "POST", headers: als(A, { "Content-Type": "application/json" }), body: JSON.stringify({ dataUrl: `data:image/png;base64,${PNG.toString("base64")}` })
    });
    assert.equal(alt.status, 200);
    const { id } = await alt.json();
    const zurueck = await fetch(`${s.basis}/api/chat-medien?id=${id}`, { headers: als(A) });
    assert.equal(zurueck.status, 200);
    assert.deepEqual(Buffer.from(await zurueck.arrayBuffer()), PNG);
    assert.equal(zurueck.headers.get("cache-control"), "private, max-age=31536000, immutable");
  } finally { await s.schliessen(); }
});

test("Vorschau-Fassung: nur fuer eigene Bilder, Anzeige nimmt sie, Original bleibt fuer Vollbild", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const { rumpf } = await hochladen(s.basis, A, PNG, "image/png");
    const fremd = await fetch(`${s.basis}/api/chat-medien/vorschau?id=${rumpf.id}`, { method: "POST", headers: als(C, { "Content-Type": "image/webp" }), body: WEBP });
    assert.equal(fremd.status, 400, "C hat das Original nicht");
    const eigen = await fetch(`${s.basis}/api/chat-medien/vorschau?id=${rumpf.id}`, { method: "POST", headers: als(A, { "Content-Type": "image/webp" }), body: WEBP });
    assert.equal(eigen.status, 200);
    const klein = (await adressen(s.basis, A, [rumpf.id], true)).rumpf.adressen[rumpf.id].replace("https://api.smejj.com", s.basis);
    const gross = (await adressen(s.basis, A, [rumpf.id], false)).rumpf.adressen[rumpf.id].replace("https://api.smejj.com", s.basis);
    assert.notEqual(klein, gross);
    assert.equal((await fetch(klein)).headers.get("content-type"), "image/webp");
    assert.equal((await fetch(gross)).headers.get("content-type"), "image/png");
  } finally { await s.schliessen(); }
});

test("Teilen-Link: nur ausdruecklich, funktioniert extern, widerrufen = sofort tot", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const { rumpf } = await hochladen(s.basis, A, PNG, "image/png");
    // C kann fuer A's Medium keinen Link bauen.
    const fremd = await fetch(`${s.basis}/api/chat-medien/teilen`, { method: "POST", headers: als(C, { "Content-Type": "application/json" }), body: JSON.stringify({ id: rumpf.id }) });
    assert.equal(fremd.status, 404);
    // Ohne Anmeldung auch nicht.
    assert.equal((await fetch(`${s.basis}/api/chat-medien/teilen`, { method: "POST", body: JSON.stringify({ id: rumpf.id }) })).status, 401);

    const erstellt = await fetch(`${s.basis}/api/chat-medien/teilen`, { method: "POST", headers: als(A, { "Content-Type": "application/json" }), body: JSON.stringify({ id: rumpf.id, tage: 7 }) });
    assert.equal(erstellt.status, 200);
    const { link } = await erstellt.json();
    assert.match(link.url, /^https:\/\/api\.smejj\.com\/m\/[A-Za-z0-9]{16}$/);
    assert.equal(link.status, "aktiv");
    const extern = link.url.replace("https://api.smejj.com", s.basis);
    const besucher = await fetch(extern); // ohne Sitzung
    assert.equal(besucher.status, 200);
    assert.deepEqual(Buffer.from(await besucher.arrayBuffer()), PNG);
    assert.equal(besucher.headers.get("cache-control"), "no-store");
    assert.equal(besucher.headers.get("referrer-policy"), "no-referrer");
    assert.equal(besucher.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(besucher.headers.get("content-disposition").includes(rumpf.id), false, "keine interne Kennung im Dateinamen");

    // Liste des Besitzers
    const liste = await (await fetch(`${s.basis}/api/chat-medien/teilen?id=${rumpf.id}`, { headers: als(A) })).json();
    assert.equal(liste.links.length, 1);
    // C kann nicht widerrufen
    assert.equal((await fetch(`${s.basis}/api/chat-medien/teilen?token=${link.token}`, { method: "DELETE", headers: als(C) })).status, 404);
    assert.equal((await fetch(extern)).status, 200);
    // A widerruft
    assert.equal((await fetch(`${s.basis}/api/chat-medien/teilen?token=${link.token}`, { method: "DELETE", headers: als(A) })).status, 200);
    const danach = await fetch(extern);
    assert.equal(danach.status, 410);
    assert.equal(await danach.text(), "Dieser Link wurde widerrufen.");
  } finally { await s.schliessen(); }
});

test("Teilen-Link: Ablauf und Einmal-Nutzung; Vorschau-Roboter verbraucht nichts", async () => {
  const speicher = objektSpeicher();
  const uhr = { jetzt: Date.UTC(2026, 8, 17, 12, 0, 0) };
  const s = await starteServer({ speicher, uhr });
  try {
    const { rumpf } = await hochladen(s.basis, A, PNG, "image/png");
    const neu = async (koerper) => (await (await fetch(`${s.basis}/api/chat-medien/teilen`, {
      method: "POST", headers: als(A, { "Content-Type": "application/json" }), body: JSON.stringify({ id: rumpf.id, ...koerper })
    })).json()).link;

    const einmal = await neu({ tage: 1, maxAufrufe: 1 });
    const einmalUrl = einmal.url.replace("https://api.smejj.com", s.basis);
    const roboter = await fetch(einmalUrl, { headers: { "User-Agent": "WhatsApp/2.24" } });
    assert.equal(roboter.status, 403, "Roboter bekommt einen Einmal-Link nicht");
    assert.equal((await fetch(einmalUrl, { method: "HEAD" })).status, 200, "HEAD zaehlt nicht");
    assert.equal((await fetch(einmalUrl, { headers: { "X-Forwarded-For": "1.1.1.1" } })).status, 200, "erster echter Aufruf");
    assert.equal((await fetch(einmalUrl, { headers: { "X-Forwarded-For": "1.1.1.1", Range: "bytes=5-9" } })).status, 206, "Spulen im selben Aufruf");
    const zweiter = await fetch(einmalUrl, { headers: { "X-Forwarded-For": "2.2.2.2" } });
    assert.equal(zweiter.status, 410, "zweiter Besucher: verbraucht");

    const befristet = await neu({ tage: 1 });
    const befristetUrl = befristet.url.replace("https://api.smejj.com", s.basis);
    assert.equal((await fetch(befristetUrl)).status, 200);
    uhr.jetzt += 25 * 60 * 60 * 1000;
    const abgelaufen = await fetch(befristetUrl);
    assert.equal(abgelaufen.status, 410);
    assert.equal(await abgelaufen.text(), "Dieser Link ist abgelaufen.");

    assert.equal((await fetch(`${s.basis}/m/Aaaaaaaaaaaaaaaa`)).status, 404, "unbekannter Token");
    assert.equal((await fetch(`${s.basis}/m/..%2F..%2Fetc`)).status, 404);
  } finally { await s.schliessen(); }
});

test("Durchprobieren von Teilen-Tokens wird gebremst", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    let gebremst = false;
    for (let i = 0; i < 40; i += 1) {
      const antwort = await fetch(`${s.basis}/m/${neuerToken()}`, { headers: { "X-Forwarded-For": "9.9.9.9" } });
      if (antwort.status === 429) { gebremst = true; break; }
      assert.equal(antwort.status, 404);
    }
    assert.equal(gebremst, true);
  } finally { await s.schliessen(); }
});

test("Chat endgueltig loeschen merkt seine Medien zum Aufraeumen vor", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const { rumpf } = await hochladen(s.basis, A, PNG, "image/png");
    const konto = kontoKennung({ email: A });
    speicher.objekte.set(`chats/${konto}/chat_1.json`, {
      daten: Buffer.from(JSON.stringify({ id: "chat_1", messages: [{ html: `<img src="https://api.smejj.com/api/chat-medien?id=${rumpf.id}">` }] })), zeit: Date.now()
    });
    const weg = await fetch(`${s.basis}/api/chats?id=chat_1`, { method: "DELETE", headers: als(A) });
    assert.equal(weg.status, 200);
    assert.deepEqual(s.geplant, [{ k: konto, ids: [rumpf.id] }]);
  } finally { await s.schliessen(); }
});

// ================================================================================
// Aufraeumen: keine Waisen — aber nichts Benutztes verschwindet
// ================================================================================

test("Aufraeumen waehlt nur Unbenutztes und haelt die Schonfristen", () => {
  const jetztMs = Date.UTC(2026, 8, 17);
  const id = (z) => `${z.repeat(40)}.png`;
  const medien = [
    { id: id("a"), zeitMs: jetztMs - 60 * 60 * 1000, bytes: 10 },          // Anlass, 1 h alt, unbenutzt → weg
    { id: id("b"), zeitMs: jetztMs - 60 * 60 * 1000, bytes: 10 },          // Anlass, aber anderer Chat nutzt es → bleibt
    { id: id("c"), zeitMs: jetztMs - 60 * 1000, bytes: 10 },               // Anlass, aber 1 min jung → bleibt
    { id: id("d"), zeitMs: jetztMs - 2 * 24 * 60 * 60 * 1000, bytes: 10 }, // Waise ohne Anlass, 2 Tage → bleibt
    { id: id("e"), zeitMs: jetztMs - SCHONFRIST_WAISE_MS - 1, bytes: 10 }, // Waise, ueber Frist → weg
    { id: id("f"), zeitMs: jetztMs - SCHONFRIST_WAISE_MS - 1, bytes: 0 }   // schon geleert → nichts tun
  ];
  const loeschbar = waehleLoeschbare({ medien, benutzt: new Set([id("b")]), anlass: new Set([id("a"), id("b"), id("c")]), jetztMs });
  assert.deepEqual(loeschbar.sort(), [id("a"), id("e")]);
});

test("Kennungen werden in HTML, Markdown und JSON gefunden", () => {
  const id = `${"9".repeat(40)}.mp4`;
  assert.deepEqual([...kennungenIn(`<video src="https://api.smejj.com/api/chat-medien?id=${id}">`)], [id]);
  assert.deepEqual([...kennungenIn(JSON.stringify({ raw: `![x](https://api.smejj.com/api/chat-medien?id=${id})` }))], [id]);
  assert.deepEqual([...kennungenIn(`x${"9".repeat(41)}.mp4`)], [], "laengere Hexfolgen sind keine Kennung");
});

test("Aufraeumen ueber den Speicher: Papierkorb-Chat schuetzt, Grabstein nicht; Teilen-Links werden widerrufen", async () => {
  const speicher = objektSpeicher({ loeschenVerboten: true }); // wie live am 13.08.: DELETE → 403
  const konto = kontoKennung({ email: A });
  const alt = Date.now() - 2 * 60 * 60 * 1000;
  const idWeg = `${"1".repeat(40)}.png`;
  const idPapierkorb = `${"2".repeat(40)}.png`;
  speicher.objekte.set(`chat-medien/${konto}/${idWeg}`, { daten: PNG, zeit: alt });
  speicher.objekte.set(`chat-medien/${konto}/${idWeg}.vorschau.webp`, { daten: WEBP, zeit: alt });
  speicher.objekte.set(`chat-medien/${konto}/${idPapierkorb}`, { daten: PNG_B, zeit: alt });
  speicher.objekte.set(`chats/${konto}/geloescht.json`, { daten: Buffer.from(JSON.stringify({ id: "geloescht", geloescht: true, messages: [] })), zeit: Date.now() });
  speicher.objekte.set(`chats/${konto}/papierkorb.json`, { daten: Buffer.from(JSON.stringify({ id: "papierkorb", deletedAt: "2026-09-10", messages: [{ html: `?id=${idPapierkorb}` }] })), zeit: Date.now() });
  const teilen = createMedienTeilen({ env: ENV, fetchImpl: speicher.fetchImpl });
  const { link } = await teilen.erstelle({ kontoId: konto, id: idWeg, tage: 0 });

  const ergebnis = await raeumeKontoAuf({ kontoId: konto, anlass: new Set([idWeg, idPapierkorb]), env: ENV, fetchImpl: speicher.fetchImpl, teilen });
  assert.equal(ergebnis.ok, true, ergebnis.error);
  assert.deepEqual(ergebnis.geloescht, [idWeg]);
  assert.equal(speicher.objekte.get(`chat-medien/${konto}/${idWeg}`).daten.length, 0, "geleert, weil DELETE verboten");
  assert.equal(speicher.objekte.get(`chat-medien/${konto}/${idWeg}.vorschau.webp`).daten.length, 0);
  assert.equal(speicher.objekte.get(`chat-medien/${konto}/${idPapierkorb}`).daten.length, PNG_B.length, "Papierkorb schuetzt");
  assert.equal((await teilen.oeffne({ token: link.token })).error, "widerrufen");
});

test("Aufraeumen ist fail-closed: ein unlesbarer Chat → nichts wird geloescht", async () => {
  const speicher = objektSpeicher();
  const konto = kontoKennung({ email: A });
  const id = `${"3".repeat(40)}.png`;
  speicher.objekte.set(`chat-medien/${konto}/${id}`, { daten: PNG, zeit: Date.now() - 40 * 24 * 60 * 60 * 1000 });
  speicher.objekte.set(`chats/${konto}/kaputt.json`, { daten: Buffer.from("{}"), zeit: Date.now() });
  const fetchImpl = async (url, init) => (String(url).includes("kaputt.json") ? { ok: false, status: 500, arrayBuffer: async () => Buffer.alloc(0), text: async () => "", headers: { get: () => null } } : speicher.fetchImpl(url, init));
  const ergebnis = await raeumeKontoAuf({ kontoId: konto, env: { ...ENV, IDRIVE_E2_MAX_RETRIES: "0" }, fetchImpl });
  assert.equal(ergebnis.ok, false);
  assert.deepEqual(ergebnis.geloescht, []);
  assert.equal(speicher.objekte.get(`chat-medien/${konto}/${id}`).daten.length, PNG.length);
});

test("Aufraeumer entprellt: mehrere Loeschungen hintereinander = ein Lauf", async () => {
  const speicher = objektSpeicher();
  let laeufe = 0;
  const zaehlendesFetch = async (url, init) => {
    if (String(url).includes("list-type") && String(url).includes("chat-medien")) laeufe += 1;
    return speicher.fetchImpl(url, init);
  };
  const aufraeumer = createMedienAufraeumer({ env: ENV, fetchImpl: zaehlendesFetch, verzoegerungMs: 20 });
  const konto = kontoKennung({ email: A });
  aufraeumer.plane(konto, [`${"4".repeat(40)}.png`]);
  aufraeumer.plane(konto, [`${"5".repeat(40)}.png`]);
  aufraeumer.plane(konto, [`${"6".repeat(40)}.png`]);
  await new Promise((fertig) => setTimeout(fertig, 120));
  assert.equal(laeufe, 1);
});
