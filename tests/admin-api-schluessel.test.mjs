// smejj.com — Vom Admin ausgestellte API-Schluessel (smejj-adm-…), Beschluss 2026-09-03.
//
// Geprueft wird die ganze Kette, die live teuer waere, wenn sie kaputt ist:
//   * nur Owner/Admin stellen aus, Support/Finance/Auditor bekommen 403,
//   * Laufzeit ist Pflicht, unbekannte Codes 400, unbefristet ist moeglich,
//   * der Torwaechter an /v1 nimmt den Schluessel, der Verbrauch laeuft auf das
//     Konto des ausstellenden Admins, die Nutzung wird je Schluessel gezaehlt,
//   * Ablauf und Widerruf sperren (401 api_key_expired / api_key_revoked),
//   * Ausstellung und Widerruf stehen im Audit-Log, der Klartext nirgends.
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../control-server/src/auth/emailUserStore.js";
import { __clearAuditMemoryForTests, readAuditPage } from "../control-server/src/admin/auditLog.js";
import { __clearProviderCredentialMemoryForTests } from "../control-server/src/providers/providerCredentialVault.js";
import { __leerePruefCache, hatSchluesselForm, merkeBenutzung, pruefeSchluessel } from "../control-server/src/publicapi/publicApiKeys.js";
import { __leereAdminNutzungPuffer, kontoIdVon, listeAusgestellt, stelleAus, widerrufeAusgestellt } from "../control-server/src/publicapi/publicApiAdminKeys.js";
import { handleAdminGeldRoute } from "../control-server/src/routes/adminGeldRoutes.js";
import { handlePublicApiRoute } from "../control-server/src/publicapi/publicApiRoutes.js";

const ENV = {
  SMEJJ_PUBLIC_API_ENABLED: "1",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-key-2026",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: Buffer.alloc(32, 9).toString("base64"),
  SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY: "YES",
  SMEJJ_LLM_BASE_URL: "https://backend.example.com/v1",
  SMEJJ_LLM_API_KEY: "geheim",
  SMEJJ_LLM_MODEL: "fremdmodell",
  SMEJJ_LLM_PROVIDER_ORDER: "custom"
};
const OWNER = { email: "owner@example.de" };
const ADMIN = { email: "zweite@example.de" };
const SUPPORT = { email: "helfer@example.de" };
const AUDITOR = { email: "pruefer@example.de" };

async function aufbauen() {
  __clearMemoryStoreForTests();
  __clearAuditMemoryForTests();
  __clearProviderCredentialMemoryForTests();
  __leerePruefCache();
  __leereAdminNutzungPuffer();
  const bestaetigt = "2026-01-01T00:00:00.000Z";
  await putUser({ ...createUserRecord({ email: OWNER.email, name: "Owner", passwordHash: "h" }), role: "owner", emailVerifiedAt: bestaetigt }, ENV);
  await putUser({ ...createUserRecord({ email: ADMIN.email, name: "Zweite", passwordHash: "h" }), role: "admin", emailVerifiedAt: bestaetigt }, ENV);
  await putUser({ ...createUserRecord({ email: SUPPORT.email, name: "Helfer", passwordHash: "h" }), role: "support", emailVerifiedAt: bestaetigt }, ENV);
  await putUser({ ...createUserRecord({ email: AUDITOR.email, name: "Pruefer", passwordHash: "h" }), role: "auditor", emailVerifiedAt: bestaetigt }, ENV);
}

function attrappe() {
  const res = { status: 0, body: null, headers: {}, teile: [] };
  res.setHeader = (n, v) => { res.headers[String(n).toLowerCase()] = v; };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); return res; };
  res.write = (t) => { res.teile.push(String(t)); };
  res.end = (b) => { if (b !== undefined) res.teile.push(String(b)); const text = res.teile.join(""); res.body = text ? JSON.parse(text) : null; };
  return res;
}

