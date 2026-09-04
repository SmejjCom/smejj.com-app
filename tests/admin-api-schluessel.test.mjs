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

async function v1(pfad, klartext) {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = pfad;
  req.headers = { host: "smejj.com", authorization: `Bearer ${klartext}` };
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
