// smejj.com — Wächter-TÜV für den Nutzerreise-Wächter (dichter Takt des
// Probe-Nutzers, Nr. 29). Jede Zusage mit kaputter UND gesunder Probe —
// ein Wächter, der Rot nicht erkennt oder Grün rot malt, ist selbst kaputt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alsAmpelMeldung,
  laufNutzerreise,
  parseAlsModul,
  pruefeApiKernpfade,
  pruefeBuendelGleichheit,
  pruefeNachladeKette,
  pruefeStartseite
} from "./nutzerreiseWaechter.js";

const antwort = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });

// --- Parser-Probe: exakt die Fehlerklasse vom 2026-08-25 --------------------

test("parseAlsModul erkennt den Import-im-Import-Bruch (kaputte Probe)", async () => {
  const kaputt = 'import {\nimport { a } from "./b.js";\n  c\n} from "./d.js";\n';
  const probe = await parseAlsModul(kaputt);
  assert.equal(probe.ok, false, "der Bruch, der /code totlegte, muss auffallen");
});

test("parseAlsModul laesst ein gesundes Modul durch, ohne es auszufuehren", async () => {
  // Die Probe ENTHAELT eine Sprengfalle: wuerde das Modul ausgefuehrt,
  // wuerde globalThis markiert. Genau das darf nie passieren.
  const gesund = 'import { a } from "./b.js";\nglobalThis.__nutzerreiseSprengfalle = true;\nexport const x = 1;\n';
  const probe = await parseAlsModul(gesund);
  assert.equal(probe.ok, true, "gesunde Syntax darf nicht anschlagen");
  assert.equal(globalThis.__nutzerreiseSprengfalle, undefined, "die Probe darf NIE ausfuehren, nur parsen");
});

// --- Startseite -------------------------------------------------------------

test("Startseite: weisse Seite und Fehlstatus sind P0, gesunde Seite ist gruen", async () => {
  const gesund = await pruefeStartseite({ fetchImpl: async () => antwort(200, `<html>smejj${"x".repeat(6000)}</html>`) });
  assert.equal(gesund.passed, true);

  const weiss = await pruefeStartseite({ fetchImpl: async () => antwort(200, "<html></html>") });
  assert.equal(weiss.passed, false, "eine fast leere Antwort ist keine App");
  assert.equal(weiss.prio, "P0");

  const tot = await pruefeStartseite({ fetchImpl: async () => antwort(503, "kaputt") });
  assert.equal(tot.passed, false);
  assert.equal(tot.prio, "P0");
});

// --- Ein-Buendel-Vertrag ----------------------------------------------------

test("Buendel-Gleichheit: abweichende sw.js faellt auf, identische ist gruen", async () => {
  const swA = 'const CACHE_NAME = "smejj-shell-v697";\nrest';
  const swB = 'const CACHE_NAME = "smejj-shell-v695";\nrest';
  const kaputt = await pruefeBuendelGleichheit({
    fetchImpl: async (url) => antwort(200, url.startsWith("https://smejj.com") ? swA : swB)
  });
  assert.equal(kaputt.passed, false);
  assert.match(kaputt.error, /v697/, "die Meldung nennt beide Staende");
  assert.match(kaputt.error, /v695/);

  const gesund = await pruefeBuendelGleichheit({ fetchImpl: async () => antwort(200, swA) });
  assert.equal(gesund.passed, true);
  assert.equal(gesund.detail, "smejj-shell-v697");
});

// --- Nachlade-Kette ---------------------------------------------------------

const NACHLADER = 'const laden = () => import("./code-flaeche.js?v=57");\nexport { laden };\n';

test("Nachlade-Kette: ein Syntaxbruch in der live ausgelieferten Flaeche ist rot", async () => {
  const dateien = {
    "/assets/code-nachladen.js": NACHLADER,
    "/assets/chat-stream.js": 'export const ok = 1;\nimport { a } from "./b.js";\n',
    "/assets/code-flaeche.js?v=57": 'import {\nimport { a } from "./b.js";\n} from "./c.js";\n'
  };
  const lauf = await pruefeNachladeKette({ fetchImpl: async (url) => antwort(200, dateien[new URL(url).pathname + (new URL(url).search || "")] ?? "") });
  assert.equal(lauf.passed, false, "der Bruch vom 25.08. muss im dichten Takt auffallen");
  assert.match(lauf.error, /code-flaeche/);
});

test("Nachlade-Kette: gesunde Module sind gruen und die Flaechen-Version kommt aus dem Nachlader", async () => {
  const geholt = [];
  const dateien = {
    "/assets/code-nachladen.js": NACHLADER,
    "/assets/chat-stream.js": 'export const ok = 1;\nimport { a } from "./b.js";\n',
    "/assets/code-flaeche.js?v=57": 'export const flaeche = 1;\nimport { b } from "./c.js";\n'
  };
  const lauf = await pruefeNachladeKette({
    fetchImpl: async (url) => {
      const schluessel = new URL(url).pathname + (new URL(url).search || "");
      geholt.push(schluessel);
      return antwort(200, dateien[schluessel] ?? "");
    }
  });
  assert.equal(lauf.passed, true, `gesunde Kette darf nicht anschlagen: ${lauf.error}`);
  assert.ok(geholt.includes("/assets/code-flaeche.js?v=57"), "die im Nachlader genannte Version wird geprueft");
});