async function admin(method, pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method, authUser, headers: {}, socket: {},
    on(ereignis, rueckruf) {
      if (ereignis === "data" && koerper !== undefined) rueckruf(JSON.stringify(koerper));
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAdminGeldRoute(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, body: res.body };
}

async function v1(pfad, klartext, koerper) {
  const roh = koerper === undefined ? "" : JSON.stringify(koerper);
  const req = Readable.from(roh ? [roh] : []);
  req.method = koerper === undefined ? "GET" : "POST";
  req.url = pfad;
  req.headers = { host: "smejj.com", authorization: `Bearer ${klartext}`, "content-type": "application/json" };
  const res = attrappe();
  await handlePublicApiRoute(req, new URL(pfad, "https://smejj.com"), res, { env: ENV, fetchImpl: () => { throw new Error("kein fetch erwartet"); } });
  return res;
}

test("Owner stellt aus: Klartext einmal, smejj-adm-Praefix, Laufzeit, Audit-Eintrag ohne Klartext", async () => {
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Partnerfirma Nord", laufzeit: "10j", notiz: "Pilot 2026" });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.match(a.body.apiKey, /^smejj-adm-[A-Za-z0-9_-]{32}$/);
  assert.ok(hatSchluesselForm(a.body.apiKey));
  assert.equal(a.body.schluessel.ausgestelltFuer, "Partnerfirma Nord");
  assert.equal(a.body.schluessel.ausgestelltVon, OWNER.email);
  assert.equal(a.body.schluessel.zustand, "aktiv");
  const tage = (Date.parse(a.body.schluessel.laeuftAbAm) - Date.parse(a.body.schluessel.erstelltAm)) / 86_400_000;
  assert.ok(Math.abs(tage - 3652) < 0.01, `10 Jahre = 3652 Tage, gemessen ${tage}`);
  assert.match(a.body.schluessel.keyHint, /^smejj-adm-••••/);

  // Liste zeigt den Schluessel, nie den Klartext.
  const liste = await admin("GET", "/api/admin/geld/api/ausgestellt", OWNER);
  assert.equal(liste.status, 200);
  assert.equal(liste.body.aktiv, 1);
  assert.ok(!JSON.stringify(liste.body).includes(a.body.apiKey), "Klartext in der Liste");

  // Audit: Ausstellung steht drin, Klartext nicht.
  const audit = await readAuditPage({ env: ENV });
  const eintrag = (audit.entries || audit.eintraege || []).find((e) => e.action === "apikey.issue");
  assert.ok(eintrag, "kein Audit-Eintrag apikey.issue: " + JSON.stringify(audit).slice(0, 200));
  assert.equal(eintrag.target, `adm:${a.body.schluessel.id}`);
  assert.ok(!JSON.stringify(eintrag).includes(a.body.apiKey), "Klartext im Audit-Log");
});

test("Rechte: Admin darf ausstellen, Support/Auditor nicht; Auditor darf lesen, Support nicht", async () => {
  await aufbauen();
  const ok = await admin("POST", "/api/admin/geld/api/ausstellen", ADMIN, { ausgestelltFuer: "Agentur", laufzeit: "1j" });
  assert.equal(ok.status, 201);
  const support = await admin("POST", "/api/admin/geld/api/ausstellen", SUPPORT, { ausgestelltFuer: "X", laufzeit: "1j" });
  assert.equal(support.status, 403);
  assert.equal(support.body.error, "admin_permission_denied");
  const auditor = await admin("POST", "/api/admin/geld/api/ausstellen", AUDITOR, { ausgestelltFuer: "X", laufzeit: "1j" });
  assert.equal(auditor.status, 403);
  const lesen = await admin("GET", "/api/admin/geld/api/ausgestellt", AUDITOR);
  assert.equal(lesen.status, 200, "Auditor hat apikeys.read und billing.read: lesen ja, ausstellen nein");
  assert.equal(lesen.body.aktiv, 1);
  const supportLesen = await admin("GET", "/api/admin/geld/api/ausgestellt", SUPPORT);
  assert.equal(supportLesen.status, 403);
});

test("Eingaben: Laufzeit Pflicht, unbekannter Code 400, Empfaenger Pflicht, unbefristet erlaubt", async () => {
  await aufbauen();
  const ohne = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Jemand" });
  assert.equal(ohne.status, 400);
  assert.equal(ohne.body.error, "api_key_laufzeit_required");
  const kaputt = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Jemand", laufzeit: "3 wochen" });
  assert.equal(kaputt.status, 400);
  assert.equal(kaputt.body.error, "api_key_laufzeit_invalid");
  const niemand = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { laufzeit: "1j" });
  assert.equal(niemand.status, 400);
  assert.equal(niemand.body.error, "api_key_empfaenger_required");
  const ewig = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Ewig", laufzeit: "unbefristet" });
  assert.equal(ewig.status, 201);
  assert.equal(ewig.body.schluessel.laeuftAbAm, "");
  const liste = await admin("GET", "/api/admin/geld/api/ausgestellt", OWNER);
  assert.equal(liste.body.unbefristet, 1);
});

