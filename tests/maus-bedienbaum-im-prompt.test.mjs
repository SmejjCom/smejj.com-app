// Stufe 2 des ARIA-Auges: der Baum muss bis in den Planer-Prompt DURCHKOMMEN.
// Der Bau allein nuetzt nichts — genau das ist die Falle aus Memory
// smejj-schutz-gebaut-nicht-angeschlossen: etwas ist fertig, aber nirgends
// angeschlossen, und kein Test merkt es.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildObservation } from "../workers/maus-engine/observer.mjs";
import { buildStepPrompt, buildRetryPrompt } from "../workers/maus-engine/prompt-template.mjs";
import { observeDecideAct } from "../workers/maus-engine/interactive-loop.mjs";

// Eine Seite, die sich wie Playwright verhaelt — inklusive Accessibility.
function seiteMitBaum({ mitAccessibility = true } = {}) {
  const seite = {
    url: () => "https://smejj.com/login",
    title: async () => "Anmelden",
    evaluate: async () => ({
      text: "Bei smejj anmelden",
      elements: [{ tag: "button", text: "Anmelden", x: 100, y: 200 }]
    })
  };
  if (mitAccessibility) {
    seite.accessibility = {
      snapshot: async () => ({
        role: "WebArea",
        name: "Anmelden",
        children: [
          { role: "textbox", name: "E-Mail-Adresse" },
          { role: "button", name: "Anmelden" }
        ]
      })
    };
  }
  return seite;
}

const POLICY = {
  capsuleRef: "probe-capsule",
  domainAllowlist: ["smejj.com"],
  budget: { maxActions: 10, maxLoopSteps: 1 },
  visionAllowed: false
};

test("ohne Anforderung bleibt die Beobachtung unveraendert (kein Baum)", async () => {
  const beobachtung = await buildObservation(seiteMitBaum());
  assert.equal(beobachtung.bedienbaum, undefined, "Baum kam ungefragt mit");
  assert.ok(Array.isArray(beobachtung.elements), "alter Weg unveraendert");
});

test("mit mitBedienbaum liegt der Baum in der Beobachtung", async () => {
  const beobachtung = await buildObservation(seiteMitBaum(), { mitBedienbaum: true });
  assert.match(beobachtung.bedienbaum, /- textbox "E-Mail-Adresse"/);
  assert.match(beobachtung.bedienbaum, /- button "Anmelden"/);
  // Die Elementliste ueberlebt daneben — beide Quellen, nicht eine statt der anderen.
  assert.equal(beobachtung.elements.length, 1);
});

test("fail-open: kann die Seite keinen Baum, bleibt die Beobachtung gueltig", async () => {
  // Der Chrome-Adapter des Betreibers kann kein accessibility.snapshot().
  const beobachtung = await buildObservation(seiteMitBaum({ mitAccessibility: false }), { mitBedienbaum: true });
  assert.equal(beobachtung.bedienbaum, undefined);
  assert.equal(beobachtung.url, "https://smejj.com/login", "Beobachtung trotzdem brauchbar");
});

test("fail-open auch wenn accessibility.snapshot WIRFT", async () => {
  const seite = seiteMitBaum();
  seite.accessibility = { snapshot: async () => { throw new Error("kaputt"); } };
  const beobachtung = await buildObservation(seite, { mitBedienbaum: true });
  assert.equal(beobachtung.bedienbaum, undefined);
  assert.equal(beobachtung.title, "Anmelden");
});

// Hilfe: schneidet GENAU den Bedienbaum-Block heraus. Ohne das misst man
// leicht den Hinweistext statt des Baums — der erste Anlauf dieses Pruefers
// war exakt so falsch-gruen (das Suchmuster traf das Beispiel im Prompt).
function baumBlock(prompt) {
  const m = prompt.match(/<untrusted_bedienbaum>\n([\s\S]*?)\n<\/untrusted_bedienbaum>/);
  return m ? m[1] : null;
}

