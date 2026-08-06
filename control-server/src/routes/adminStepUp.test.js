// smejj.com — Tests fuer den Step-up der schreibenden Admin-Routen.
// Ausfuehren: node --test control-server/src/routes/adminStepUp.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";
import { __clearAuditMemoryForTests } from "../admin/auditLog.js";
import { handleAdminWriteRoute } from "./adminWriteRoutes.js";
import { __clearStepUpForTests, bestaetigeCode, fordereCode, istErhoeht } from "../admin/stepUp.js";

const ENV = {};
const OWNER = { email: "owner@example.de" };

function attrappe() {
  const res = { status: 0, body: null, headers: {} };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); return res; };
  res.end = (b) => { res.body = b ? JSON.parse(b) : null; };
  return res;
}

async function post(pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method: "POST", authUser, headers: {}, socket: {},
    on(ereignis, rueckruf) {
      if (ereignis === "data") rueckruf(JSON.stringify(koerper || {}));
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAdminWriteRoute(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, body: res.body };
}

async function aufbauen() {
  __clearMemoryStoreForTests();
  __clearAuditMemoryForTests();
  __clearStepUpForTests();
  await putUser({ ...createUserRecord({ email: OWNER.email, name: "Owner", passwordHash: "h" }), role: "owner" }, ENV);
  await putUser(createUserRecord({ email: "kundin@example.de", name: "Kundin", passwordHash: "h" }), ENV);
}

test("ohne offenes Fenster wird jede aendernde Aktion abgewiesen", async () => {
  await aufbauen();
  const a = await post("/api/admin/users/kundin@example.de/actions/block", OWNER, { reason: "Test Missbrauch" });
  assert.equal(a.status, 403);
  assert.equal(a.body.error, "admin_step_up_required");
});

test("die reine Antragsliste bleibt ohne Fenster erreichbar", async () => {
  await aufbauen();
  const a = await post("/api/admin/approvals", OWNER, {});
  assert.equal(a.status, 200);
});

test("Code anfordern, falsch raten, richtig bestaetigen, dann schreiben", async () => {
  await aufbauen();
  let code = "";
  const anforderung = await fordereCode(OWNER.email, {
    mail: async (nachricht) => {
      assert.equal(nachricht.to, OWNER.email);
      assert.equal(nachricht.art, "admin-step-up");
      code = nachricht.text.match(/\d{6}/)[0];
      return { sent: true };
    }
  });
  assert.equal(anforderung.ok, true);

  const falsch = await post("/api/admin/step-up/confirm", OWNER, { code: "000000" === code ? "111111" : "000000" });
  assert.equal(falsch.status, 403);
  assert.equal(falsch.body.error, "step_up_code_wrong");

  const richtig = await post("/api/admin/step-up/confirm", OWNER, { code });
  assert.equal(richtig.status, 200);
  assert.ok(richtig.body.fensterSek >= 60);
  assert.equal(istErhoeht(OWNER.email), true);

  const aktion = await post("/api/admin/users/kundin@example.de/actions/block", OWNER, { reason: "Missbrauch bestaetigt" });
  assert.equal(aktion.status, 200);
  assert.equal(aktion.body.after.status, "blocked");
});

test("ohne Mail-Versand entsteht kein Code und die Route sagt es ehrlich", async () => {
  await aufbauen();
  // ENV ist leer — der echte Mailer meldet unconfigured, die Route 503.
  const a = await post("/api/admin/step-up/request", OWNER, {});
  assert.equal(a.status, 503);
  assert.equal(a.body.error, "step_up_mail_failed");
  assert.equal(istErhoeht(OWNER.email), false);
});

test("ein abgelaufener Code oeffnet nichts", async () => {
  await aufbauen();
  let code = "";
  let uhr = 1_000_000;
  const jetzt = () => uhr;
  await fordereCode(OWNER.email, { mail: async (n) => { code = n.text.match(/\d{6}/)[0]; return { sent: true }; }, now: jetzt });
  uhr += 11 * 60 * 1000;
  const spaet = bestaetigeCode(OWNER.email, code, { now: jetzt });
  assert.equal(spaet.ok, false);
  assert.equal(spaet.error, "step_up_code_expired");
  assert.equal(istErhoeht(OWNER.email, { now: jetzt }), false);
});

test("nach fuenf Fehlversuchen ist der Code verbrannt", async () => {
  await aufbauen();
  let code = "";
  await fordereCode(OWNER.email, { mail: async (n) => { code = n.text.match(/\d{6}/)[0]; return { sent: true }; } });
  const falscher = code === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i++) bestaetigeCode(OWNER.email, falscher);
  const sechster = bestaetigeCode(OWNER.email, code);
  assert.equal(sechster.ok, false);
  assert.equal(sechster.error, "step_up_too_many_attempts");
  assert.equal(istErhoeht(OWNER.email), false);
});

test("das Fenster schliesst sich von selbst", async () => {
  await aufbauen();
  let code = "";
  let uhr = 5_000_000;
  const jetzt = () => uhr;
  await fordereCode(OWNER.email, { mail: async (n) => { code = n.text.match(/\d{6}/)[0]; return { sent: true }; }, now: jetzt });
  assert.equal(bestaetigeCode(OWNER.email, code, { now: jetzt }).ok, true);
  assert.equal(istErhoeht(OWNER.email, { now: jetzt }), true);
  uhr += 16 * 60 * 1000;
  assert.equal(istErhoeht(OWNER.email, { now: jetzt }), false);
});