test("Torwaechter: Schluessel gilt an /v1 auf das Konto des Admins, Nutzung wird je Schluessel gezaehlt", async () => {
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Kunde", laufzeit: "2j" });
  const zugang = await pruefeSchluessel(a.body.apiKey, ENV);
  assert.equal(zugang.ok, true);
  assert.equal(zugang.keyId, a.body.schluessel.id);
  assert.equal(zugang.kontoId, kontoIdVon({ userId: "", email: OWNER.email }).length ? zugang.kontoId : "", "kontoId gesetzt");
  assert.ok(zugang.kontoId, "Verbrauch braucht ein Konto");

  const res = await v1("/v1/models", a.body.apiKey);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  await merkeBenutzung(zugang.kontoId, zugang.keyId, { promptTokens: 120, completionTokens: 30 }, ENV);
  const liste = await listeAusgestellt(ENV);
  const s = liste.schluessel.find((k) => k.id === zugang.keyId);
  assert.equal(s.nutzung.anfragen, 1);
  assert.equal(s.nutzung.token, 150);
  assert.ok(s.zuletztBenutztAm);
});

test("Ablauf und Widerruf sperren: 401 api_key_expired / api_key_revoked, Widerruf braucht Grund und steht im Audit", async () => {
  await aufbauen();
  const actor = { userId: "", email: OWNER.email, role: "owner" };
  const vor40Tagen = () => new Date(Date.now() - 40 * 86_400_000);
  const alt = await stelleAus({ actor, ausgestelltFuer: "Alt", laufzeit: "30t" }, ENV, vor40Tagen);
  const abgelaufen = await v1("/v1/models", alt.klartext);
  assert.equal(abgelaufen.status, 401);
  assert.equal(abgelaufen.body.error.code, "api_key_expired");
  const liste = await listeAusgestellt(ENV);
  assert.equal(liste.schluessel.find((k) => k.id === alt.schluessel.id).zustand, "abgelaufen");

  const b = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Bald weg", laufzeit: "5j" });
  const ohneGrund = await admin("POST", "/api/admin/geld/api/widerrufen", OWNER, { id: b.body.schluessel.id, reason: "kurz" });
  assert.equal(ohneGrund.status, 400);
  assert.equal(ohneGrund.body.error, "admin_reason_required");
  const support = await admin("POST", "/api/admin/geld/api/widerrufen", SUPPORT, { id: b.body.schluessel.id, reason: "Vertrag beendet, Zugang weg" });
  assert.equal(support.status, 403);
  const weg = await admin("POST", "/api/admin/geld/api/widerrufen", OWNER, { id: b.body.schluessel.id, reason: "Vertrag beendet, Zugang weg" });
  assert.equal(weg.status, 200);
  assert.equal(weg.body.schluessel.zustand, "widerrufen");
  assert.equal(weg.body.schluessel.widerrufenVon, OWNER.email);
  const tot = await v1("/v1/models", b.body.apiKey);
  assert.equal(tot.status, 401);
  assert.equal(tot.body.error.code, "api_key_revoked");
  const audit = await readAuditPage({ env: ENV });
  const eintrag = (audit.entries || audit.eintraege || []).find((e) => e.action === "apikey.revoke" && e.target === `adm:${b.body.schluessel.id}`);
  assert.ok(eintrag, "Widerruf fehlt im Audit-Log");
  // Doppelter Widerruf ist harmlos.
  const nochmal = await widerrufeAusgestellt(b.body.schluessel.id, actor, ENV);
  assert.equal(nochmal.zustand, "widerrufen");
  const fremd = await admin("POST", "/api/admin/geld/api/widerrufen", OWNER, { id: "adm_000000000000", reason: "gibt es nicht, Test" });
  assert.equal(fremd.status, 404);
});

