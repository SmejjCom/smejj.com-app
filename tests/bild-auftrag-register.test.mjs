// smejj.com — Register "Bildauftrag -> Medium" (26.09.2026, Punkt 4 der Experten-Liste): ein fertig gemaltes
// Bild ueberlebt Bruecken-Neustart und Token-Wechsel, weil es am KONTO haengt. Nur eigene Medien eintragbar.
// Standalone: node --test tests/bild-auftrag-register.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createChatMedienRoutes } from "../control-server/src/routes/chatMedienRoutes.js";
import { json, readJson } from "../control-server/src/http/respond.js";
import { createMedienTeilen } from "../control-server/src/chats/medienTeilen.js";
import { auftragHash, REGISTER_PRAEFIX, REGISTER_GUELTIG_MS } from "../control-server/src/chats/bildAblageRegister.js";
import { MEDIEN_PRAEFIX } from "../control-server/src/chats/medienStore.js";

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
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("bilddaten-fuchs")]);

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
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (routen.zustaendig(url.pathname) && await routen.handle(req, res, url)) return;
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


async function auftrag(basis, email, rumpf) {
  const antwort = await fetch(`${basis}/api/chat-medien/auftrag`, { method: "POST", headers: als(email, { "Content-Type": "application/json" }), body: JSON.stringify(rumpf) });
  return { status: antwort.status, rumpf: await antwort.json() };
}

test("Register: eintragen, finden (auch mit anderem Token desselben Kontos), fremdes Konto findet nichts", async () => {
  const speicher = objektSpeicher();
  const uhr = { jetzt: Date.now() };
  speicher.jetzt = () => uhr.jetzt;
  const s = await starteServer({ speicher, uhr });
  try {
    const hoch = await hochladen(s.basis, A, PNG, "image/png");
    assert.equal(hoch.status, 200);
    const id = hoch.rumpf.id;
    const ein = await auftrag(s.basis, A, { auftrag: "Generate an image of: a red fox on a mossy rock", id });
    assert.equal(ein.status, 200);
    assert.equal(ein.rumpf.ok, true);
    // Finden: Gross/Klein und Leerraum egal, gleiches KONTO genuegt (kein Token im Schluessel).
    const such = await auftrag(s.basis, B_GERAET, { auftrag: "  generate an image of:  a red fox on a mossy rock " });
    assert.deepEqual(such.rumpf, { ok: true, id });
    // Fremdes Konto: nichts.
    assert.equal((await auftrag(s.basis, C, { auftrag: "Generate an image of: a red fox on a mossy rock" })).rumpf.ok, false);
    // Anderer Auftrag: nichts.
    assert.equal((await auftrag(s.basis, A, { auftrag: "Generate an image of: a blue fox" })).rumpf.ok, false);
    // Der Registereintrag liegt NICHT unter dem Medien-Praefix (der Aufraeumer listet nur dort).
    const schluessel = [...speicher.objekte.keys()].find((k) => k.startsWith(`${REGISTER_PRAEFIX}/`));
    assert.ok(schluessel && !schluessel.startsWith(`${MEDIEN_PRAEFIX}/`));
    assert.ok(schluessel.endsWith(`${auftragHash("generate an image of: a red fox on a mossy rock")}.json`));
    assert.ok(!schluessel.includes("fox"), "kein Klartext im Speicher");
    // Ablauf nach 7 Tagen.
    uhr.jetzt += REGISTER_GUELTIG_MS + 1000;
    assert.equal((await auftrag(s.basis, A, { auftrag: "Generate an image of: a red fox on a mossy rock" })).rumpf.ok, false);
  } finally {
    await s.schliessen();
  }
});

test("Register: nur EIGENE Medien eintragbar, ohne Sitzung kein Zugang, leerer Auftrag abgewiesen", async () => {
  const speicher = objektSpeicher();
  const s = await starteServer({ speicher });
  try {
    const hoch = await hochladen(s.basis, A, PNG, "image/png");
    assert.equal((await auftrag(s.basis, C, { auftrag: "x Bild", id: hoch.rumpf.id })).status, 404, "fremdes Konto kann A's Medium nicht eintragen");
    assert.equal((await auftrag(s.basis, A, { auftrag: "x Bild", id: "0".repeat(40) + ".png" })).status, 404, "nicht vorhandenes Medium");
    assert.equal((await auftrag(s.basis, A, { auftrag: "   " })).status, 400);
    const ohne = await fetch(`${s.basis}/api/chat-medien/auftrag`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auftrag: "x" }) });
    assert.equal(ohne.status, 401);
  } finally {
    await s.schliessen();
  }
});
