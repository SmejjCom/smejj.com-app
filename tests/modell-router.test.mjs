// Waechter fuer den Modell-Router ("Auto"). Geprueft wird die REGEL, nicht das
// Netz: welcher Auftrag landet auf der Abo-Spur (0 EUR variabel) und welcher
// darf Guthaben ziehen. Jede Probe hat ein Gegenstueck — sonst misst der Test
// nur, dass die Funktion existiert.
import test from "node:test";
import assert from "node:assert/strict";
import { BLINDGAENGER, waehleModell } from "../public/ai/modellRouter.js";

test("Alltagsfrage bleibt auf der Abo-Spur", () => {
  const wahl = waehleModell("Wie spaet ist es in Tokio?");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "alltag");
});

test("Code-Frage nimmt das Abo-Codemodell, nicht das teure", () => {
  const wahl = waehleModell("Schreib mir eine JavaScript Funktion, die ein Array sortiert.");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "code");
});

test("angehaengte Dateien ziehen die teure Spur", () => {
  const wahl = waehleModell("Was macht das hier?", { dateien: 1 });
  assert.equal(wahl.spur, "Guthaben");
  assert.equal(wahl.grund, "viel-kontext");
});

test("sehr langer Auftrag zieht die teure Spur", () => {
  const wahl = waehleModell("x".repeat(4001));
  assert.equal(wahl.spur, "Guthaben");
});

// NACHGEMESSEN 2026-08-17: 19 ausgefuehrte Testfaelle, minimax-m3 19/19 in
// 8 s gegen Opus 5 19/19 in 12 s. Ein Denk-Wort allein rechtfertigt also
// keine Guthaben-Anfrage mehr — die alte Regel kostete Geld ohne Gegenwert.
test("Denk-Woerter allein kosten kein Guthaben mehr", () => {
  for (const probe of [
    "Analysiere die Architektur dieses Moduls.",
    "Erklaere die Migration und die Security-Folgen.",
    "Wie optimiere ich die Performance hier?"
  ]) {
    assert.equal(waehleModell(probe).spur, "Abo", probe);
  }
});

test("Code-Wort plus Denk-Wort bleibt im Abo, auf der Code-Spur", () => {
  const wahl = waehleModell("Refactor die Funktion und erklaere die Architektur.");
  assert.equal(wahl.spur, "Abo");
  assert.equal(wahl.grund, "code");
});

test("Router waehlt nie einen Blindgaenger", () => {
  // Live gemessen 2026-08-17: HTTP 200, aber 0 Zeichen Inhalt nach 90-120 s.
  const proben = [
    "Hallo",
    "Schreib eine Funktion",
    "Analysiere die Architektur",
    "y".repeat(2000)
  ];
  for (const probe of proben) {
    assert.equal(BLINDGAENGER.includes(waehleModell(probe).modell), false, probe.slice(0, 20));
  }
});

test("die zwei gemessenen Blindgaenger stehen auf der Liste", () => {
  assert.deepEqual([...BLINDGAENGER].sort(), ["cline-pass/qwen3.7-max", "x-ai/grok-4.5"]);
});

// ---- Der eingesparte Vorlauf (live gemessen 2026-09-05) --------------------
// Befund: /api/providers/cline/select lief VOR jedem Auftrag und kostete 1,07 s;
// das erste Wort kam nach 1,87 s. waehleModell() ist eine reine Funktion — bei
// gleichartigen Auftraegen faellt dieselbe Wahl, der zweite Rundlauf war reine
// Wartezeit. Diese Zusagen halten das Ueberspringen samt seiner Notbremsen fest.

function fakeSpeicher() {
  const daten = new Map();
  return {
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => daten.set(k, String(v)),
    removeItem: (k) => daten.delete(k),
    _daten: daten
  };
}

async function frischerRouter() {
  globalThis.sessionStorage = fakeSpeicher();
  globalThis.localStorage = fakeSpeicher();
  globalThis.document = undefined;
  return import(`../public/ai/modellRouter.js?fall=${Math.random()}`);
}

