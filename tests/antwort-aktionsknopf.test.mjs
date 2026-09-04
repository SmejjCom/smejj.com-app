// smejj.com — UI/UX-Programm 2026-09-02, Punkt 1: ein Klick statt »genauer« tippen,
// ein Klick statt "bitte gleich erneut versuchen". Geprueft an der Quelle, weil
// chat-stream.js im Browser lebt (absolute /assets-Importe).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/ai/chat-stream.js", import.meta.url), "utf8");

test("lokale Antwort bekommt den Knopf „Gründlicher antworten“ NACH dem Rendern und schickt »genauer:« + Frage", () => {
  const render = quelle.indexOf('if (typeof renderMarkdown === "function") renderMarkdown(output);\n  // Nach dem Rendern');
  assert.ok(render > 0, "Knopf haengt hinter dem Renderaufruf");
  const knopf = quelle.indexOf('haengeAktionsKnopf(output, "Gründlicher antworten", `genauer: ${letzteNutzerfrage(body)}`)');
  assert.ok(knopf > render, "Knopf mit genauer:-Praefix");
  assert.ok(!/schreibe \\u00bbgenauer\\u00ab dazu/.test(quelle), "der alte Tipp zum Abtippen ist weg");
});

test("Verbindungsfehler bekommt „Erneut versuchen“ mit derselben Frage — kein Tipp mehr", () => {
  assert.ok(quelle.includes('output.textContent = "Verbindung zum Server unterbrochen.";\n    haengeAktionsKnopf(output, "Erneut versuchen", letzteNutzerfrage(body));'));
  assert.ok(!quelle.includes("bitte gleich erneut versuchen"), "alter Tipp entfernt");
});

test("der Knopf ist ein echter Button, sperrt sich nach dem Klick und geht ueber den normalen Sendeweg", () => {
  const fn = quelle.slice(quelle.indexOf("export function haengeAktionsKnopf"), quelle.indexOf("export function haengeAktionsKnopf") + 900);
  assert.match(fn, /knopf\.type = "button"/);
  assert.match(fn, /knopf\.disabled = true; senden\(text\)/);
  assert.match(fn, /senden = sendeAlsNutzer/);
  assert.match(fn, /if \(!output \|\| !text\) return null/);
});

test("letzteNutzerfrage nimmt die letzte user-Nachricht, content oder text", async () => {
  // Nur die eine Funktion herausschneiden — der Rest des Moduls braucht den Browser.
  const start = quelle.indexOf("export function letzteNutzerfrage");
  const ende = quelle.indexOf("\n}\n", start) + 3;
  const modul = await import("data:text/javascript;base64," + Buffer.from(quelle.slice(start, ende)).toString("base64"));
  assert.equal(modul.letzteNutzerfrage({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", text: " c " }] }), "c");
  assert.equal(modul.letzteNutzerfrage({}), "");
  // Die App-Form: task statt messages (live 16:50 UTC: der Knopf schickte sonst nur "genauer:").
  assert.equal(modul.letzteNutzerfrage({ task: "  Nenne drei Obstsorten, kurz. ", history: [] }), "Nenne drei Obstsorten, kurz.");
});

test("Nr. 3: Fehlercodes werden Klartext, und jeder Status bekommt eine Handlung", async () => {
  const start = quelle.indexOf("export function verstaendlicheMeldung");
  const ende = quelle.indexOf("\n}\n", start) + 3;
  const m = await import("data:text/javascript;base64," + Buffer.from(quelle.slice(start, ende)).toString("base64"));
  assert.match(m.verstaendlicheMeldung(401, "authentication_required"), /nicht mehr angemeldet/);
  assert.match(m.verstaendlicheMeldung(429, "public_ai_rate_limit_reached"), /20 Sekunden/);
  assert.match(m.verstaendlicheMeldung(502, "All model backends failed"), /Modelle antworten gerade nicht/);
  assert.equal(m.verstaendlicheMeldung(400, "Eigener Hinweis vom Server"), "Eigener Hinweis vom Server");
  assert.ok(quelle.includes("fehlerAktion(output, response.status, letzteNutzerfrage(body));"), "der Fehlerzweig ruft die Handlung");
  const fa = quelle.slice(quelle.indexOf("export function fehlerAktion"), quelle.indexOf("export async function readableError"));
  assert.match(fa, /"Anmelden"/); assert.match(fa, /"Erneut versuchen"/); assert.match(fa, /In 20 s erneut versuchen/);
  assert.match(fa, /\/auth\/login\//);
});

// ---------------------------------------------------------------------------
// Der Knopf muss so breit sein wie sein Wort
//
// BEFUND 2026-09-04, live im Code-Bereich gemessen: Der Knopf war 30 px breit,
// zu lesen war nur "cher antworten". Er traegt zusaetzlich .ghost-button — und
// die ist anderswo ein SYMBOL-Knopf: width:30px, height:34px, padding:0,
// display:grid. Die eigenen Regeln ueberschrieben Hoehe und Innenabstand, die
// BREITE aber nicht. Ein Knopf, dessen Beschriftung abgeschnitten ist, ist
// keine Bedienung mehr (Betreiber-Regel: grosse Schrift, 44 px).
// ---------------------------------------------------------------------------
test("der Aktionsknopf hebt die feste Symbolgroesse von .ghost-button auf", () => {
  const stil = /stil\.textContent = ([\s\S]*?);\n/.exec(quelle)?.[1] || "";
  assert.ok(stil, "Stilblock nicht gefunden — Aufbau geaendert?");
  assert.match(stil, /width:auto/, "die geerbte width:30px muss aufgehoben werden");
  assert.match(stil, /height:auto/, "die geerbte height:34px muss aufgehoben werden");
  assert.match(stil, /min-height:44px/, "Touch-Ziel bleibt 44 px");
  assert.match(stil, /\.antwort-aktion \.antwort-aktion-knopf/,
    "zweiteiliger Selektor: der Knopf darf nicht von der Ladefolge abhaengen");
});