test("Andere Methoden bleiben bei Stripe: PUT/DELETE auf /api/admin/geld/* antworten 405", async () => {
  await aufbauen();
  const put = await admin("PUT", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "X", laufzeit: "1j" });
  assert.equal(put.status, 405);
  const post = await admin("POST", "/api/admin/geld/abos", OWNER, {});
  assert.equal(post.status, 405);
});

test("Sicherheits-Seite zaehlt Ausstellung (hoch) und Widerruf (mittel) mit", async () => {
  const { sicherheitsUebersicht } = await import("../control-server/src/admin/opsSicherheit.js");
  __clearAuditMemoryForTests();
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Zaehltest", laufzeit: "1j" });
  await admin("POST", "/api/admin/geld/api/widerrufen", OWNER, { id: a.body.schluessel.id, reason: "Zaehltest, sofort wieder weg" });
  const u = await sicherheitsUebersicht({ env: ENV, tage: 1 });
  const nach = Object.fromEntries((u.ereignisse.nachAktion || []).map((e) => [e.aktion, e]));
  assert.equal(nach["apikey.issue"]?.gewicht, "hoch", JSON.stringify(u.ereignisse).slice(0, 300));
  assert.equal(nach["apikey.revoke"]?.gewicht, "mittel");
  assert.equal(u.ereignisse.davonHoch, 1);
});

// ---- Monatsbudget je Schluessel (2026-09-04) ---------------------------------

test("Budget: beim Ausstellen setzbar, Deckel greift an /v1 mit 429", async () => {
  const { budgetStand, merkeAdminBenutzung } = await import("../control-server/src/publicapi/publicApiAdminKeys.js");
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Deckel", laufzeit: "1j", budgetToken: 1000 });
  assert.equal(a.status, 201);
  assert.equal(a.body.schluessel.budgetToken, 1000);
  const id = a.body.schluessel.id;

  assert.equal((await budgetStand(id, ENV)).ok, true);
  assert.equal((await v1("/v1/models", a.body.apiKey)).status, 200);

  await merkeAdminBenutzung(id, { promptTokens: 900, completionTokens: 200 }, ENV);
  const stand = await budgetStand(id, ENV);
  assert.equal(stand.ok, false, JSON.stringify(stand));
  assert.equal(stand.budgetToken, 1000);
  assert.ok(stand.verbrauchtToken >= 1000);

  const res = await v1("/v1/chat/completions", a.body.apiKey,
    { model: "smejj-1.0", messages: [{ role: "user", content: "Hallo" }] });
  assert.equal(res.status, 429, JSON.stringify(res.body));
  assert.equal(res.body.error.code, "key_budget_exceeded");
  assert.match(res.body.error.message, /Monatsbudget/);
});

test("Budget: ungeschriebener Puffer zaehlt sofort mit — der Deckel wartet nicht auf den Schreibvorgang", async () => {
  const { budgetStand, merkeAdminBenutzung } = await import("../control-server/src/publicapi/publicApiAdminKeys.js");
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Puffer", laufzeit: "1j", budgetToken: 500 });
  const id = a.body.schluessel.id;
  const t0 = new Date();
  // Erste Buchung schreibt, die zweite landet nur im Puffer (Drosselung 60 s).
  await merkeAdminBenutzung(id, { promptTokens: 100, completionTokens: 0 }, ENV, () => t0);
  await merkeAdminBenutzung(id, { promptTokens: 450, completionTokens: 0 }, ENV, () => t0);
  const stand = await budgetStand(id, ENV, () => t0);
  assert.equal(stand.verbrauchtToken, 550, "Index 100 + Puffer 450");
  assert.equal(stand.ok, false);
});