test("zweiter gleichartiger Auftrag spart den Rundlauf", async () => {
  const router = await frischerRouter();
  let rufe = 0;
  globalThis.fetch = async () => {
    rufe += 1;
    return { ok: true, json: async () => ({ selectedModel: "cline-pass/kimi-k2.7-code" }) };
  };
  const ersteWahl = await router.sorgeFuerModell("Schreib eine JavaScript Funktion.");
  assert.equal(ersteWahl.ok, true);
  assert.equal(rufe, 1, "der erste Auftrag muss das Modell setzen");
  const zweiteWahl = await router.sorgeFuerModell("Schreib eine andere JavaScript Funktion.");
  assert.equal(zweiteWahl.ok, true);
  assert.equal(zweiteWahl.uebersprungen, true);
  assert.equal(rufe, 1, "derselbe Modellwunsch darf kein zweites /select ausloesen");
});

test("anderer Auftragstyp setzt wieder — kein falsches Sparen", async () => {
  const router = await frischerRouter();
  let rufe = 0;
  globalThis.fetch = async (_url, optionen) => {
    rufe += 1;
    const gewuenscht = JSON.parse(optionen.body).model;
    return { ok: true, json: async () => ({ selectedModel: gewuenscht }) };
  };
  await router.sorgeFuerModell("Wie spaet ist es in Tokio?");
  assert.equal(rufe, 1);
  // Code-Auftrag verlangt ein anderes Modell als die Alltagsfrage.
  const zweite = await router.sorgeFuerModell("Schreib eine JavaScript Funktion.");
  assert.equal(rufe, 2, "ein anderes Modell MUSS gesetzt werden");
  assert.notEqual(zweite.uebersprungen, true);
});

test("Fehlschlag laesst den Merker fallen", async () => {
  const router = await frischerRouter();
  let rufe = 0;
  globalThis.fetch = async () => { rufe += 1; throw new Error("netz weg"); };
  const wahl = await router.sorgeFuerModell("Schreib eine JavaScript Funktion.");
  assert.equal(wahl.ok, false);
  await router.sorgeFuerModell("Schreib noch eine JavaScript Funktion.");
  assert.equal(rufe, 2, "nach einem Fehlschlag muss der naechste Auftrag erneut setzen");
});

test("Notbremse: meldet der Server ein anderes Modell, faellt der Merker", async () => {
  const router = await frischerRouter();
  let rufe = 0;
  globalThis.fetch = async () => {
    rufe += 1;
    return { ok: true, json: async () => ({ selectedModel: "cline-pass/kimi-k2.7-code" }) };
  };
  await router.sorgeFuerModell("Schreib eine JavaScript Funktion.");
  assert.equal(rufe, 1);
  // Ein zweiter Tab hat von Hand gewechselt: der Antwortkopf verraet es.
  router.pruefeAntwortModell({ headers: { get: () => "cline:cline-pass/minimax-m3" } });
  await router.sorgeFuerModell("Schreib noch eine JavaScript Funktion.");
  assert.equal(rufe, 2, "nach einer Abweichung im Antwortkopf muss neu gesetzt werden");
});

test("Handwahl im selben Tab haelt den Merker richtig", async () => {
  const router = await frischerRouter();
  let rufe = 0;
  globalThis.fetch = async () => {
    rufe += 1;
    return { ok: true, json: async () => ({ selectedModel: "cline-pass/kimi-k2.7-code" }) };
  };
  await router.sorgeFuerModell("Schreib eine JavaScript Funktion.");
  // Zurueck auf "Auto": der Merker MUSS fallen, sonst liefe der naechste
  // Auftrag mit dem von Hand gesetzten Modell weiter.
  router.merkeGesetztesModell(router.AUTO_MARKE);
  await router.sorgeFuerModell("Schreib noch eine JavaScript Funktion.");
  assert.equal(rufe, 2, "nach einer Handwahl muss der Router wieder selbst setzen");
});

// ---- Der abgelaufene Ausweis (Betreiber-Screenshots 2026-09-07) -------------
// Befund: der stille Refresh (chat-stream.js) legt den frischen kurzen Ausweis in
// sessionStorage — sorgeFuerModell las aber nur den ALTEN aus localStorage. Nach
// zehn Minuten endete jede Auto-Anfrage mit "bitte ein Modell von Hand waehlen".
// Und ohne Cline-Schluessel (409) darf Auto nicht in einer Sackgasse enden.

