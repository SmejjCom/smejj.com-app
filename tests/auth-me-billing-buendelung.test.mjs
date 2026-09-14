// Waechter F6: beim Laden der angemeldeten App je EIN /api/auth/me und EIN
// /api/billing/status — nicht drei.
//
// DER BEFUND (Netz-Mitschnitt smejj.com, Chrome, 2026-09-14): 3x GET
// /api/auth/me (auth-gate.js, account-sessions.js via account-privacy.js,
// autonomous-coding.js) und 3x GET /api/billing/status (spur-start.js,
// account-sessions.fetchBillingStatus via onboarding-welcome.js und via
// hydrateBillingStatus). Der Speicher aus auth-me-speicher.js buendelte nur
// zwei der drei auth/me-Aufrufer; fuer billing/status gab es gar keinen.
//
// Gepruefte Faelle: alle Aufrufer haengen am gemeinsamen Speicher (Quelle),
// derselbe Speicher liefert drei Fragern EINE Antwort (Verhalten), und der
// Abo-Weg stellt keinen Aufrufer schlechter als seine eigene Frage vorher
// (Bearer zuerst, Cookie als Rueckfall, Fehlschlag ohne Nachhall).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { erzeugeAuthMeSpeicher } from "../public/shared/auth-me-speicher.js";

const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const MODUL = "../public/shared/billing-status-speicher.js";

test("alle drei auth/me-Aufrufer haengen am gemeinsamen Speicher — unter EINER Kennung", () => {
  // Gegenprobe zum Muster "gebaut, aber nicht angeschlossen" (Waechter vom
  // 2026-08-23 kannte nur gate + google-login; die anderen zwei fragten weiter).
  const quellen = {
    "auth-gate.js": lies("../public/auth-gate.js"),
    "google-login.js": lies("../public/google-login.js"),
    "account-sessions.js": lies("../public/account-sessions.js"),
    "autonomous-coding.js": lies("../public/autonomous-coding.js")
  };
  const kennungen = new Set();
  for (const [name, text] of Object.entries(quellen)) {
    const treffer = text.match(/from "\.\/shared\/auth-me-speicher\.js([^"]*)"/);
    assert.ok(treffer, `${name} importiert den Speicher nicht`);
    kennungen.add(treffer[1]);
  }
  // Zwei Kennungen waeren zwei Instanzen — und damit wieder zwei Anfragen.
  assert.equal(kennungen.size, 1, `mehrere Kennungen: ${[...kennungen].join(", ")}`);

  const konto = quellen["account-sessions.js"];
  const konto_me = konto.slice(konto.indexOf("export async function fetchAuthenticatedUser"), konto.indexOf("export async function logoutCurrentSession"));
  assert.match(konto_me, /authMeSpeicher\.hole\(/, "fetchAuthenticatedUser fragt am Speicher vorbei");

  const auto = quellen["autonomous-coding.js"];
  const auto_me = auto.slice(auto.indexOf("async function refreshSession"), auto.indexOf("async function refreshJobs"));
  assert.match(auto_me, /authMeSpeicher\.hole\(\(\) => api\(`\$\{API_ORIGIN\}\/api\/auth\/me`\)\)/, "refreshSession fragt am Speicher vorbei");
});