test("Budget: ohne Budget kein Deckel, Monatswechsel setzt den Zaehler zurueck", async () => {
  const { budgetStand, merkeAdminBenutzung, monatVon } = await import("../control-server/src/publicapi/publicApiAdminKeys.js");
  await aufbauen();
  const ohne = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Frei", laufzeit: "1j" });
  assert.equal(ohne.body.schluessel.budgetToken, 0);
  const frei = await budgetStand(ohne.body.schluessel.id, ENV);
  assert.equal(frei.ok, true);
  assert.equal(frei.budgetToken, 0);

  const mit = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Monat", laufzeit: "1j", budgetToken: 100 });
  const id = mit.body.schluessel.id;
  const september = new Date("2026-09-15T12:00:00.000Z");
  const oktober = new Date("2026-10-01T00:00:01.000Z");
  await merkeAdminBenutzung(id, { promptTokens: 150, completionTokens: 0 }, ENV, () => september);
  assert.equal((await budgetStand(id, ENV, () => september)).ok, false);
  assert.equal(monatVon(oktober), "2026-10");
  const neu = await budgetStand(id, ENV, () => oktober);
  assert.equal(neu.ok, true, JSON.stringify(neu));
  assert.equal(neu.verbrauchtToken, 0);
  assert.equal(neu.monat, "2026-10");
});

test("Budget aendern: nur Owner/Admin, Zahl geprueft, Audit-Eintrag, widerrufener Schluessel 409", async () => {
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Aendern", laufzeit: "1j", budgetToken: 100 });
  const id = a.body.schluessel.id;

  const support = await admin("POST", "/api/admin/geld/api/budget", SUPPORT, { id, budgetToken: 999 });
  assert.equal(support.status, 403);
  const kaputt = await admin("POST", "/api/admin/geld/api/budget", OWNER, { id, budgetToken: -5 });
  assert.equal(kaputt.status, 400);
  assert.equal(kaputt.body.error, "api_key_budget_invalid");
  const gross = await admin("POST", "/api/admin/geld/api/budget", OWNER, { id, budgetToken: 2_000_000_000 });
  assert.equal(gross.status, 400);

  const hoch = await admin("POST", "/api/admin/geld/api/budget", OWNER, { id, budgetToken: 50_000 });
  assert.equal(hoch.status, 200);
  assert.equal(hoch.body.schluessel.budgetToken, 50_000);
  const weg = await admin("POST", "/api/admin/geld/api/budget", OWNER, { id, budgetToken: 0 });
  assert.equal(weg.body.schluessel.budgetToken, 0, "0 entfernt das Budget");

  const audit = await readAuditPage({ env: ENV });
  const eintraege = (audit.entries || []).filter((e) => e.action === "apikey.budget");
  assert.equal(eintraege.length, 2);
  assert.equal(eintraege[0].target, `adm:${id}`);

  await admin("POST", "/api/admin/geld/api/widerrufen", OWNER, { id, reason: "Budget-Test beendet, Schluessel weg" });
  const nachher = await admin("POST", "/api/admin/geld/api/budget", OWNER, { id, budgetToken: 10 });
  assert.equal(nachher.status, 409);
});

test("Liste zaehlt, wieviele Schluessel am Deckel stehen", async () => {
  const { merkeAdminBenutzung } = await import("../control-server/src/publicapi/publicApiAdminKeys.js");
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Voll", laufzeit: "1j", budgetToken: 10 });
  await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Leer", laufzeit: "1j", budgetToken: 1_000_000 });
  await merkeAdminBenutzung(a.body.schluessel.id, { promptTokens: 50, completionTokens: 0 }, ENV);
  const liste = await admin("GET", "/api/admin/geld/api/ausgestellt", OWNER);
  assert.equal(liste.body.amDeckel, 1, JSON.stringify(liste.body.schluessel.map((s) => [s.ausgestelltFuer, s.budgetToken, s.monat])));
});

