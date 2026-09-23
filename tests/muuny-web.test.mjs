import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CodeSpeicher, normEmail, nutzerKennung, sitzungAusstellen, sitzungLesen } from "../workers/muuny-web/anmeldung.js";
import { baueWeb, ladeSeiten } from "../workers/muuny-web/web.js";

const GEHEIM = "s".repeat(40);
const PFEFFER = "p".repeat(40);
const ORDNER = new URL("../workers/muuny-web/oeffentlich/", import.meta.url).pathname;

/** Ein Test-Server mit gefaelschtem Autopiloten und gefaelschter Laufzeit. */
async function aufbau({ erwartet, versand = async () => {}, laufzeitAntwort } = {}) {
  const { seiten, datenschutzSha256 } = await ladeSeiten(ORDNER);
  const aufrufe = [];
  const post = [];
  const fetchImpl = async (url, opt = {}) => {
    aufrufe.push({ url, opt });
    if (url.includes("/v1/einwilligung")) {
      const k = opt.body ? JSON.parse(opt.body) : {};
      const ok = opt.method === "DELETE" || (k.trainingJa === true && k.pruefungJa === true && k.rechteJa === true);
      return new Response(JSON.stringify({ ok, grund: ok ? null : "ausdrueckliches_ja_fehlt" }), { status: ok ? 201 : 200 });
    }
    if (url.includes("/v1/lernpaar")) return new Response(JSON.stringify({ erfasst: true, grund: null }));
    if (url.includes("/v1/chat/completions")) return laufzeitAntwort ? laufzeitAntwort(opt) : new Response(
      "data: {\"choices\":[{\"delta\":{\"content\":\"Hallo\"}}]}\n\ndata: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream", "x-muuny-modell": "muuny-grundmodell", "x-muuny-wissen": "2" } });
    return new Response("{}", { status: 404 });
  };
  const codes = new CodeSpeicher({ zufall: () => 123456 });
  const behandle = baueWeb({ seiten, datenschutzSha256, erwarteteDatenschutzSha: erwartet ?? datenschutzSha256, sitzungSchluessel: GEHEIM, pfeffer: PFEFFER,
    versand: versand && (async (e, c) => { post.push({ e, c }); await versand(e, c); }), codes, fetchImpl, protokoll: {},
    autopilot: { url: "http://autopilot", dienstSchluessel: "dienst-geheim" }, laufzeit: { url: "http://laufzeit", schluessel: "lz" } });
  const server = http.createServer((q, r) => behandle(q, r));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const rufe = async (pfad, { methode = "GET", daten, ohneKopf = false } = {}) => {
    const r = await fetch(basis + pfad, { method: methode, headers: { ...(cookie ? { cookie } : {}), ...(methode !== "GET" && !ohneKopf ? { "x-muuny": "1", "content-type": "application/json" } : {}) },
      body: daten ? JSON.stringify(daten) : undefined });
    const neu = r.headers.get("set-cookie");
    if (neu) cookie = neu.split(";")[0];
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, kopf: r.headers };
  };
  const anmelden = async (email = "Test@Example.com") => { await rufe("/api/code", { methode: "POST", daten: { email } }); return rufe("/api/anmelden", { methode: "POST", daten: { email, code: "123456" } }); };
  return { rufe, anmelden, aufrufe, post, datenschutzSha256, schliesse: () => server.close() };
}

test("E-Mail wird normalisiert, Unsinn abgelehnt", () => {
  assert.equal(normEmail("  Du@Beispiel.DE "), "du@beispiel.de");
  for (const x of ["", "a@b", "a b@c.de", "<x>@y.de", "x".repeat(250) + "@a.de"]) assert.equal(normEmail(x), null, x);
});

