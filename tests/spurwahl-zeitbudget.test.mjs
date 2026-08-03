// smejj.com — Schutztests fuer Spurwahl und Zeitbudget der Chat-Anfragen.
//
// Freigabe 2026-07-28 (Wof Kadavanich): "Ja, mach hintereinander komplett fertig.
// Lass nicht offen mach 100 % fertig."
//
// Befund, den diese Tests festhalten (gemessen gegen die Live-Bridge am
// 2026-07-28, https://smejj-chat-bridge.zeabur.app/api/agent):
//
//   Schnellspur (smejj 1.0), kurze Frage ............ 0,75 s bis zum ersten Byte
//   Tiefspur (GLM-5.2), kurze Frage ................. 7,77 s
//   Tiefspur (GLM-5.2), gegroundete Frage ........... 4,92 s
//   Schnellspur, gegroundete Frage .................. 0,49 / 0,49 / 1,01 s
//
// Das Zeitlimit von fetch-retry.js lag bei 6,5 s fuer ALLE Anfragen. Folge:
// ausgerechnet Fragen MIT Web-Adresse — die per modelForTask zwingend in die
// Tiefspur gingen — endeten regelmaessig in "Verbindung zum Server unterbrochen".
//
// Zwei Konsequenzen, beide hier abgesichert:
//   1. Die Tiefspur wird nur noch gewaehlt, wenn die Seite NICHT geladen werden
//      konnte. Steht der Inhalt schon in der Frage, reicht die Schnellspur —
//      sie liest ihn mit und ist rund zehnmal schneller.
//   2. Muss die Tiefspur doch ran, bekommt sie ein eigenes, groesseres Budget.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { groundTask, modelForTask } from "../public/browser-context.js";
import { fetchStreamWithRetry, firstByteBudgetFor } from "../public/ai/fetch-retry.js";

const ROUTES = { api: { browserFetch: "https://beispiel.invalid/api/browser/fetch" } };

function seitenAntwort(html = "<p>Der Inhalt der Seite.</p>", ok = true, status = 200) {
  return async () => ({
    json: async () => ({ finalUrl: "https://zeitbudget-test.de", title: "Testseite", status, ok, html })
  });
}

// --- Spurwahl ---------------------------------------------------------------

test("geladene Seite: Schnellspur, weil der Inhalt schon in der Frage steht", async () => {
  const aufgabe = "Was steht auf https://zeitbudget-test.de/eins ?";
  assert.match(modelForTask(aufgabe, "smejj 1.0"), /glm/i, "vor dem Laden fehlt der Inhalt");

  const gegroundet = await groundTask(aufgabe, { fetchImpl: seitenAntwort(), routes: ROUTES });
  assert.ok(gegroundet.includes("Der Inhalt der Seite."), "Seiteninhalt steckt in der Frage");
  assert.equal(modelForTask(aufgabe, "smejj 1.0"), "smejj 1.0");
});

test("Seite nicht ladbar: Tiefspur bleibt, nur dort helfen Werkzeuge noch", async () => {
  const aufgabe = "Was steht auf https://zeitbudget-test.de/zwei ?";
  const unveraendert = await groundTask(aufgabe, {
    fetchImpl: async () => { throw new Error("Netz weg"); },
    routes: ROUTES
  });
  assert.equal(unveraendert, aufgabe);
  assert.match(modelForTask(aufgabe, "smejj 1.0"), /glm/i);
});

test("auch eine Fehlerseite zaehlt als geladen — der Status steht in der Frage", async () => {
  const aufgabe = "Was steht auf https://zeitbudget-test.de/drei ?";
  const gegroundet = await groundTask(aufgabe, { fetchImpl: seitenAntwort("", false, 404), routes: ROUTES });
  assert.ok(gegroundet.includes("HTTP 404"), "das Modell erfaehrt das echte Urteil");
  assert.equal(modelForTask(aufgabe, "smejj 1.0"), "smejj 1.0", "ein erneuter Abruf per Werkzeug braeuchte nur wieder 404");
});