test("Budget: waehrend des Schreibvorgangs zaehlt der Verbrauch weiter — keine Luecke (Live-Befund 2026-09-04)", async () => {
  const { budgetStand, merkeAdminBenutzung } = await import("../control-server/src/publicapi/publicApiAdminKeys.js");
  await aufbauen();
  const a = await admin("POST", "/api/admin/geld/api/ausstellen", OWNER, { ausgestelltFuer: "Luecke", laufzeit: "1j", budgetToken: 5 });
  const id = a.body.schluessel.id;
  // Buchung anstossen, aber NICHT abwarten: genau der Zustand, in dem live die
  // zweite Anfrage durchkam (Puffer schon geleert, Index noch nicht geschrieben).
  const laeuft = merkeAdminBenutzung(id, { promptTokens: 40, completionTokens: 0 }, ENV);
  const waehrenddessen = await budgetStand(id, ENV);
  assert.equal(waehrenddessen.ok, false, "Deckel muss schon waehrend des Schreibens greifen: " + JSON.stringify(waehrenddessen));
  assert.ok(waehrenddessen.verbrauchtToken >= 40);
  await laeuft;
  const danach = await budgetStand(id, ENV);
  assert.equal(danach.ok, false);
  assert.equal(danach.verbrauchtToken, 40, "nach dem Schreiben genau einmal gezaehlt, nicht doppelt");
  const liste = await admin("GET", "/api/admin/geld/api/ausgestellt", OWNER);
  const s = liste.body.schluessel.find((x) => x.id === id);
  assert.equal(s.monat.token, 40);
  assert.equal(s.nutzung.token, 40);
});

test("Tagesmappe meldet unbefristete, bald ablaufende und gedeckelte Schluessel (Plan Punkt 5)", async () => {
  const { baueTagesmappe, fuehreSelbsttestAus } = await import("../control-server/src/autopilots/tagesmappeAutopilot.js");
  const leer = { uebersicht: () => ({ autopiloten: [] }), ticketLader: async () => [],
    storeFabrik: () => ({ liste: async () => ({ ok: true, datensaetze: [] }), lies: async () => null }) };
  const jetztMs = Date.parse("2026-09-04T00:00:00.000Z");

  const ohne = await baueTagesmappe({ ...leer, jetztMs, schluesselLader: async () => ({ ok: true, amDeckel: 0, schluessel: [] }) });
  assert.equal(ohne.wartenAufDich.filter((w) => w.art === "api-schluessel").length, 0, "ohne Schluessel keine Zeile");

  const mappe = await baueTagesmappe({
    ...leer, jetztMs,
    schluesselLader: async () => ({
      ok: true, amDeckel: 2,
      schluessel: [
        { id: "adm_1", ausgestelltFuer: "Partner Nord", zustand: "aktiv", laeuftAbAm: "" },
        { id: "adm_2", ausgestelltFuer: "Agentur", zustand: "aktiv", laeuftAbAm: "2026-09-20T00:00:00.000Z" },
        { id: "adm_3", ausgestelltFuer: "Weit weg", zustand: "aktiv", laeuftAbAm: "2036-01-01T00:00:00.000Z" },
        { id: "adm_4", ausgestelltFuer: "Alt", zustand: "widerrufen", laeuftAbAm: "" }
      ]
    })
  });
  const zeilen = mappe.wartenAufDich.filter((w) => w.art === "api-schluessel").map((w) => w.text);
  assert.equal(zeilen.length, 3, JSON.stringify(zeilen));
  assert.match(zeilen[0], /^1 unbefristeter API-Schluessel im Umlauf \(Partner Nord\)/, "widerrufene zaehlen nicht mit");
  assert.match(zeilen[1], /^1 API-Schluessel laufen in den naechsten 30 Tagen ab \(zuerst Agentur am 2026-09-20\)/);
  assert.match(zeilen[2], /^2 ausgestellte Schluessel am Monatsbudget/);

  // Stumme Quelle: faellt die Liste aus, steht das IN der Mappe.
  const stumm = await baueTagesmappe({ ...leer, jetztMs, schluesselLader: async () => { throw new Error("e2 weg"); } });
  assert.ok(stumm.stummeQuellen.some((q) => /Ausgestellte Schluessel/.test(q)), JSON.stringify(stumm.stummeQuellen));

  // Der eigene Selbsttest der Mappe (Waechter-TUEV: kaputte UND gesunde Probe).
  const selbsttest = await fuehreSelbsttestAus();
  assert.equal(selbsttest.bestanden, true, JSON.stringify(selbsttest.fehler));
});

