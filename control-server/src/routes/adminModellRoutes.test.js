// smejj.com — Unit-Tests fuer die schreibenden Modell-Routen.
//
// Was hier schiefgehen darf, geht auf dem Betriebsbildschirm still schief:
//   - eine Aktion ohne Recht,
//   - eine Aktion ohne Grund (im Audit spaeter nicht von einem Versehen zu
//     unterscheiden),
//   - ein Loeschauftrag, der nur die Haelfte schafft und trotzdem "ok" meldet,
//   - ein Schluessel, der im Audit-Log landet.
//
// Ausfuehren: node --test control-server/src/routes/adminModellRoutes.test.js
import test from "node:test";
import assert from "node:assert/strict";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "haupteimer",
  IDRIVE_E2_DEPLOY_BUCKET: "deployeimer",
  ADMIN_AUDIT_DISABLED: "1"
});

/** Sammelt, was die Route antwortet. */
function fakeRes() {
  return {
    kopf: {},
    setHeader(k, v) { this.kopf[k] = v; },
    status: null,
    daten: null,
    writeHead(s) { this.status = s; return this; },
    end(text) { try { this.daten = JSON.parse(text); } catch { this.daten = text; } return this; }
  };
}

function fakeReq(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    socket: { remoteAddress: "203.0.113.7" },
    authUser: { email: "chef@smejj.com" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body), "utf8"); }
  };
}

// Die Route zieht ihre Bausteine ueber statische Importe. Statt sie zu
// verbiegen, wird hier das geprueft, was ohne Netz entscheidbar ist: die
// Verriegelungen VOR dem ersten Seiteneffekt.

test("fremde Pfade werden nicht beansprucht", async () => {
  const { handleAdminModellRoute } = await import("./adminModellRoutes.js");
  const res = fakeRes();
  const genommen = await handleAdminModellRoute(
    fakeReq({}), new URL("https://x/api/admin/nutzer"), res, { env: ENV });
  assert.equal(genommen, false);
  assert.equal(res.status, null, "es darf nichts geantwortet worden sein");
});

test("unbekannte Unteraktion wird durchgereicht, nicht mit 404 verschluckt", async () => {
  const { handleAdminModellRoute } = await import("./adminModellRoutes.js");
  const res = fakeRes();
  const genommen = await handleAdminModellRoute(
    fakeReq({}), new URL("https://x/api/admin/modelle/tanzen"), res, { env: ENV });
  assert.equal(genommen, false);
  assert.equal(res.status, null);
});

test("GET auf eine Schreibaktion wird mit 405 abgewiesen", async () => {
  const { handleAdminModellRoute } = await import("./adminModellRoutes.js");
  const res = fakeRes();
  const req = fakeReq({});
  req.method = "GET";
  const genommen = await handleAdminModellRoute(
    req, new URL("https://x/api/admin/modelle/schalten"), res, { env: ENV });
  assert.equal(genommen, true);
  assert.equal(res.status, 405);
  assert.equal(res.daten.error, "admin_method_not_allowed");
});

test("ohne angemeldeten Admin passiert gar nichts", async () => {
  const { handleAdminModellRoute } = await import("./adminModellRoutes.js");
  const res = fakeRes();
  const req = fakeReq({ id: "x", an: true, reason: "weil es gebraucht wird" });
  req.authUser = null;
  const genommen = await handleAdminModellRoute(
    req, new URL("https://x/api/admin/modelle/schalten"), res, { env: ENV });
  assert.equal(genommen, true);
  assert.ok(res.status >= 400, `erwartet Ablehnung, kam ${res.status}`);
  assert.notEqual(res.status, 200);
});

// --- Reine Regeln, ohne Netz: die Huerden fuer den Grund -------------------

test("die Grundhuerde fuers Loeschen ist hoeher als fuers Schalten", async () => {
  const quelle = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./adminModellRoutes.js", import.meta.url), "utf8"));
  const schalten = Number((quelle.match(/const GRUND_MIN = (\d+)/) || [])[1]);
  const loeschen = Number((quelle.match(/const GRUND_MIN_LOESCHEN = (\d+)/) || [])[1]);
  assert.ok(schalten >= 10, "Schalten braucht mindestens 10 Zeichen");
  assert.ok(loeschen > schalten, "Loeschen ist nicht umkehrbar und muss teurer sein");
});

test("der Schluessel selbst steht nirgends im Audit-Eintrag", async () => {
  const quelle = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./adminModellRoutes.js", import.meta.url), "utf8"));
  const block = quelle.slice(quelle.indexOf("async function schluesselErsetzen"));
  const auditBlock = block.slice(block.indexOf("appendAuditEntry"), block.indexOf("}, { env });"));
  assert.ok(!/schluessel[,:}\s]/.test(auditBlock.replace(/laenge: schluessel\.length/g, "")),
    "im Audit-Eintrag darf der Schluessel nicht vorkommen");
  assert.match(auditBlock, /laenge: schluessel\.length/, "nur die Laenge ist erlaubt");
});

test("ein Loeschlauf mit Resten meldet 207 und ok:false, nicht 200", async () => {
  const quelle = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./adminModellRoutes.js", import.meta.url), "utf8"));
  assert.match(quelle, /uebrig === 0 \? 200 : 207/, "Teilerfolg braucht einen eigenen Status");
  assert.match(quelle, /ok: uebrig === 0/, "ok darf bei Resten nicht wahr sein");
});

test("eingeschaltet wird nur, was ein Motor laden kann", async () => {
  const quelle = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./adminModellRoutes.js", import.meta.url), "utf8"));
  assert.match(quelle, /if \(an && !modell\.motorId\)/, "ohne Motor darf nicht eingeschaltet werden");
  assert.match(quelle, /error: "kein_motor"/);
});