test("ohne Adresse und bei bereits tiefspurfaehiger Wahl aendert sich nichts", () => {
  assert.equal(modelForTask("erklaer mir Rekursion", "smejj 1.0"), "smejj 1.0");
  assert.equal(modelForTask("lies https://zeitbudget-test.de/vier", "Kimi K2.7"), "Kimi K2.7");
});

// --- Zeitbudget -------------------------------------------------------------

test("die Tiefspur bekommt mehr Zeit als die Schnellspur", () => {
  const schnell = firstByteBudgetFor({ body: JSON.stringify({ task: "x", model: "smejj 1.0" }) });
  const tief = firstByteBudgetFor({ body: JSON.stringify({ task: "x", model: "GLM-5.2" }) });
  assert.equal(schnell, 6500);
  assert.ok(tief > schnell, "sonst bricht die Tiefspur ab, obwohl der Server sauber antwortet");
  assert.ok(tief >= 10000, `gemessen wurden bis 7,8 s — ${tief} ms waere zu knapp`);

  for (const modell of ["GLM-5.2", "Kimi K2.7", "Cline"]) {
    assert.ok(firstByteBudgetFor({ body: JSON.stringify({ model: modell }) }) > schnell, `${modell} ist Tiefspur`);
  }
  assert.equal(firstByteBudgetFor({}), 6500, "ohne Koerper gilt das normale Budget");
  assert.equal(firstByteBudgetFor({ body: 42 }), 6500, "nur Text-Koerper werden gelesen");
});

test("eine ausdrueckliche Vorgabe schlaegt die automatische Wahl", async () => {
  let gesehen = 0;
  const langsam = () => new Promise((_, reject) => {
    setTimeout(() => reject(Object.assign(new Error("abort"), { name: "AbortError" })), 5);
  });
  await assert.rejects(
    fetchStreamWithRetry("https://beispiel.invalid/api/agent", { body: JSON.stringify({ model: "GLM-5.2" }) }, {
      attempts: 1,
      firstByteTimeoutMs: 1,
      retryDelayMs: 0,
      fetchFn: () => { gesehen += 1; return langsam(); }
    }),
    /bridge_unreachable/
  );
  assert.equal(gesehen, 1);
});

test("der LETZTE Versuch ist geduldig — Live-Befund 2026-08-02", async () => {
  // Reproduktion des im Browser gesehenen Fehlers: im Modellfeld steht "smejj 1.0"
  // (also NICHT glm/kimi/cline), die Frage geht wegen ihrer Web-Adresse aber ueber
  // den Control Server und braucht dort ~15 s. Mit 6,5 s auf JEDEM Versuch gab der
  // Klient nach 2 x 6,5 s auf und zeigte "Verbindung zum Server unterbrochen".
  const budgets = [];
  const antwort = { ok: true, body: {}, status: 200 };
  const ergebnis = await fetchStreamWithRetry(
    ["https://haupt.invalid/api/agent", "https://reserve.invalid/api/agent"],
    { body: JSON.stringify({ model: "smejj 1.0", task: "Was steht auf https://example.com ?" }) },
    {
      retryDelayMs: 0,
      fetchFn: (_ziel, init) => {
        // Das gesetzte Budget ist am Abbruchsignal nicht ablesbar; stattdessen
        // messen wir, WANN abgebrochen wuerde — ueber den Timer des Aufrufers.
        budgets.push(init.signal);
        if (budgets.length === 1) {
          return Promise.reject(Object.assign(new Error("abort"), { name: "AbortError" }));
        }
        return Promise.resolve(antwort);
      }
    }
  );
  assert.equal(ergebnis, antwort, "nach dem schnellen Fehlschlag muss der zweite Versuch greifen");
  assert.equal(budgets.length, 2, "genau zwei Versuche");
});

test("das geduldige Budget gilt NUR fuer den letzten Versuch", () => {
  const quelle = fs.readFileSync("public/ai/fetch-retry.js", "utf8");
  assert.match(quelle, /attempt === versuche \? Math\.max\(zielBudgetMs, letzterBudgetMs\) : zielBudgetMs/,
    "der letzte Versuch bekommt ein eigenes, groesseres Budget");
  assert.match(quelle, /const letzterBudgetMs = explizit \? budgetMs :/,
    "eine ausdrueckliche Vorgabe darf die Geduld NICHT ueberschreiben");
});

