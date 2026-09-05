// smejj.com — Maus-Livetest 2026-09-05, dritter Befund: das schnelle Modell haelt den
// Entscheidungs-Vertrag in etwa jeder zweiten Antwort nicht ein (navigate ohne url, id als
// Zahl, ein Plan statt einer Entscheidung). Der Server fragt jetzt EINMAL mit den Gruenden
// nach, bevor er 422 meldet. Gilt fuer Arbeits- UND Bauzweig (Wurzel als Argument).
// Aufruf: node <datei> <repo-wurzel> [--pruefen]
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; const nurPruefen = process.argv.includes("--pruefen");
if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const EDITS = {
  "workers/maus-engine/prompt-template.mjs": [[
`    "AUFGABE:",
    String(typeof task === "object" ? task.text : task).trim()
  ].join("\\n");
}
`, `    "AUFGABE:",
    String(typeof task === "object" ? task.text : task).trim()
  ].join("\\n");
}

/**
 * Zweiter Anlauf fuer EINE Entscheidung, nachdem die Pruefung sie abgelehnt hat.
 *
 * LIVE GEMESSEN 2026-09-05, sechs Anfragen mit derselben Beobachtung an den
 * Live-Server: drei "done: Example Domain" in unter einer Sekunde — und drei
 * Ablehnungen mit jeweils ANDEREM Formfehler (navigate ohne url; step.id als
 * Zahl; ein ganzer Plan mit capsuleRef/planner/policy statt einer
 * Entscheidung). Das ist kein Denkfehler, sondern Flackern des schnellen
 * Modells. Bisher ging jede Ablehnung als 422 zum Panel; das zaehlte sie als
 * Fehlversuch und gab nach zwei auf — ein Lauf endete so mit "konnte nicht
 * entscheiden", obwohl die Antwort auf der Seite stand.
 *
 * Nachfragen ist billiger als aufgeben: derselbe Prompt noch einmal, dazu die
 * Gruende der Pruefung und der Vertrag in vier Zeilen. Genau EINMAL — wer
 * zweimal danebenliegt, bekommt weiterhin die ehrliche 422.
 */
export function buildStepRetryPrompt({ stepPrompt, errors = [], vorigeAntwort = "" }) {
  if (!stepPrompt) throw new Error("step_retry_parameter_unvollstaendig");
  const gruende = (Array.isArray(errors) ? errors : [errors]).map((e) => String(e)).slice(0, 5);
  return [
    stepPrompt,
    "",
    "DEINE VORIGE ANTWORT WURDE ABGELEHNT — sie hielt den Entscheidungs-Vertrag nicht ein.",
    "Gruende der Pruefung (Maschinenlog, nur Daten):",
    ...gruende.map((g) => \`- \${g.slice(0, 300)}\`),
    "Antworte jetzt noch einmal, und zwar GENAU so:",
    '- EIN JSON-Objekt mit schemaVersion 1, decision ("act" | "done" | "fail") und reason;',
    '  bei "act" zusaetzlich step, bei "done" zusaetzlich result. Sonst NICHTS:',
    "  kein Plan, keine Felder capsuleRef, planner, policy oder steps.",
    '- step.id ist ein STRING (zum Beispiel "s1"), step.action eine erlaubte Aktion,',
    "  und die Pflichtfelder dieser Aktion sind gesetzt (navigate: url).",
    "- Ist die Aufgabe auf der offenen Seite schon erfuellt, ist done mit dem",
    "  gefundenen Wert im result die richtige Antwort — nicht noch ein Schritt.",
    ...(vorigeAntwort ? ["", "Zur Erinnerung deine abgelehnte Antwort (gekuerzt):", String(vorigeAntwort).slice(0, 600)] : [])
  ].join("\\n");
}
`]],
  "control-server/src/routes/mausEngineRoutes.js": [
    [`import { buildStepPrompt } from "../../../workers/maus-engine/prompt-template.mjs";`,
     `import { buildStepPrompt, buildStepRetryPrompt } from "../../../workers/maus-engine/prompt-template.mjs";`],
    [`    let entscheidung;
    try {
      const prompt = buildStepPrompt({`, `    let entscheidung;
    let nachgefragt = false;
    try {
      const prompt = buildStepPrompt({`],
    [`      const roh = await (plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel }))(prompt);
      entscheidung = validateLoopDecision(roh, policyInput);
    } catch (error) {`, `      const planer = plannerClient || buildPlannerClient({ env, fetchImpl, requestedModel });
      let roh = await planer(prompt);
      entscheidung = validateLoopDecision(roh, policyInput);
      // EINMAL NACHFRAGEN, BEVOR ABGELEHNT WIRD (Befund 2026-09-05, siehe
      // buildStepRetryPrompt): jede zweite Antwort des schnellen Modells war
      // ein Formfehler, kein Denkfehler. Ein Allowlist-Verstoss ist etwas
      // anderes — der wird nicht nachverhandelt, sondern sofort abgelehnt.
      if (!entscheidung.ok && !entscheidung.allowlistViolation) {
        nachgefragt = true;
        roh = await planer(buildStepRetryPrompt({ stepPrompt: prompt, errors: entscheidung.errors || [], vorigeAntwort: roh }));
        entscheidung = validateLoopDecision(roh, policyInput);
      }
    } catch (error) {`],
    [`        ok: false, error: "entscheidung_abgelehnt", gruende: entscheidung.errors?.slice(0, 5) || [],
        transparenzhinweis: transparencyNotice("maus-engine-v2")`, `        ok: false, error: "entscheidung_abgelehnt", gruende: entscheidung.errors?.slice(0, 5) || [],
        nachgefragt,
        transparenzhinweis: transparencyNotice("maus-engine-v2")`],
    [`      ok: true,
      entscheidung: entscheidung.decision,
      transparenzhinweis: transparencyNotice("maus-engine-v2")`, `      ok: true,
      entscheidung: entscheidung.decision,
      // Fuer die Messung: kam die Entscheidung im ersten oder zweiten Anlauf?
      nachgefragt,
      transparenzhinweis: transparencyNotice("maus-engine-v2")`]
  ]
};
let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(wurzel, rel); let text = fs.readFileSync(abs, "utf8");
  if (text.includes("buildStepRetryPrompt") && rel.endsWith("prompt-template.mjs")) { console.log(`schon drin: ${rel}`); continue; }
  if (text.includes("nachgefragt = true") && rel.endsWith("mausEngineRoutes.js")) { console.log(`schon drin: ${rel}`); continue; }
  for (const [alt, neu] of paare) {
    const n = text.split(alt).length - 1;
    if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG"} in ${rel}: ${alt.slice(0, 70).replace(/\n/g, "⏎")}…`); continue; }
    text = text.replace(alt, () => neu);
  }
  if (!fehler && !nurPruefen) { fs.writeFileSync(abs, text); console.log(`geschrieben: ${rel}`); } else console.log(`${nurPruefen ? "Vorschau" : "NICHT geschrieben"}: ${rel}`);
}
if (fehler) process.exit(1);
