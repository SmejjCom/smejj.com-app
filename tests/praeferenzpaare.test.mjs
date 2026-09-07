// Praeferenzpaare — die Daten, mit denen ein Modell UNTERSCHEIDEN lernt statt
// nachzuahmen.
//
// Die Faelle hier pruefen vor allem eines: dass die Paare wirklich etwas
// lehren. Ein Paar, dessen schlechtere Antwort offensichtlich dumm ist, sieht
// nach Arbeit aus und bringt nichts — das Modell lernt daran nur, offensichtlich
// dumme Antworten zu meiden, und die gibt es ohnehin nicht.

import test from "node:test";
import assert from "node:assert/strict";

import {
  AUSWEICHEND,
  ECHTE_GRENZEN,
  ERFINDEN,
  UEBERVERWEIGERUNG,
  alsZeile,
  praeferenzPaare,
  pruefePaar
} from "../scripts/training/smejj-praeferenzpaare.mjs";

test("jedes Paar besteht die eigene Pruefung", () => {
  for (const paar of praeferenzPaare()) {
    const urteil = pruefePaar(paar);
    assert.equal(urteil.ok, true, `${paar.prompt.slice(0, 50)}: ${urteil.grund}`);
  }
});

test("die Pruefung erkennt die drei Arten von Schrott", () => {
  // Ein Waechter, der nur gesunde Faelle sieht, beweist nichts.
  assert.match(pruefePaar({ prompt: "x", chosen: "a".repeat(40), rejected: "a".repeat(40) }).grund, /gleich/);
  assert.match(pruefePaar({ prompt: "x", chosen: "a".repeat(400), rejected: "kurz" }).grund, /Strohmann/);
  assert.match(pruefePaar({ prompt: "x", chosen: "ja", rejected: "nein" }).grund, /zu kurz/);
  assert.equal(pruefePaar(null).ok, false);
  assert.equal(pruefePaar({ prompt: "x", chosen: "a".repeat(40) }).ok, false);
});

test("beide Richtungen sind vertreten — sonst lernt das Modell nur 'sag ja'", () => {
  // Der gemessene Schaden von smejj 1.4 war Ueberverweigerung. Nur dagegen zu
  // trainieren, wuerde den Fehler in die andere Richtung erzeugen: ein Modell,
  // das jede Loeschung mitmacht.
  assert.ok(UEBERVERWEIGERUNG.length >= 4, "zu wenige Faelle gegen Ueberverweigerung");
  assert.ok(ECHTE_GRENZEN.length >= 3, "ohne echte Grenzen wird aus dem Modell ein Ja-Sager");
  assert.ok(ERFINDEN.length >= 2);
  assert.ok(AUSWEICHEND.length >= 2);
});

test("bei Ueberverweigerung ist die BESSERE Antwort die zustimmende", () => {
  // Wenn hier die Rollen vertauscht waeren, wuerde das Training den Schaden
  // verstaerken statt ihn zu heilen — und niemand saehe es vor der Messung.
  for (const p of UEBERVERWEIGERUNG) {
    assert.match(p.chosen, /^(Ja|Ja,|Nein\. )/i,
      `"${p.prompt.slice(0, 40)}": die bevorzugte Antwort muss zustimmen, steht aber: ${p.chosen.slice(0, 40)}`);
    // Die abgelehnte Antwort darf NICHT zustimmen — das ist die Eigenschaft,
    // auf die es ankommt. Der erste Anlauf suchte hier nach Woertern wie
    // "Freigabe" oder "abgestimmt" und wurde zweimal rot, weil dieselbe
    // Ablehnung anders formuliert war. Eine Wortliste haette die Paare in eine
    // Schablone gezwungen — also genau das erzeugt, was sie bekaempfen sollen.
    assert.doesNotMatch(p.rejected, /^(ja\b|klar\b|gerne\b|kein problem)/i,
      `"${p.prompt.slice(0, 40)}": die abgelehnte Antwort stimmt zu, damit lehrt das Paar nichts`);
    assert.notEqual(p.chosen.trim(), p.rejected.trim());
  }
});

test("bei echten Grenzen ist die BESSERE Antwort die verweigernde", () => {
  for (const p of ECHTE_GRENZEN) {
    assert.match(p.chosen, /nicht|Freigabe|nicht ohne|gebe ich nicht/i,
      `"${p.prompt.slice(0, 40)}": hier muss die bevorzugte Antwort die Grenze halten`);
  }
});

test("die abgelehnte Antwort ist plausibel, nicht offensichtlich dumm", () => {
  // Sie muss klingen wie etwas, das ein Modell wirklich sagt: ganze Saetze,
  // hoeflicher Ton, formal nicht falsch. Sonst ist die Unterscheidung trivial.
  for (const p of praeferenzPaare()) {
    assert.ok(p.rejected.length >= 60, `zu knapp fuer eine plausible Antwort: ${p.rejected}`);
    assert.match(p.rejected, /[.!?]$/, `kein ganzer Satz: ${p.rejected.slice(-40)}`);
  }
});

test("keine Frage kommt doppelt vor", () => {
  const fragen = praeferenzPaare().map((p) => p.prompt);
  assert.equal(fragen.length, new Set(fragen).size);
});

test("die Zeile taugt fuer BEIDE Trainingsarten", () => {
  // Der heutige Lauf kennt nur Musterantworten. Die Datei muss darum auch fuer
  // ihn lesbar sein — sonst waeren die Daten an eine Technik gebunden, die es
  // noch nicht gibt, und laegen bis dahin brach.
  const z = alsZeile(praeferenzPaare()[0]);
  assert.equal(z.messages.length, 3, "messages ist das Format des heutigen Laufs");
  assert.equal(z.messages[2].content, z.chosen[2].content, "messages muss die BESSERE Antwort tragen");
  assert.equal(z.chosen.length, 3);
  assert.equal(z.rejected.length, 3);
  assert.notEqual(z.chosen[2].content, z.rejected[2].content);
});

test("kein Fall stammt aus der Pruefsuite", async () => {
  // Wer die Messlatte ins Training gibt, misst danach sich selbst. Geprueft
  // wird gegen die Fragen der breiten Suite, nicht nur gegen ihre Kennungen.
  const { readFileSync, readdirSync } = await import("node:fs");
  const suitenFragen = new Set();
  for (const datei of readdirSync("evals/packs")) {
    const pack = JSON.parse(readFileSync(`evals/packs/${datei}`, "utf8"));
    for (const fall of pack.faelle || []) {
      if (fall.prompt) suitenFragen.add(fall.prompt.trim().toLowerCase());
    }
  }
  assert.ok(suitenFragen.size > 50, "die Suite konnte nicht gelesen werden — die Pruefung waere wertlos");
  for (const p of praeferenzPaare()) {
    assert.ok(!suitenFragen.has(p.prompt.trim().toLowerCase()),
      `Frage stammt aus der Pruefsuite: ${p.prompt}`);
  }
});
