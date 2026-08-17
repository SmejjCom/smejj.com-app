// smejj.com — Schritt-Pruefer: veraendernde Schritte ohne Nachweis finden.
//
// Der Fehler, den er verhindern soll: ein Klick geht ins Leere, niemand merkt
// es, und der Rest des Plans arbeitet auf einer Seite weiter, die er gar nicht
// vor sich hat. Die Fehlermeldung zeigt am Ende auf einen Schritt, der nichts
// falsch gemacht hat.
import test from "node:test";
import assert from "node:assert/strict";
import { ungepruefteSchritte, nachweisHinweis, NACHWEIS_AKTIONEN } from "../workers/maus-engine/schritt-pruefer.mjs";

const plan = (steps) => ({ steps });

test("ein Nachweis direkt dahinter genuegt", () => {
  const offen = ungepruefteSchritte(plan([
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://example.com/" },
    { id: "s3", action: "waitFor", condition: "selectorVisible" },
    { id: "s4", action: "closeBrowser" }
  ]));
  assert.deepEqual(offen, []);
});

test("zwei Klicks hintereinander lassen den ersten ungeprueft", () => {
  const offen = ungepruefteSchritte(plan([
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "click" },
    { id: "s3", action: "click" },
    { id: "s4", action: "assert", condition: "selectorExists" }
  ]));
  // s3 ist durch s4 gedeckt, s2 durch nichts: was der erste Klick bewirkt hat,
  // ist ab dem zweiten nicht mehr feststellbar.
  assert.deepEqual(offen.map((s) => s.id), ["s2"]);
});

test("was am Planende offen bleibt, zaehlt als ungeprueft", () => {
  const offen = ungepruefteSchritte(plan([
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "type", text: "hallo" },
    { id: "s3", action: "closeBrowser" }
  ]));
  assert.deepEqual(offen.map((s) => s.id), ["s2"]);
});

// Der wichtigste Einzelfall. Ein Screenshot gelingt immer — auch von der
// falschen Seite. Wer ihn als Nachweis zaehlt, baut sich einen Lauf, der
// erfolgreich aussieht und nichts getan hat.
test("ein Screenshot ist KEIN Nachweis", () => {
  assert.ok(!NACHWEIS_AKTIONEN.includes("screenshot"));
  const offen = ungepruefteSchritte(plan([
    { id: "s1", action: "click" },
    { id: "s2", action: "screenshot", name: "beweis" }
  ]));
  assert.deepEqual(offen.map((s) => s.id), ["s1"]);
});

test("harmlose Schritte brauchen keinen Nachweis", () => {
  const offen = ungepruefteSchritte(plan([
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "scroll", direction: "down", amountPx: 400 },
    { id: "s3", action: "hover" },
    { id: "s4", action: "screenshot", name: "b" },
    { id: "s5", action: "closeBrowser" }
  ]));
  assert.deepEqual(offen, []);
});

test("die echten Plaene vom 2026-08-17 sind sauber", () => {
  // Wortlaut aus zwei bestandenen Live-Laeufen gegen smejj.com. Der Pruefer
  // darf gelungene Plaene nicht nachtraeglich zu Fehlern erklaeren.
  assert.deepEqual(ungepruefteSchritte(plan([
    { id: "s1", action: "openBrowser" },
    { id: "s2", action: "navigate", url: "https://smejj.com/hilfe.html" },
    { id: "s3", action: "waitFor", condition: "selectorVisible" },
    { id: "s4", action: "assert", condition: "selectorExists" },
    { id: "s5", action: "extract", name: "hauptueberschrift" },
    { id: "s6", action: "screenshot", name: "hilfe-seite-beweis" },
    { id: "s7", action: "closeBrowser" }
  ])), []);
});

test("ohne Schritte oder mit kaputtem Plan gibt es keine Ausnahme", () => {
  assert.deepEqual(ungepruefteSchritte(null), []);
  assert.deepEqual(ungepruefteSchritte({}), []);
  assert.deepEqual(ungepruefteSchritte(plan([])), []);
});

test("der Hinweis nennt die Schritte und schliesst den Screenshot aus", () => {
  const text = nachweisHinweis([{ id: "s2", action: "click", index: 1 }]);
  assert.match(text, /s2 \(click\)/);
  assert.match(text, /waitFor oder assert/);
  assert.match(text, /screenshot zaehlt NICHT/);
  assert.equal(nachweisHinweis([]), "");
});