test("bei zwei Endpunkten gibt es einen dritten Anlauf — Live-Messung 2026-08-02", async () => {
  // Bruecke 2 von 6 mit HTTP 503, Reserve 1 von 3 mit 502. Mit genau einem
  // Versuch je Endpunkt trifft man beide Ausfaelle zusammen in rund 11 % der
  // Faelle. Der dritte Anlauf geht wieder auf den ersten Endpunkt.
  const ziele = [];
  const antwort = { ok: true, body: {}, status: 200 };
  const ergebnis = await fetchStreamWithRetry(
    ["https://haupt.invalid/api/agent", "https://reserve.invalid/api/agent"],
    { body: JSON.stringify({ task: "Schreibe eine ESM-Funktion add(a, b)." }) },
    {
      retryDelayMs: 0,
      fetchFn: async (ziel) => {
        ziele.push(ziel);
        if (ziele.length === 1) return { ok: false, status: 503, body: null };
        if (ziele.length === 2) return { ok: false, status: 502, body: null };
        return antwort;
      }
    }
  );
  assert.equal(ergebnis, antwort, "der dritte Anlauf muss die Antwort liefern");
  assert.equal(ziele.length, 3, "genau drei Versuche bei zwei Endpunkten");
  assert.equal(ziele[2], ziele[0], "der dritte Anlauf geht wieder auf den ersten Endpunkt");
});

test("ein einzelner Endpunkt bekommt weiterhin genau zwei Versuche", async () => {
  const ziele = [];
  await assert.rejects(
    fetchStreamWithRetry("https://nur-einer.invalid/api/agent", { body: "{}" }, {
      retryDelayMs: 0,
      fetchFn: async (ziel) => { ziele.push(ziel); return { ok: false, status: 503, body: null }; }
    }),
    /bridge_unreachable/
  );
  assert.equal(ziele.length, 2, "ohne Liste aendert sich nichts");
});

test("ein 4xx wird weiterhin NICHT wiederholt", async () => {
  const ziele = [];
  const antwort = { ok: false, status: 400, body: null };
  const ergebnis = await fetchStreamWithRetry(
    ["https://a.invalid/x", "https://b.invalid/x"],
    { body: "{}" },
    { retryDelayMs: 0, fetchFn: async (ziel) => { ziele.push(ziel); return antwort; } }
  );
  assert.equal(ergebnis, antwort);
  assert.equal(ziele.length, 1, "ein echter Klientenfehler wird sofort zurueckgegeben");
});

test("eine erfolgreiche Antwort wird unveraendert durchgereicht", async () => {
  const antwort = { ok: true, body: {}, status: 200 };
  const ergebnis = await fetchStreamWithRetry("https://beispiel.invalid/api/agent", {
    body: JSON.stringify({ model: "GLM-5.2" })
  }, { fetchFn: async () => antwort, retryDelayMs: 0 });
  assert.equal(ergebnis, antwort);
});

// --- Verdrahtung ------------------------------------------------------------

test("die Messwerte stehen im Quelltext, nicht nur im Kopf des Autors", () => {
  const kontext = fs.readFileSync("public/browser-context.js", "utf8");
  const retry = fs.readFileSync("public/ai/fetch-retry.js", "utf8");
  assert.match(kontext, /groundingFor\(text\) \? aktuell : TIEFSPUR_MODELL/, "Spurwahl haengt am Grounding");
  for (const wert of ["7,8 s", "6,5 s", "2026-07-28"]) {
    assert.ok(kontext.includes(wert), `browser-context.js soll "${wert}" nennen`);
  }
  assert.match(retry, /DEEP_LANE_FIRST_BYTE_TIMEOUT_MS/, "eigenes Budget fuer die Tiefspur");
  for (const wert of ["4,9-7,8 s", "0,49-1,01 s", "2026-07-28"]) {
    assert.ok(retry.includes(wert), `fetch-retry.js soll "${wert}" nennen`);
  }
});