test("DER ANSCHLUSS: der Baum steht im Schritt-Prompt, mit Anleitung", async () => {
  const observation = await buildObservation(seiteMitBaum(), { mitBedienbaum: true });
  const prompt = buildStepPrompt({ task: "melde dich an", ...POLICY, observation, remainingSteps: 5 });
  const block = baumBlock(prompt);
  assert.ok(block, "kein Bedienbaum-Block im Prompt");
  // Gemessen IM BLOCK, nicht irgendwo im Prompt.
  assert.match(block, /^- WebArea "Anmelden"$/m);
  assert.match(block, /^ {2}- button "Anmelden"$/m, "Einrueckung verloren");
  assert.match(prompt, /strategy "role"/, "Anleitung zur role-Strategie fehlt");
  assert.match(prompt, /Erfinde NIE eine Rolle/, "Warnung vor geratenen Rollen fehlt");
  assert.match(prompt, /<untrusted_seitenzustand>/, "JSON-Teil fehlt");
});

test("der Baum ist KLARTEXT, nicht JSON-escaped — und steht nur einmal da", async () => {
  const observation = await buildObservation(seiteMitBaum(), { mitBedienbaum: true });
  const prompt = buildStepPrompt({ task: "melde dich an", ...POLICY, observation, remainingSteps: 5 });
  // Der Befund, der diesen Pruefer ausgeloest hat: im JSON wird aus
  // - button "Anmelden" die Form "- button \"Anmelden\"\n" — unlesbar.
  assert.ok(!prompt.includes('\\"Anmelden\\"'), "Baum steht escaped im Prompt");
  assert.ok(!prompt.includes('"bedienbaum"'), "Baum steht doppelt (auch im JSON)");
});

test("ohne Baum erscheint die Baum-Anleitung NICHT (kein toter Text)", async () => {
  const observation = await buildObservation(seiteMitBaum({ mitAccessibility: false }), { mitBedienbaum: true });
  const prompt = buildStepPrompt({ task: "melde dich an", ...POLICY, observation, remainingSteps: 5 });
  assert.ok(!prompt.includes("Erfinde NIE eine Rolle"), "Anleitung ohne Baum ausgeliefert");
});

test("auch der Fehlschlag-Prompt nutzt den Baum", async () => {
  const observation = await buildObservation(seiteMitBaum(), { mitBedienbaum: true });
  const prompt = buildRetryPrompt({
    previousPlan: { planId: "p1", capsuleRef: "c", steps: [] },
    failure: { failedStep: "s3", observation },
    roundtrip: 1
  });
  const block = baumBlock(prompt);
  assert.ok(block, "kein Bedienbaum-Block im Fehlschlag-Prompt");
  assert.match(block, /^ {2}- button "Anmelden"$/m);
  assert.ok(!prompt.includes('"bedienbaum"'), "Baum steht doppelt (auch im JSON)");
});

test("ein gekappter Baum sagt es dem Modell ins Gesicht", async () => {
  const observation = await buildObservation(seiteMitBaum(), { mitBedienbaum: true, baumMaxChars: 20 });
  assert.equal(observation.bedienbaumGekappt, true, "Kappung nicht vermerkt");
  const prompt = buildStepPrompt({ task: "x", ...POLICY, observation, remainingSteps: 5 });
  assert.match(prompt, /ACHTUNG: Dieser Baum ist GEKAPPT/);
});

test("DER LOOP fordert den Baum von sich aus an", async () => {
  // Kein observer uebergeben — der Standard muss den Baum holen.
  let gesehenerPrompt = "";
  await observeDecideAct({
    task: "melde dich an",
    policyInput: POLICY,
    page: seiteMitBaum(),
    plannerClient: async (prompt) => {
      gesehenerPrompt = prompt;
      return JSON.stringify({ schemaVersion: 1, decision: "done", reason: "fertig", result: "ok" });
    },
    runAction: async () => ({ ok: true })
  });
  assert.match(gesehenerPrompt, /- button "Anmelden"/, "der Loop holt den Baum nicht");
});