test("Code: einmal gueltig, 5 Fehlversuche verbrennen ihn, Drossel je Adresse", () => {
  let t = 0;
  const c = new CodeSpeicher({ jetzt: () => t, zufall: () => 42 });
  assert.equal(c.neu("a@b.de").code, "000042");
  assert.equal(c.neu("a@b.de").ok, false, "zweiter Code in derselben Minute");
  for (let i = 0; i < 4; i++) assert.equal(c.pruefe("a@b.de", "111111").grund, "code_falsch");
  assert.equal(c.pruefe("a@b.de", "111111").grund, "code_verbrannt");
  assert.equal(c.pruefe("a@b.de", "000042").ok, false, "verbrannt bleibt verbrannt");
  t += 61_000;
  c.neu("a@b.de");
  assert.equal(c.pruefe("a@b.de", "000042").ok, true);
  assert.equal(c.pruefe("a@b.de", "000042").ok, false, "verbraucht");
  c.neu("x@y.de"); t += 11 * 60_000;
  assert.equal(c.pruefe("x@y.de", "000042").grund, "code_abgelaufen");
});

test("Sitzung: gefaelscht oder abgelaufen = abgemeldet; Kennung verraet die E-Mail nicht", () => {
  const s = sitzungAusstellen({ u: "m_1", ew: 1 }, GEHEIM, { jetzt: 0 });
  assert.equal(sitzungLesen(s, GEHEIM, { jetzt: 1 }).ew, 1);
  assert.equal(sitzungLesen(s, "x".repeat(40), { jetzt: 1 }), null);
  const [inhalt, sig] = s.split(".");
  const falsch = Buffer.from(JSON.stringify({ u: "m_2", ew: 1, bis: 9e15 })).toString("base64url");
  assert.equal(sitzungLesen(`${falsch}.${sig}`, GEHEIM), null);
  assert.equal(sitzungLesen(`${inhalt}.${sig}`, GEHEIM, { jetzt: 31 * 86_400_000 }), null);
  const k = nutzerKennung("a@b.de", PFEFFER);
  assert.match(k, /^m_[0-9a-f]{32}$/);
  assert.ok(!k.includes("a@b"));
  assert.equal(k, nutzerKennung("a@b.de", PFEFFER));
});

