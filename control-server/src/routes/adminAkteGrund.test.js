// smejj.com — Die Grund-Pflicht der Akteneinsicht.
// Ausfuehren: node --test control-server/src/routes/adminAkteGrund.test.js
//
// Die Einsicht in eine Nutzerakte ist ein Zugriff auf personenbezogene Daten.
// Sie verlangt einen Grund und wird protokolliert. Dieser Test haelt fest,
// WIE der Kontrollpunkt am 2026-08-07 ausgehebelt wurde:
//
//   admin-ui/api.js baut die Adresse mit `encodeURIComponent(grund)`. Fehlt der
//   Grund, entsteht daraus die ZEICHENKETTE "undefined" — neun Zeichen, also
//   lang genug fuer die damalige Laengenpruefung. Die Akte ging auf, und im
//   Nachweisregister stand als Grund "undefined". Gemessen an fuenf echten
//   Eintraegen im Live-Log.
//
// Ein Kontrollpunkt, der sich mit einem verunglueckten Aufruf umgehen laesst,
// schuetzt nichts. Deshalb steht die Probe hier und nicht nur im Kopf.
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";
import { __clearAuditMemoryForTests, readAuditPage } from "../admin/auditLog.js";
import { handleAdminRoute } from "./adminRoutes.js";

const ENV = { SMEJJ_ADMIN_OWNER_EMAILS: "owner@example.de" };
const OWNER = { email: "owner@example.de" };

function attrappe() {
  const res = { status: 0, body: null, headers: {} };
  res.setHeader = (name, wert) => { res.headers[name] = wert; };
  res.writeHead = (status, kopf) => { res.status = status; Object.assign(res.headers, kopf || {}); return res; };
  res.end = (rumpf) => { try { res.body = rumpf ? JSON.parse(rumpf) : null; } catch { res.body = null; } };
  return res;
}

async function akte(abfrage) {
  const res = attrappe();
  const req = { method: "GET", authUser: OWNER, headers: {}, socket: {} };
  const behandelt = await handleAdminRoute(
    req, new URL(`http://x/api/admin/users/kundin@example.de${abfrage}`), res, { env: ENV }
  );
  return { behandelt, status: res.status, error: res.body?.error || "" };
}

async function aufbauen() {
  __clearMemoryStoreForTests();
  __clearAuditMemoryForTests();
  await putUser({
    ...createUserRecord({ email: "owner@example.de", name: "Owner", passwordHash: "h" }),
    role: "owner", emailVerifiedAt: "2026-01-01T00:00:00.000Z"
  }, ENV);
  await putUser(createUserRecord({ email: "kundin@example.de", name: "Kundin", passwordHash: "h" }), ENV);
}

test("ohne Grund keine Einsicht — gar kein Parameter, leer, zu kurz", async () => {
  await aufbauen();
  for (const abfrage of ["", "?reason=", "?reason=%20%20", "?reason=ab"]) {
    const antwort = await akte(abfrage);
    assert.equal(antwort.status, 400, `"${abfrage}" haette abgewiesen werden muessen`);
    assert.equal(antwort.error, "admin_reason_required");
  }
});

test("ein verunglueckter Aufruf ist kein Grund — \"undefined\" oeffnet die Akte NICHT", async () => {
  await aufbauen();
  // Genau die Zeichenkette, die encodeURIComponent(undefined) erzeugt.
  const antwort = await akte("?reason=undefined");
  assert.equal(antwort.status, 400, "neun Zeichen sind lang genug — Laenge allein reicht als Pruefung nicht");
  assert.equal(antwort.error, "admin_reason_required");

  // Die Geschwister derselben Familie.
  for (const schein of ["null", "NaN", "none", "-", "---", "n%2Fa", "k.A."]) {
    const weitere = await akte(`?reason=${schein}`);
    assert.equal(weitere.status, 400, `"${schein}" ist kein Grund`);
  }

  // Und nichts davon darf eine Spur hinterlassen: was nie eingesehen wurde,
  // gehoert auch nicht ins Nachweisregister.
  const log = await readAuditPage({ env: ENV });
  assert.equal(log.entries.length, 0, "abgewiesene Versuche schreiben keinen Einsichts-Nachweis");
});

test("ein echter Grund oeffnet die Akte und wird protokolliert", async () => {
  await aufbauen();
  const antwort = await akte("?reason=" + encodeURIComponent("Ticket 4471 — Rueckfrage der Nutzerin"));
  assert.equal(antwort.status, 200);

  const log = await readAuditPage({ env: ENV });
  assert.equal(log.entries.length, 1, "die Einsicht muss eine Spur hinterlassen");
  assert.equal(log.entries[0].reason, "Ticket 4471 — Rueckfrage der Nutzerin");
  assert.notEqual(log.entries[0].reason, "undefined");
});