test("beide billing/status-Aufrufer gehen ueber holeBillingStatus — kein direkter fetch mehr", () => {
  const spur = lies("../public/spur-start.js");
  const konto = lies("../public/account-sessions.js");
  for (const [name, text] of [["spur-start.js", spur], ["account-sessions.js", konto]]) {
    const treffer = text.match(/from "\.\/shared\/billing-status-speicher\.js([^"]*)"/);
    assert.ok(treffer, `${name} importiert den Abo-Speicher nicht`);
    assert.match(text, /holeBillingStatus\(\)/, `${name} ruft holeBillingStatus nicht auf`);
  }
  assert.doesNotMatch(spur, /fetch\(`\$\{API_ORIGIN\}\/api\/billing\/status`/, "spur-start.js fragt noch selbst");
  assert.doesNotMatch(konto, /fetch\(API\.billingStatus/, "account-sessions.js fragt noch selbst");
  const kennungen = new Set([spur, konto].map((t) => t.match(/billing-status-speicher\.js([^"]*)"/)[1]));
  assert.equal(kennungen.size, 1, "zwei Kennungen = zwei Instanzen = zwei Anfragen");
});

test("drei Frager, EINE Anfrage — auch wenn sie 2 s auseinander liegen", async () => {
  // Der Kern von F6, am Speicher selbst nachgestellt: Gate (0 ms),
  // Kontoseite (in-flight), smejjBot (2 s spaeter, innerhalb der Frist).
  let jetzt = 1000;
  const sp = erzeugeAuthMeSpeicher({ uhr: () => jetzt });
  let anfragen = 0;
  const holen = () => { anfragen += 1; return new Promise((r) => setTimeout(() => r({ authenticated: true, user: { email: "a@b.c" } }), 10)); };
  const [gate, konto] = await Promise.all([sp.hole(holen), sp.hole(holen)]);
  jetzt += 2000;
  const bot = await sp.hole(holen);
  assert.equal(anfragen, 1);
  assert.deepEqual(gate, konto); assert.deepEqual(konto, bot);
});

function fetchAttrappe(antworten) {
  // antworten: (init) => { status, body } — zaehlt jede Anfrage mit.
  const aufrufe = [];
  const fetchFn = async (url, init = {}) => {
    aufrufe.push({ url, init });
    const { status = 200, body = null } = antworten(init, aufrufe.length);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchFn, aufrufe };
}

test("Abo-Stand: mit gueltigem Bearer genau EINE Anfrage, und sie traegt den Bearer", async () => {
  const { holeBillingStatus } = await import(MODUL);
  const { fetchFn, aufrufe } = fetchAttrappe(() => ({ body: { ok: true, plan: "pro" } }));
  const sp = erzeugeAuthMeSpeicher();
  const [a, b, c] = await Promise.all([
    holeBillingStatus({ speicher: sp, fetchFn, origin: "https://api.test", token: "T1" }),
    holeBillingStatus({ speicher: sp, fetchFn, origin: "https://api.test", token: "T1" }),
    holeBillingStatus({ speicher: sp, fetchFn, origin: "https://api.test", token: "T1" })
  ]);
  assert.equal(aufrufe.length, 1, "drei Frager, eine Anfrage");
  assert.equal(aufrufe[0].url, "https://api.test/api/billing/status");
  assert.equal(aufrufe[0].init.headers.Authorization, "Bearer T1");
  assert.equal(a.plan, "pro"); assert.deepEqual(a, b); assert.deepEqual(b, c);
});

test("Abo-Stand: scheitert der Bearer, traegt das Cookie — kein Aufrufer steht schlechter da", async () => {
  // Vorher fragte spur-start.js per Cookie und die Kontoseite per Bearer.
  // Teilten sie sich blind die erste Anfrage, bekaeme die Kontoseite auf iOS
  // (keine fremden Cookies) eine 401 — ein zahlender Kunde saehe "Frei".
  const { frageBillingStatus } = await import(MODUL);
  const { fetchFn, aufrufe } = fetchAttrappe((init) => init.credentials === "include"
    ? { body: { ok: true, plan: "plus" } }
    : { status: 401, body: { ok: false, error: "authentication_required" } });
  const daten = await frageBillingStatus({ fetchFn, origin: "https://api.test", token: "abgelaufen" });
  assert.equal(daten?.plan, "plus");
  assert.equal(aufrufe.length, 2, "erst Bearer, dann Cookie");
  assert.equal(aufrufe[0].init.headers.Authorization, "Bearer abgelaufen");
  assert.equal(aufrufe[1].init.credentials, "include");
  assert.equal(aufrufe[1].init.headers, undefined, "der Cookie-Weg traegt keinen Bearer — der Server naehme sonst den Bearer");
});

test("Abo-Stand: ohne Token nur der Cookie-Weg; ohne Origin gar keine Anfrage", async () => {
  const { frageBillingStatus } = await import(MODUL);
  const { fetchFn, aufrufe } = fetchAttrappe(() => ({ body: { ok: true, plan: "max" } }));
  assert.equal((await frageBillingStatus({ fetchFn, origin: "https://api.test", token: "" }))?.plan, "max");
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0].init.credentials, "include");
  assert.equal(await frageBillingStatus({ fetchFn, origin: "", token: "T" }), null);
  assert.equal(aufrufe.length, 1, "ohne Origin nichts");
});

test("Abo-Stand: ein Fehlschlag wird NICHT gemerkt, die naechste Frage geht wieder ans Netz", async () => {
  const { holeBillingStatus } = await import(MODUL);
  let runde = 0;
  const { fetchFn, aufrufe } = fetchAttrappe(() => (runde === 0
    ? { status: 503, body: { ok: false, error: "billing_status_unavailable" } }
    : { body: { ok: true, plan: "pro" } }));
  const sp = erzeugeAuthMeSpeicher();
  const deps = { speicher: sp, fetchFn, origin: "https://api.test", token: "T" };
  assert.equal(await holeBillingStatus(deps), null, "503 ist keine Aussage ueber das Abo");
  assert.equal(sp.frisch, false, "der Fehlschlag darf nicht liegenbleiben");
  runde = 1;
  assert.equal((await holeBillingStatus(deps))?.plan, "pro");
  assert.equal(aufrufe.filter((a) => a.init.credentials === "include").length, 1, "der Cookie-Rueckfall lief nur in der Fehlrunde");
});

test("Abo-Stand: Netzfehler wirft nie — null, wie die Aufrufer es erwarten", async () => {
  const { frageBillingStatus } = await import(MODUL);
  const fetchFn = async () => { throw new TypeError("Failed to fetch"); };
  assert.equal(await frageBillingStatus({ fetchFn, origin: "https://api.test", token: "T" }), null);
});
