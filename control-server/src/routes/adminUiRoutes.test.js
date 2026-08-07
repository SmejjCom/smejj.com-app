// smejj.com — Unit-Tests fuer die Auslieferung der Admin-Oberflaeche.
// Ausfuehren: node --test control-server/src/routes/adminUiRoutes.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";
import { handleAdminUiRoute } from "./adminUiRoutes.js";

const ENV = {};

function attrappe() {
  const res = { status: 0, headers: {}, body: "" };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (status, headers) => { res.status = status; Object.assign(res.headers, headers || {}); return res; };
  res.end = (body) => { res.body = body ? String(body) : ""; };
  return res;
}

async function anfrage(pfad, authUser, method = "GET") {
  const res = attrappe();
  const behandelt = await handleAdminUiRoute({ method, authUser }, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, ...res };
}

await (async () => {
  __clearMemoryStoreForTests();
  await putUser(createUserRecord({ email: "normal@example.de", name: "Normal", passwordHash: "scrypt$x" }), ENV);
  await putUser({ ...createUserRecord({ email: "chefin@example.de", name: "Chefin", passwordHash: "scrypt$x" }), role: "admin", emailVerifiedAt: "2026-01-01T00:00:00.000Z" }, ENV);
})();

test("fremde Pfade werden durchgereicht, nicht beantwortet", async () => {
  const a = await anfrage("/api/health", null);
  assert.equal(a.behandelt, false);
});

test("ohne Sitzung: lesbare HTML-Seite statt JSON", async () => {
  const a = await anfrage("/admin", null);
  assert.equal(a.status, 401);
  assert.match(a.headers["Content-Type"], /text\/html/);
  assert.match(a.body, /Nicht angemeldet/);
  assert.match(a.body, /smejj\.com anmelden/);
  assert.equal(a.body.includes("{"), false, "kein rohes JSON in der Seite");
});

test("ein Konto ohne Verwaltungsrolle bekommt eine Erklaerung, keine Datei", async () => {
  const a = await anfrage("/admin", { email: "normal@example.de" });
  assert.equal(a.status, 403);
  assert.match(a.body, /Keine Berechtigung/);
  assert.equal(a.body.includes("<div class=\"shell\">"), false, "das Geruest darf nicht heraus");
});

test("mit Adminrolle kommt die Oberflaeche", async () => {
  const a = await anfrage("/admin", { email: "chefin@example.de" });
  assert.equal(a.status, 200);
  assert.match(a.headers["Content-Type"], /text\/html/);
  assert.match(a.body, /Operations Console/);
  assert.match(a.body, /\/admin\/console\.js/);
});

test("Betreiberdaten gehoeren in keinen Zwischenspeicher und in keinen Index", async () => {
  const a = await anfrage("/admin", { email: "chefin@example.de" });
  assert.equal(a.headers["Cache-Control"], "private, no-store");
  assert.match(a.headers["X-Robots-Tag"], /noindex/);
});

test("das Stylesheet ist ohne Sitzung erreichbar — sonst waere die Fehlerseite unlesbar", async () => {
  const a = await anfrage("/admin/console.css", null);
  assert.equal(a.status, 200);
  assert.match(a.headers["Content-Type"], /text\/css/);
});

test("nur die Dateien der festen Liste werden ausgeliefert", async () => {
  for (const pfad of ["/admin/api.js", "/admin/views.js", "/admin/console.js", "/admin/index.html"]) {
    const a = await anfrage(pfad, { email: "chefin@example.de" });
    assert.equal(a.status, 200, pfad);
  }
});

test("alles ausserhalb der Liste ist nicht erreichbar — auch kodiert nicht", async () => {
  // Zwei Faelle, beide unbedenklich:
  //   1. Der Pfad erreicht die Route und faellt aus der Liste  -> 404.
  //   2. Die URL-Klasse normalisiert ".." schon vorher weg, der Pfad beginnt
  //      dann nicht mehr mit /admin -> die Route reicht ihn durch (behandelt
  //      = false) und die Konsole liefert nichts.
  // Verboten ist nur eines: dass die Konsole eine Datei herausgibt.
  const versuche = [
    "/admin/../package.json",
    "/admin/%2e%2e%2fpackage.json",
    "/admin/..%2f..%2fetc%2fpasswd",
    "/admin/console.js/../../../package.json",
    "/admin/server.js",
    "/admin/.env",
    "/admin/adminUiRoutes.js"
  ];
  for (const pfad of versuche) {
    const a = await anfrage(pfad, { email: "chefin@example.de" });
    assert.equal(a.status === 200, false, `${pfad} wurde ausgeliefert`);
    assert.ok(a.behandelt === false || a.status === 404, `${pfad}: unerwarteter Status ${a.status}`);
    assert.equal(a.body.includes("scrypt"), false);
    assert.equal(a.body.includes("dependencies"), false, `${pfad}: package.json durchgereicht`);
  }
});

test("die Konsole liefert nur aus, sie nimmt nichts entgegen", async () => {
  const a = await anfrage("/admin", { email: "chefin@example.de" }, "POST");
  assert.equal(a.status, 405);
});
