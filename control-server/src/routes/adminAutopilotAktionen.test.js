// smejj.com — Tests fuer die schreibenden Autopiloten-Aktionen (Modul AP, Stufe 2b).
//
// Der wichtigste Test ist der zweite: OHNE frische Bestaetigung passiert
// nichts. Genau dafuer gibt es den Step-up — eine gekaperte Sitzung soll die
// Ampel nicht stummschalten koennen, denn Stummschalten ist das perfekte
// Werkzeug, um einen Einbruch unsichtbar zu machen.
//
// Ausfuehren: node --test control-server/src/routes/adminAutopilotAktionen.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleAutopilotAktion } from "./adminAutopilotAktionen.js";
import { autopilotUebersicht, istInWartung, setzeWartung } from "../admin/opsAutopiloten.js";
import { oeffneFenster } from "../admin/stepUp.js";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";

const OWNER = "owner@example.de";
const NUR_LESEN = "auditor@example.de";
const ENV = { SMEJJ_ADMIN_OWNER_EMAILS: OWNER };

// Eine bestaetigte Adresse ist Pflicht (Regel seit 2026-08-06): der Step-up
// schickt seinen Code genau dorthin.
test("Aufbau: Admin-Konten anlegen", async () => {
  __clearMemoryStoreForTests();
  await putUser({
    ...createUserRecord({ email: OWNER, name: "Owner", passwordHash: "h" }),
    role: "owner", emailVerifiedAt: "2026-01-01T00:00:00.000Z"
  }, ENV);
  await putUser({
    ...createUserRecord({ email: NUR_LESEN, name: "Auditor", passwordHash: "h" }),
    role: "auditor", emailVerifiedAt: "2026-01-01T00:00:00.000Z"
  }, ENV);
});

function attrappe() {
  const res = { status: 0, headers: {}, body: "" };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (status, headers) => { res.status = status; Object.assign(res.headers, headers || {}); return res; };
  res.end = (body) => { res.body = body ? String(body) : ""; };
  return res;
}

async function ruf(body, { email = OWNER, method = "POST", pfad = "/api/admin/ops/autopiloten/aktion" } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.headers = {};
  req.authUser = { email, method: "email" };
  const res = attrappe();
  const behandelt = await handleAutopilotAktion(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

test("fremde Pfade und GET werden nicht bedient", async () => {
  assert.equal((await ruf({}, { pfad: "/api/admin/ops/autopiloten" })).behandelt, false);
  assert.equal((await ruf({}, { method: "GET" })).status, 405);
});

test("OHNE Step-up passiert nichts — auch nicht fuer den Owner", async () => {
  const antwort = await ruf({ aktion: "wartung.ein", id: "training-loop", grund: "Wartung am Dienst" });
  assert.equal(antwort.status, 403);
  assert.equal(antwort.json.error, "admin_step_up_required");
  assert.equal(istInWartung("training-loop"), false, "abgewiesen heisst: nichts veraendert");
});

test("mit Step-up: Wartung ein und wieder aus", async () => {
  oeffneFenster(OWNER);
  const ein = await ruf({ aktion: "wartung.ein", id: "training-loop", grund: "Dienst ist bewusst stillgelegt" });
  assert.equal(ein.status, 200);
  assert.equal(istInWartung("training-loop"), true);

  const a = autopilotUebersicht({ jetztMs: Date.now() }).autopiloten.find((x) => x.id === "training-loop");
  assert.equal(a.ampel, "wartung");
  assert.ok(a.ampelGrund.includes("stillgelegt"), "der Grund gehoert in die Ansicht");

  oeffneFenster(OWNER);
  const aus = await ruf({ aktion: "wartung.aus", id: "training-loop", grund: "Wartung beendet, laeuft wieder" });
  assert.equal(aus.status, 200);
  assert.equal(istInWartung("training-loop"), false);
});

test("ein zu kurzer Grund wird abgewiesen — sonst ist es im Nachhinein ein Versehen", async () => {
  oeffneFenster(OWNER);
  const antwort = await ruf({ aktion: "wartung.ein", id: "training-loop", grund: "weg" });
  assert.equal(antwort.status, 400);
  assert.equal(antwort.json.error, "grund_zu_kurz");
  assert.equal(istInWartung("training-loop"), false);
});

test("unbekannte Kennung und unbekannte Aktion werden abgewiesen", async () => {
  oeffneFenster(OWNER);
  assert.equal((await ruf({ aktion: "wartung.ein", id: "gibtsnicht", grund: "egal egal egal" })).status, 404);
  oeffneFenster(OWNER);
  assert.equal((await ruf({ aktion: "loeschen", id: "training-loop", grund: "egal egal egal" })).status, 400);
});

test("Sofortpruefung gibt es nur fuer den Waechter — er allein hat eine Adresse", async () => {
  oeffneFenster(OWNER);
  const antwort = await ruf({ aktion: "pruefen", id: "qualitaetsmessung", grund: "Versuch" });
  assert.equal(antwort.status, 400);
  assert.equal(antwort.json.error, "pruefen_nicht_moeglich");
});

test("ein Auditor darf NICHT stummschalten — er sucht Luecken, statt sie zuzudecken", async () => {
  oeffneFenster(NUR_LESEN);
  const antwort = await ruf({ aktion: "wartung.ein", id: "training-loop", grund: "unerlaubter Versuch" }, { email: NUR_LESEN });
  assert.equal(antwort.status, 403);
  assert.equal(antwort.json.error, "admin_permission_denied");
  assert.equal(istInWartung("training-loop"), false);
});

test("Aufraeumen: keine Wartung bleibt stehen", async () => {
  await setzeWartung("training-loop", false, { env: ENV });
  assert.equal(istInWartung("training-loop"), false);
});
