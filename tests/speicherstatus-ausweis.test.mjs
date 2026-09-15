// smejj.com — A-bis-Z-Livetest 15.09.2026: "Systemzustand → Lokaler Arbeitsbereich"
// rief GET /api/storage/status OHNE Ausweis und bekam 401 (Konsole rot). Jetzt geht
// der Ausweis mit, und ein 401 wird freundlich als "nur angemeldet" angezeigt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// config.js greift auf window/location zu — fuer den Import ein duennes Fenster.
globalThis.window ??= { location: { hostname: "smejj.com", origin: "https://smejj.com" } };
globalThis.location ??= globalThis.window.location;
const { getJson, ausweisKopf, NUR_ANGEMELDET } = await import("../public/shared/http-json.js");

function speicher(werte) { return { getItem: (k) => werte[k] ?? null }; }

function mitFetch(antworten, fn) {
  const alt = globalThis.fetch;
  const aufrufe = [];
  globalThis.fetch = async (url, init) => { aufrufe.push({ url, init }); return antworten(url, init); };
  return fn(aufrufe).finally(() => { globalThis.fetch = alt; });
}
const antwort = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
// Wie der Control-Server: ohne Bearer 401, mit Bearer die Daten.
const server = (_url, init) => (init?.headers?.Authorization ? antwort(200, { configured: true, bucket: "smejj-app" }) : antwort(401, { ok: false, error: "authentication_required" }));

test("KAPUTT (v883): ohne Ausweis kommt 401 als roher Fehler", async () => {
  const alt = globalThis.localStorage;
  globalThis.localStorage = speicher({ "smejj.auth.accessToken.v1": "tok" });
  try {
    await mitFetch(server, async (aufrufe) => {
      const daten = await getJson("/api/storage/status");
      assert.equal(aufrufe[0].init?.headers?.Authorization, undefined, "der alte Aufruf schickte keinen Ausweis");
      assert.equal(daten.error, "authentication_required");
    });
  } finally { globalThis.localStorage = alt; }
});

test("GESUND: mit Ausweis kommt der echte Status", async () => {
  const alt = globalThis.localStorage;
  globalThis.localStorage = speicher({ "smejj.auth.accessToken.v1": "tok" });
  try {
    await mitFetch(server, async (aufrufe) => {
      const daten = await getJson("/api/storage/status", { mitAusweis: true });
      assert.equal(aufrufe[0].init.headers.Authorization, "Bearer tok");
      assert.equal(daten.configured, true);
    });
  } finally { globalThis.localStorage = alt; }
});

test("GESUND: abgemeldet wird 401 zu einem freundlichen Hinweis", async () => {
  const alt = globalThis.localStorage;
  globalThis.localStorage = speicher({});
  try {
    await mitFetch(server, async () => {
      const daten = await getJson("/api/storage/status", { mitAusweis: true });
      assert.equal(daten.nurAngemeldet, true);
      assert.equal(daten.hinweis, NUR_ANGEMELDET);
    });
  } finally { globalThis.localStorage = alt; }
  assert.deepEqual(ausweisKopf({ localStorage: speicher({}), sessionStorage: speicher({ "smejj.auth.accessToken.v1": "s" }) }), { Authorization: "Bearer s" });
});

test("Verdrahtung: alle Aufrufe von /api/storage/status tragen den Ausweis", () => {
  const app = readFileSync("public/app.js", "utf8");
  const aufrufe = app.match(/CLIENT_ROUTES\.api\.storageStatus[^)]*\)/g) || [];
  assert.equal(aufrufe.length, 3);
  for (const a of aufrufe) assert.match(a, /mitAusweis: true/, a);
  assert.match(app, /if \(s\?\.nurAngemeldet\) \{ setText\("#idriveStatusText", "IDrive e2: nur angemeldet sichtbar"\)/);
  assert.match(readFileSync("public/uploads-surface.js", "utf8"), /getJson\(CLIENT_ROUTES\.api\.storageStatus, \{ mitAusweis: true \}\)/);
});