// ---- Bedienbarkeit der Konsole (Betreiber-Befund 2026-09-04) ------------------
//
// "Schluessel ausstellen klick, macht nichts, ist kaputt." Gemessen war der
// Aufruf jedes Mal korrekt — der Ausloeser war nur ein 17 px hoher Text ohne
// Rahmen. Diese Tests halten fest, was die Flaeche koennen MUSS, damit der
// Befund nicht zurueckkommt.
test("Konsole: echter Knopf, beschriftete Felder, 44 px — kein Text-Link mehr", async () => {
  const fs = await import("node:fs");
  const views = fs.readFileSync("control-server/admin-ui/views-stage7.js", "utf8");
  const konsole = fs.readFileSync("control-server/admin-ui/console-stage7.js", "utf8");
  const css = fs.readFileSync("control-server/admin-ui/console.css", "utf8");

  // Ausloeser ist ein <button>, kein <span class="act">.
  assert.match(views, /<button type="button" class="btn primary adm-gross" id="admAusstellen">/);
  assert.doesNotMatch(views, /<span class="act" id="admAusstellen">/);
  // Auch die Zeilen-Aktionen sind Knoepfe.
  assert.match(views, /<button type="button" class="btn" data-admBudget=/);
  assert.match(views, /<button type="button" class="btn danger" data-admWiderruf=/);
  assert.doesNotMatch(views, /<span class="act[^"]*" data-adm/);

  // Jedes Feld hat eine sichtbare Beschriftung, nicht nur einen Platzhalter.
  for (const label of ["Für wen ist der Schlüssel?", "Wie lange soll er gelten?", "Monatsbudget", "Notiz"]) {
    assert.ok(views.includes(label), `Beschriftung fehlt: ${label}`);
  }
  assert.match(views, /class="adm-pflicht">Pflicht</, "Pflichtfeld ist als solches erkennbar");

  // 44 px fuer Felder und Hauptknopf (Touch-Ziel).
  assert.match(css, /\.adm-feld input,\.adm-feld select\{[^}]*min-height:44px/);
  assert.match(css, /\.btn\.adm-gross\{[^}]*min-height:44px/);

  // Rueckmeldung am Knopf, Sprung ins Pflichtfeld, Sperre waehrend des Laufs.
  assert.match(konsole, /function sageAmKnopf\(text, schlecht\)/);
  assert.match(konsole, /ausstellen\.disabled = true;/);
  assert.match(konsole, /ausstellen\.textContent = "Wird ausgestellt …";/);
  assert.match(konsole, /feld\.focus\(\); feld\.select\(\);/);
  // Eine unsinnige Budget-Eingabe wird vor dem Absenden abgefangen.
  assert.match(konsole, /if \(budgetToken && !\/\^\\d\+\$\/\.test\(budgetToken\)\)/);
});

test("Konsole: Zustand steht ausgeschrieben und farbig da (gruen Aktiv)", async () => {
  const fs = await import("node:fs");
  const views = fs.readFileSync("control-server/admin-ui/views-stage7.js", "utf8");
  assert.match(views, /function zustandPilleAdm\(zustand\)/);
  assert.match(views, /return pille\("● Aktiv", "ok"\)/);
  assert.match(views, /return pille\("● Abgelaufen", "warn"\)/);
  assert.match(views, /return pille\("● Widerrufen", "bad"\)/);
});

test("Konsole: der frische Schluessel bekommt einen eigenen Kasten mit Kopier-Knopf", async () => {
  const fs = await import("node:fs");
  const views = fs.readFileSync("control-server/admin-ui/views-stage7.js", "utf8");
  const konsole = fs.readFileSync("control-server/admin-ui/console-stage7.js", "utf8");
  assert.match(views, /class="adm-frisch"/);
  assert.match(views, /id="admFrischKey"/);
  assert.match(views, /id="admKopieren">Kopieren<\/button>/);
  assert.match(views, /Jetzt kopieren — er wird nie wieder angezeigt\./);
  assert.match(konsole, /navigator\.clipboard\.writeText\(code\.textContent\.trim\(\)\)/);
});