test("Ausweis-Reihenfolge: frischer kurzer Ausweis vor eigenem Schluessel vor durablem Login", async () => {
  const router = await frischerRouter();
  const ss = fakeSpeicher(), ls = fakeSpeicher();
  ls.setItem("smejj.auth.accessToken.v1", "alt-durabel");
  assert.equal(router.leseAusweis(ss, ls), "alt-durabel");
  ss.setItem("smejj.apiToken.v1", "eigener-schluessel");
  assert.equal(router.leseAusweis(ss, ls), "eigener-schluessel");
  ss.setItem("smejj.auth.accessToken.v1", "frisch");
  assert.equal(router.leseAusweis(ss, ls), "frisch");
  assert.equal(router.leseAusweis(null, null), "");
});

test("401 beim Setzen: genau einmal erneuern, dann mit dem frischen Ausweis wiederholen", async () => {
  const router = await frischerRouter();
  globalThis.localStorage.setItem("smejj.auth.accessToken.v1", "alt-durabel");
  const rufe = [];
  globalThis.fetch = async (url, optionen = {}) => {
    const kopf = optionen.headers?.Authorization || "";
    rufe.push(`${new URL(String(url)).pathname.replace(/^\/api/, "")} ${kopf}`);
    if (String(url).endsWith("/api/auth/me")) return { ok: true, status: 200, json: async () => ({ authenticated: true, accessToken: "frisch" }) };
    if (kopf === "Bearer frisch") return { ok: true, status: 200, json: async () => ({ selectedModel: "cline-pass/minimax-m3" }) };
    return { ok: false, status: 401, json: async () => ({ error: "authentication_required" }) };
  };
  const wahl = await router.sorgeFuerModell("Wie spaet ist es in Tokio?");
  assert.equal(wahl.ok, true, JSON.stringify(rufe));
  assert.deepEqual(rufe, [
    "/providers/cline/select Bearer alt-durabel",
    "/auth/me Bearer alt-durabel",
    "/providers/cline/select Bearer frisch"
  ]);
  assert.equal(globalThis.sessionStorage.getItem("smejj.auth.accessToken.v1"), "frisch", "der frische Ausweis steht fuer chatClient.js bereit");
});

test("bleibt es 401, ist die Anmeldung wirklich abgelaufen — ehrlich sagen, nicht ausweichen", async () => {
  const router = await frischerRouter();
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const wahl = await router.sorgeFuerModell("Wie spaet ist es in Tokio?");
  assert.equal(wahl.ok, false);
  assert.equal(wahl.fehler, "anmeldung");
  assert.notEqual(wahl.ausweichen, true);
});

test("409 (kein Cline-Schluessel) und Netzfehler: Auto weicht auf den Server-Weg aus", async () => {
  const router = await frischerRouter();
  globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: "cline_not_configured" }) });
  const ohneSchluessel = await router.sorgeFuerModell("Wie spaet ist es in Tokio?");
  assert.equal(ohneSchluessel.ok, false);
  assert.equal(ohneSchluessel.fehler, "nicht-eingerichtet");
  assert.equal(ohneSchluessel.ausweichen, true);
  assert.equal(ohneSchluessel.grund, "alltag", "der Routing-Grund bleibt erhalten");
  globalThis.fetch = async () => { throw new Error("netz weg"); };
  const netz = await router.sorgeFuerModell("Wie spaet ist es in Tokio?");
  assert.equal(netz.fehler, "netz");
  assert.equal(netz.ausweichen, true);
});

test("chatClient.js: Auto endet nie mit 'von Hand waehlen' — Anmeldung ehrlich, sonst Server-Weg", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("../public/ai/chatClient.js", import.meta.url), "utf8");
  assert.ok(!quelle.includes('output.textContent = "Automatische Modellwahl'), "die Sackgasse ist weg");
  assert.match(quelle, /if \(wahl\.fehler === "anmeldung"\) \{[\s\S]*?nichtAngemeldetText\(\);[\s\S]*?return true;[\s\S]*?\}\s*return false;/);
  assert.match(quelle, /const ausweis = holeZugriffsToken\(\) \|\| token;/, "nach der Modellwahl wird der Ausweis neu gelesen");
  assert.match(quelle, /Authorization: `Bearer \$\{ausweis\}`/);
  assert.match(quelle, /const frisch = sessionStorage\.getItem\(AUTH_TOKEN_KEY\);\s*if \(frisch\) return frisch;/, "holeZugriffsToken kennt den frischen Ausweis");
});
