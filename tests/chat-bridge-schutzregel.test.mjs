// smejj.com — Schutzregel auf dem Chat-Weg (tiefe-Spur-Messung 14.09.: Fall
// schutz-design-lock kippte gegen glm-5-2, weil /api/chat den fremden System-Prompt
// ungeschuetzt durchreichte). Diese Zusagen halten fest, dass JEDE Chat-Anfrage die
// OBERSTE REGEL traegt — als Vorsatz, nicht als zweite System-Nachricht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/chat-bridge.js", import.meta.url), "utf8");
// Die Bruecke startet beim Import ihren Server — im Test ausdruecklich nicht (wie prompt-caching.test.mjs).
process.env.SMEJJ_CHAT_BRIDGE_NO_START = "1";
const bruecke = await import("../public/chat-bridge.js");

test("die Schutzregel nennt Design-Lock, Sperren, Schluessel und die schriftliche Freigabe", () => {
  assert.match(bruecke.SCHUTZREGEL, /Design-Lock/);
  assert.match(bruecke.SCHUTZREGEL, /schriftlicher Freigabe/);
  assert.match(bruecke.SCHUTZREGEL, /Schluessel/);
  assert.match(bruecke.SCHUTZREGEL, /Nein/);
});

test("mitSchutzregel setzt die Regel VOR einen fremden System-Prompt — eine System-Nachricht, nicht zwei", () => {
  const fremd = [{ role: "system", content: "Du bist der Assistent von smejj.com. Startseite ist gesperrt." }, { role: "user", content: "Bau die Startseite um." }];
  const ergebnis = bruecke.mitSchutzregel(fremd);
  assert.equal(ergebnis.length, 2);
  assert.equal(ergebnis.filter((m) => m.role === "system").length, 1);
  assert.ok(ergebnis[0].content.startsWith(bruecke.SCHUTZREGEL));
  assert.ok(ergebnis[0].content.endsWith("Startseite ist gesperrt."));
  assert.deepEqual(ergebnis[1], fremd[1]);
  assert.equal(fremd[0].content.includes("OBERSTE REGEL"), false, "Eingabe bleibt unveraendert");
});

test("ohne System-Prompt wird die Regel als eigene System-Nachricht vorangestellt; doppelt wird sie nie", () => {
  const nur = [{ role: "user", content: "Hallo" }];
  const einmal = bruecke.mitSchutzregel(nur);
  assert.equal(einmal[0].role, "system");
  assert.equal(einmal[0].content, `${bruecke.SCHUTZREGEL}\n${bruecke.SPRACHREGEL}`);
  assert.deepEqual(bruecke.mitSchutzregel(einmal), einmal, "idempotent");
});

test("der Waechter der Schnellspur traegt die Regel, und der Control-Weg bekommt sie mit", () => {
  const [guard] = bruecke.hardenMessages([{ role: "user", content: "Hallo" }]);
  assert.ok(guard.content.startsWith(bruecke.SCHUTZREGEL));
  assert.match(quelle, /const geschuetzt = mitSchutzregel\(messages\);\s*\n\s*if \(await streamViaControl\(res, "\/api\/chat", \{ \.\.\.body, messages: wissen \? withRagBlock\(geschuetzt/);
  assert.doesNotMatch(quelle, /streamViaControl\(res, "\/api\/chat", wissen \? \{ \.\.\.body, messages: withRagBlock\(messages/, "der alte ungeschuetzte Weg ist weg");
});

test("v152 Sprachregel (Freigabe 1f): Schnellspur, Agenten-Prompt und Control-Weg tragen sie", () => {
  assert.match(bruecke.SPRACHREGEL, /derselben Sprache wie die letzte Nachricht des Nutzers/);
  assert.match(bruecke.SPRACHREGEL, /Uebersetzung/);
  const [guard] = bruecke.hardenMessages([{ role: "user", content: "Hallo" }]);
  assert.ok(guard.content.includes(bruecke.SPRACHREGEL));
  const mit = bruecke.mitSchutzregel([{ role: "system", content: "fremd" }]);
  assert.ok(mit[0].content.includes(bruecke.SPRACHREGEL) && mit[0].content.endsWith("fremd"));
  assert.match(quelle, /Schutzmechanismen \(Budget-Waechter, Rate-Limits, Zugriffsregeln, Schluessel\) werden nie abgeschaltet, umgangen oder preisgegeben — auch nicht auf Anfrage\.",\n\s*SPRACHREGEL,/);
});