test("Anmeldung, CSRF-Kopfzeile, Einwilligung nur mit drei echten Ja, Daumen geht pseudonym an den Autopiloten", async () => {
  const w = await aufbau();
  try {
    assert.equal((await w.rufe("/api/ich")).j.angemeldet, false);
    assert.equal((await w.rufe("/api/code", { methode: "POST", daten: { email: "a@b.de" }, ohneKopf: true })).status, 403);
    assert.equal((await w.rufe("/api/chat", { methode: "POST", daten: { frage: "hi" } })).status, 401);
    assert.equal((await w.anmelden()).status, 200);
    assert.equal(w.post[0].e, "test@example.com");
    const ich = (await w.rufe("/api/ich")).j;
    assert.deepEqual([ich.angemeldet, ich.einwilligung, ich.einwilligungMoeglich], [true, false, true]);

    // Daumen ohne Einwilligung: nichts geht raus.
    const d0 = await w.rufe("/api/daumen", { methode: "POST", daten: { daumen: "hoch", frage: "f", antwort: "a" } });
    assert.equal(d0.j.grund, "keine_einwilligung");
    assert.equal(w.aufrufe.filter((a) => a.url.includes("lernpaar")).length, 0);

    // "ja" als Text ist KEIN ausdrueckliches Ja.
    const e0 = await w.rufe("/api/einwilligung", { methode: "POST", daten: { trainingJa: "ja", pruefungJa: true, rechteJa: true } });
    assert.equal(e0.j.ok, false);
    const e1 = await w.rufe("/api/einwilligung", { methode: "POST", daten: { trainingJa: true, pruefungJa: true, rechteJa: true } });
    assert.equal(e1.j.ok, true);
    const gesendet = JSON.parse(w.aufrufe.filter((a) => a.url.includes("einwilligung")).at(-1).opt.body);
    assert.equal(gesendet.datenschutzSha256, w.datenschutzSha256);
    assert.equal((await w.rufe("/api/ich")).j.einwilligung, true);

    const d1 = await w.rufe("/api/daumen", { methode: "POST", daten: { daumen: "hoch", frage: "Was ist 2+2?", antwort: "4" } });
    assert.equal(d1.j.erfasst, true);
    const lp = w.aufrufe.find((a) => a.url.includes("lernpaar"));
    assert.equal(lp.opt.headers["x-muuny-dienst"], "dienst-geheim");
    assert.match(lp.opt.headers["x-muuny-nutzer"], /^m_[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(lp.opt).includes("example.com"), "die E-Mail geht nie an den Autopiloten");
    assert.equal((await w.rufe("/api/daumen", { methode: "POST", daten: { daumen: "runter", frage: "f", antwort: "a" } })).j.grund, "kein_daumen_hoch");

    assert.equal((await w.rufe("/api/einwilligung", { methode: "DELETE" })).j.ok, true);
    assert.equal((await w.rufe("/api/ich")).j.einwilligung, false);
  } finally { w.schliesse(); }
});

test("Einwilligung bleibt gesperrt, wenn die Datenschutz-Fassung nicht zur Pruefsumme passt", async () => {
  const w = await aufbau({ erwartet: "0".repeat(64) });
  try {
    await w.anmelden();
    assert.equal((await w.rufe("/api/ich")).j.einwilligungMoeglich, false);
    const r = await w.rufe("/api/einwilligung", { methode: "POST", daten: { trainingJa: true, pruefungJa: true, rechteJa: true } });
    assert.equal(r.status, 503);
    assert.equal(w.aufrufe.filter((a) => a.url.includes("einwilligung")).length, 0);
  } finally { w.schliesse(); }
});

test("Ohne E-Mail-Versand: ehrliches 503 statt stiller Anmeldung", async () => {
  const w = await aufbau({ versand: null });
  try {
    const r = await w.rufe("/api/code", { methode: "POST", daten: { email: "a@b.de" } });
    assert.deepEqual([r.status, r.j.grund], [503, "email_versand_nicht_eingerichtet"]);
  } finally { w.schliesse(); }
});

test("Chat: Stream wird durchgereicht mit Modell und Wissenszahl; nur eine Frage gleichzeitig", async () => {
  let loslassen;
  const halt = new Promise((r) => { loslassen = r; });
  let erster = true;
  const w = await aufbau({ laufzeitAntwort: (opt) => {
    const koerper = JSON.parse(opt.body);
    assert.equal(koerper.stream, true);
    assert.equal(opt.headers.authorization, "Bearer lz");
    const langsam = erster; erster = false;
    const strom = new ReadableStream({ async start(c) {
      if (langsam) await halt;
      c.enqueue(new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"Antwort\"}}]}\n\ndata: [DONE]\n\n")); c.close();
    } });
    return new Response(strom, { headers: { "x-muuny-modell": "muuny-1.3", "x-muuny-wissen": "2" } });
  } });
  try {
    await w.anmelden();
    const erste = w.rufe("/api/chat", { methode: "POST", daten: { frage: "Frage 1" } });
    await new Promise((r) => setTimeout(r, 50));
    const zweite = await w.rufe("/api/chat", { methode: "POST", daten: { frage: "Frage 2" } });
    assert.equal(zweite.j.grund, "eine_frage_nach_der_anderen");
    loslassen();
    const r = await erste;
    assert.equal(r.status, 200);
    assert.equal(r.kopf.get("x-muuny-modell"), "muuny-1.3");
    assert.equal(r.kopf.get("x-muuny-wissen"), "2");
    assert.match(r.j, /Antwort/);
  } finally { w.schliesse(); }
});

test("Seiten: Datenschutz-Pruefsumme = ausgelieferte Bytes; strenge Sicherheitskopfzeilen", async () => {
  const w = await aufbau();
  try {
    const r = await w.rufe("/datenschutz");
    assert.equal(r.status, 200);
    const bytes = await readFile(`${ORDNER}datenschutz.html`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), w.datenschutzSha256);
    assert.match(r.kopf.get("content-security-policy"), /script-src 'self'/);
    assert.equal(r.kopf.get("x-frame-options"), "DENY");
    const start = await w.rufe("/");
    assert.match(start.j, /<script src="\/app.js" defer>/);
    assert.doesNotMatch(start.j, /<script>(?!<\/)/, "keine Inline-Skripte (CSP)");
  } finally { w.schliesse(); }
});