// --- API-Kernpfade ----------------------------------------------------------

test("API-Kernpfade: 401 ohne Anmeldung ist GESUND, 500 ist krank, 200 auf /api/admin/me ist krank", async () => {
  const gesund = await pruefeApiKernpfade({
    fetchImpl: async (url) => (url.endsWith("/api/health") ? antwort(200, "{}") : antwort(401, "{}"))
  });
  assert.equal(gesund.passed, true, `fail-closed ist der Normalzustand: ${gesund.error}`);

  const server500 = await pruefeApiKernpfade({ fetchImpl: async () => antwort(500, "kaputt") });
  assert.equal(server500.passed, false);

  const offen = await pruefeApiKernpfade({
    fetchImpl: async (url) => (url.endsWith("/api/admin/me") ? antwort(200, "{}") : antwort(200, "{}"))
  });
  assert.equal(offen.passed, false, "ein offener Adminbereich ohne Anmeldung ist ein Befund, kein Erfolg");
});

// --- Gesamtlauf, Meldung und Prioritaet -------------------------------------

function fetchWelt({ swText = 'const CACHE_NAME = "smejj-shell-v1";', startseite = `<html>smejj${"x".repeat(6000)}</html>` } = {}) {
  const dateien = {
    "/assets/code-nachladen.js": NACHLADER,
    "/assets/chat-stream.js": 'export const ok = 1;\nimport { a } from "./b.js";\n',
    "/assets/code-flaeche.js?v=57": 'export const flaeche = 1;\nimport { b } from "./c.js";\n'
  };
  return async (url) => {
    const u = new URL(url);
    const schluessel = u.pathname + (u.search || "");
    if (schluessel === "/") return antwort(200, startseite);
    if (schluessel === "/sw.js") return antwort(200, swText);
    if (schluessel === "/api/health") return antwort(200, "{}");
    if (schluessel === "/api/admin/me") return antwort(401, "{}");
    if (schluessel === "/v1/models") return antwort(401, "{}");
    return antwort(200, dateien[schluessel] ?? "");
  };
}

const kernGesund = async () => ({ ok: true, stepsPassed: 3, failedStep: null, details: [
  { step: "auth_token_validation", passed: true, latencyMs: 2 },
  { step: "chat_inference_flow", passed: true, latencyMs: 900, ttftMs: 900 },
  { step: "storage_integrity", passed: true, latencyMs: 40 }
] });

test("laufNutzerreise: alles gesund => gruene Meldung mit Zahlen, Lauf liegt in der Ablage", async () => {
  const abgelegt = [];
  const reise = await laufNutzerreise({
    fetchImpl: fetchWelt(),
    zyklus: kernGesund,
    ablage: () => ({ schreib: async (satz) => { abgelegt.push(satz); } })
  });
  assert.equal(reise.ok, true, JSON.stringify(reise.schritte.filter((s) => !s.passed)));
  assert.equal(reise.schritteGesamt, 7, "vier Auslieferungs-Schritte + drei Kern-Schritte");
  const meldung = alsAmpelMeldung(reise);
  assert.equal(meldung.status, "ok");
  assert.match(meldung.meldung, /7\/7/, "die Meldung traegt die Zahl, nicht nur ein Gefuehl");
  assert.equal(abgelegt.length, 1, "jeder Lauf hinterlaesst einen Verlaufs-Eintrag");
  assert.equal(abgelegt[0].ok, true);
});

test("laufNutzerreise: toter Chat ist P0 und steht VOR einem P2-Befund in der Meldung", async () => {
  const kernKaputt = async () => ({ ok: false, stepsPassed: 2, failedStep: "chat_inference_flow", details: [
    { step: "auth_token_validation", passed: true, latencyMs: 2 },
    { step: "chat_inference_flow", passed: false, latencyMs: 30_000, error: "Bruecke antwortete leer" },
    { step: "storage_integrity", passed: true, latencyMs: 40 }
  ] });
  const reise = await laufNutzerreise({
    fetchImpl: fetchWelt(),
    zyklus: kernKaputt,
    ablage: () => ({ schreib: async () => {} })
  });
  assert.equal(reise.ok, false);
  assert.equal(reise.schlimmste, "P0");
  const meldung = alsAmpelMeldung(reise);
  assert.equal(meldung.status, "fehler");
  assert.match(meldung.meldung, /P0/);
  assert.match(meldung.meldung, /chat_inference_flow/);
});

// --- Anschluss-Beweis: ein Waechter ohne Anschluss ist keiner ---------------

test("Anschluss: start.js ruft den Nutzerreise-Takt wirklich auf", () => {
  const start = readFileSync(new URL("./start.js", import.meta.url), "utf8");
  assert.match(start, /import \{ starteNutzerreiseTakt \} from "\.\/nutzerreiseWaechter\.js"/);
  assert.match(start, /starteNutzerreiseTakt\(\{ melde: interneMeldung \}\)/);
});

test("Anschluss: die Registry Nr. 29 nennt den 15-Minuten-Takt und erwartet den Herzschlag binnen 30 Minuten", () => {
  const registry = readFileSync(new URL("../admin/opsAutopilotenListeBetrieb.js", import.meta.url), "utf8");
  assert.match(registry, /alle 15 Minuten \(eigener Nutzerreise-Takt\)/);
  assert.match(registry, /erwartetAlleMs: 30 \* 60 \* 1000/);
});
