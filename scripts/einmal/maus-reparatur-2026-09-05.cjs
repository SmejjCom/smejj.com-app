// smejj.com — Maus-Livetest 2026-09-05, vierter Befund (Auftrag "tippe Berlin ins Suchfeld,
// schicke ab, nenne die Einwohnerzahl"): das Modell tippte richtig, scheiterte dann dreimal
// an der Form (navigate ohne url; spaeter Aktionen, die das Panel gar nicht ausfuehren kann).
// Drei Massnahmen, alle deterministisch:
//   1. repariereEntscheidung(): offensichtliche Formfehler VOR der Pruefung geradebiegen
//      (url aus target, id zu String, Plan-Huelle auspacken, Fremdfelder weg, target-String
//      zu Selektor). Danach prueft der Validator wie bisher streng — auch die Allowlist.
//   2. buildStepPrompt({ erlaubteAktionen }): der Vertrag nennt nur Aktionen, die der
//      Aufrufer ausfuehren kann. Fuer den Panel-Weg (naechsterSchritt) sind das acht.
//   3. Route: eine Aktion ausserhalb dieser acht gilt als abgelehnt und loest die Nachfrage
//      aus — statt beim Panel als "nicht_uebersetzbar" den Lauf zu beenden.
// Wurzel als Argument; Textanker; idempotent. Aufruf: node <datei> <wurzel> [--pruefen]
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; const nurPruefen = process.argv.includes("--pruefen");
if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const EDITS = {
  "workers/maus-engine/interactive-loop.mjs": [
    [`export function validateLoopDecision(rawAnswer, policyInput) {
  const normalized = normalizePlannerOutput(rawAnswer);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };
  const decision = normalized.plan;
  const envelope = decisionValidator()(decision);
  if (!envelope.ok) return { ok: false, errors: envelope.errors.slice(0, 10) };
  if (decision.decision !== "act") return { ok: true, decision };
`, `// OFFENSICHTLICHE FORMFEHLER REPARIEREN, BEVOR GEPRUEFT WIRD.
//
// LIVE GEMESSEN 2026-09-05 (sechs Anfragen, dieselbe Beobachtung): drei
// Ablehnungen, jede mit anderem Formfehler — navigate ohne url (die Adresse
// stand in "target"), step.id als Zahl, ein ganzer Plan mit capsuleRef/
// planner/policy statt einer Entscheidung. Inhaltlich war jede dieser
// Antworten richtig. Ein Mensch haette sie ohne Nachdenken verstanden.
//
// Deshalb wird hier deterministisch geradegebogen, was eindeutig ist —
// NICHT geraten. Jede Reparatur ist eine reine Umformung ohne neue
// Information: eine Adresse wandert in das Feld, in das sie gehoert; eine
// Zahl wird zum String; die Huelle faellt weg. Danach laeuft dieselbe
// strenge Pruefung wie bisher, inklusive Allowlist. Was nach der Reparatur
// nicht passt, wird weiter abgelehnt. Die Liste "repariert" geht mit hinaus,
// damit man MESSEN kann, was das Modell wie oft falsch macht.
const PLAN_FELDER = ["planId", "createdAt", "capsuleRef", "planner", "policy", "steps"];
const URL_MUSTER = /^https?:\\/\\/\\S+$/i;
function urlAus(wert) {
  if (typeof wert === "string" && URL_MUSTER.test(wert.trim())) return wert.trim();
  if (wert && typeof wert === "object" && !Array.isArray(wert)) {
    for (const k of ["url", "href", "value", "link"]) { const u = urlAus(wert[k]); if (u) return u; }
  }
  return "";
}
export function repariereEntscheidung(eingabe) {
  const repariert = [];
  if (!eingabe || typeof eingabe !== "object" || Array.isArray(eingabe)) return { decision: eingabe, repariert };
  let d = { ...eingabe };
  // 1. Ein Plan statt einer Entscheidung: der erste Schritt IST die Entscheidung.
  if (typeof d.decision !== "string" && Array.isArray(d.steps) && d.steps.length && d.steps[0] && typeof d.steps[0] === "object") {
    d = { schemaVersion: 1, decision: "act", reason: typeof d.reason === "string" && d.reason.trim() ? d.reason : "aus Plan uebernommen (erster Schritt)", step: { ...d.steps[0] } };
    repariert.push("plan_zu_entscheidung");
  }
  // 2. Plan-Felder neben einer Entscheidung: weg damit (unevaluatedProperties:false).
  for (const f of PLAN_FELDER) if (f in d) { delete d[f]; repariert.push(\`feld_entfernt:\${f}\`); }
  if (d.schemaVersion === undefined && typeof d.decision === "string") { d.schemaVersion = 1; repariert.push("schemaVersion_ergaenzt"); }
  // 3. done: das Ergebnis ist ein String, auch wenn das Modell eine Zahl schickt.
  if (d.decision === "done" && d.result !== undefined && typeof d.result !== "string") {
    d.result = typeof d.result === "object" ? JSON.stringify(d.result) : String(d.result);
    repariert.push("result_zu_string");
  }
  if (d.decision !== "act" || !d.step || typeof d.step !== "object") return { decision: d, repariert };
  const s = { ...d.step };
  // 4. id ist ein String.
  if (typeof s.id === "number") { s.id = String(s.id); repariert.push("id_zu_string"); }
  else if (typeof s.id !== "string" || !s.id) { s.id = "s1"; repariert.push("id_ergaenzt"); }
  // 5. openLink mit Adresse statt Ziel ist ein navigate (Befund schon 2026-08-18).
  if (s.action === "openLink" && !s.target && urlAus(s.url)) { s.action = "navigate"; repariert.push("openLink_zu_navigate"); }
  // 6. navigate ohne url: die Adresse steckt in einem anderen Feld.
  if (s.action === "navigate" && typeof s.url !== "string") {
    for (const k of ["target", "href", "value", "link", "address", "adresse", "page", "destination"]) {
      const u = urlAus(s[k]);
      if (u) { s.url = u; delete s[k]; repariert.push(\`url_aus_\${k}\`); break; }
    }
  }
  // 7. type/fill: der Text heisst "text".
  if (s.action === "fill") { s.action = "type"; repariert.push("fill_zu_type"); }
  if (s.action === "type" && typeof s.text !== "string") {
    for (const k of ["value", "input", "eingabe", "query"]) {
      if (typeof s[k] === "string") { s.text = s[k]; delete s[k]; repariert.push(\`text_aus_\${k}\`); break; }
    }
  }
  // 8. Ein nackter Selektor-String wird zum Selektor-Objekt.
  if (typeof s.target === "string" && s.target.trim()) {
    const t = s.target.trim();
    s.target = /^[#.\\[]|^[a-z][a-z0-9]*[#.\\[:>\\s]/i.test(t) ? { strategy: "css", value: t } : { strategy: "text", value: t };
    repariert.push("target_zu_selektor");
  }
  // 9. ZWEI ZIELFORMEN, und das Modell verwechselt sie staendig (Befund schon
  //    2026-08-18): die Klick-Familie verlangt { selector: {...} }, alle
  //    anderen den flachen Selektor { strategy, value }. Beides ist dieselbe
  //    Information — also umpacken statt ablehnen.
  const KLICK_FAMILIE = ["click", "doubleClick", "rightClick", "hover"];
  if (s.target && typeof s.target === "object" && !Array.isArray(s.target)) {
    const flach = typeof s.target.strategy === "string";
    const gehuellt = s.target.selector && typeof s.target.selector === "object";
    if (KLICK_FAMILIE.includes(s.action) && flach && !gehuellt) { s.target = { selector: s.target }; repariert.push("target_eingehuellt"); }
    else if (!KLICK_FAMILIE.includes(s.action) && gehuellt && !flach) { s.target = s.target.selector; repariert.push("target_ausgepackt"); }
  }
  d.step = s;
  return { decision: d, repariert };
}

export function validateLoopDecision(rawAnswer, policyInput) {
  const normalized = normalizePlannerOutput(rawAnswer);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };
  const { decision, repariert } = repariereEntscheidung(normalized.plan);
  const envelope = decisionValidator()(decision);
  if (!envelope.ok) return { ok: false, errors: envelope.errors.slice(0, 10), repariert };
  if (decision.decision !== "act") return { ok: true, decision, repariert };
`],
    [`    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10) };
  }
  return { ok: true, decision };
}`, `    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10), repariert };
  }
  return { ok: true, decision, repariert };
}`]
  ],
  "workers/maus-engine/prompt-template.mjs": [
    [`function stepContractBlock() {
  const { actions, strategies } = schemaInfo();
  const allowed = actions.filter((action) => !LOOP_FORBIDDEN.includes(action));`, `function stepContractBlock(erlaubteAktionen = null) {
  const { actions, strategies } = schemaInfo();
  const allowed = actions.filter((action) => !LOOP_FORBIDDEN.includes(action) && (!erlaubteAktionen || erlaubteAktionen.includes(action)));`],
    [`    \`- Erlaubte Aktionen im Loop: \${allowed.join(", ")}\`,`, `    \`- Erlaubte Aktionen im Loop: \${allowed.join(", ")}\`,
    // Der Aufrufer (heute: das Panel im Browser des Nutzers) kann nicht jede
    // Aktion des Schemas ausfuehren. Was er nicht kann, darf das Modell gar
    // nicht erst vorschlagen — sonst endet der Lauf an einem gueltigen, aber
    // unausfuehrbaren Schritt (live 2026-09-05: hotkey nach dem Tippen).
    ...(erlaubteAktionen ? ["  NUR diese Aktionen kann der Browser hier ausfuehren — jede andere wird abgelehnt.", "  Zum Abschicken eines Formulars: den Such- oder Senden-Knopf per click treffen."] : []),`],
    [`function pflichtfelderBlock() {
  const { pflichtfelder } = schemaInfo();
  const zeilen = pflichtfelder
    .filter(({ action }) => !LOOP_FORBIDDEN.includes(action))`, `function pflichtfelderBlock(erlaubteAktionen = null) {
  const { pflichtfelder } = schemaInfo();
  const zeilen = pflichtfelder
    .filter(({ action }) => !LOOP_FORBIDDEN.includes(action) && (!erlaubteAktionen || erlaubteAktionen.includes(action)))`],
    [`export function buildStepPrompt({ task, capsuleRef, domainAllowlist, budget, files, visionAllowed, observation, history = [], remainingSteps }) {`,
     `export function buildStepPrompt({ task, capsuleRef, domainAllowlist, budget, files, visionAllowed, observation, history = [], remainingSteps, erlaubteAktionen = null }) {`],
    [`    stepContractBlock(),
    "",
    policyBlock({ capsuleRef, domainAllowlist, budget, files, visionAllowed }),
    \`- Verbleibende Entscheidungen (hartes Budget): \${remainingSteps}\`,`, `    stepContractBlock(erlaubteAktionen),
    "",
    policyBlock({ capsuleRef, domainAllowlist, budget, files, visionAllowed }),
    \`- Verbleibende Entscheidungen (hartes Budget): \${remainingSteps}\`,`],
    [`    ...pflichtfelderBlock(),`, `    ...pflichtfelderBlock(erlaubteAktionen),`]
  ],
  "control-server/src/routes/mausEngineRoutes.js": [
    [`const LOOP_DEFAULT_DURATION_MS = 240_000;
`, `const LOOP_DEFAULT_DURATION_MS = 240_000;
// Was das Panel im Browser des Nutzers WIRKLICH ausfuehren kann (Spiegel von
// alsSitzungsAktion in public/browser-pane-maus.js). Der Schritt-Vertrag
// nennt dem Modell nur diese; alles andere gilt als abgelehnt und loest die
// Nachfrage aus. Vorher endete der Lauf im Panel an einem schemagueltigen,
// aber dort unausfuehrbaren Schritt ("nicht_uebersetzbar") — live 2026-09-05.
export const PANEL_AKTIONEN = Object.freeze(["navigate", "click", "openLink", "type", "extract", "assert", "scroll", "waitFor"]);
function pruefeFuerPanel(entscheidung) {
  const aktion = entscheidung?.decision?.step?.action;
  if (!entscheidung?.ok || entscheidung.decision?.decision !== "act" || PANEL_AKTIONEN.includes(aktion)) return entscheidung;
  return {
    ok: false,
    repariert: entscheidung.repariert || [],
    errors: [\`aktion_im_browser_nicht_ausfuehrbar: \${aktion} — erlaubt sind nur \${PANEL_AKTIONEN.join(", ")}\`]
  };
}
`],
    [`        history: verlauf,
        remainingSteps: restSchritte
      });`, `        history: verlauf,
        remainingSteps: restSchritte,
        erlaubteAktionen: PANEL_AKTIONEN
      });`],
    [`      let roh = await planer(prompt);
      entscheidung = validateLoopDecision(roh, policyInput);`, `      let roh = await planer(prompt);
      entscheidung = pruefeFuerPanel(validateLoopDecision(roh, policyInput));`],
    [`        roh = await planer(buildStepRetryPrompt({ stepPrompt: prompt, errors: entscheidung.errors || [], vorigeAntwort: roh }));
        entscheidung = validateLoopDecision(roh, policyInput);`, `        roh = await planer(buildStepRetryPrompt({ stepPrompt: prompt, errors: entscheidung.errors || [], vorigeAntwort: roh }));
        entscheidung = pruefeFuerPanel(validateLoopDecision(roh, policyInput));`],
    [`      // Fuer die Messung: kam die Entscheidung im ersten oder zweiten Anlauf?
      nachgefragt,`, `      // Fuer die Messung: kam die Entscheidung im ersten oder zweiten Anlauf,
      // und was musste vorher geradegebogen werden?
      nachgefragt,
      repariert: entscheidung.repariert || [],`]
  ]
};
let fehler = 0;
for (const [rel, paare] of Object.entries(EDITS)) {
  const abs = path.join(wurzel, rel); let text = fs.readFileSync(abs, "utf8");
  if (text.includes("repariereEntscheidung") && rel.endsWith("interactive-loop.mjs")) { console.log(`schon drin: ${rel}`); continue; }
  if (text.includes("erlaubteAktionen") && rel.endsWith("prompt-template.mjs")) { console.log(`schon drin: ${rel}`); continue; }
  if (text.includes("PANEL_AKTIONEN") && rel.endsWith("mausEngineRoutes.js")) { console.log(`schon drin: ${rel}`); continue; }
  for (const [alt, neu] of paare) {
    const n = text.split(alt).length - 1;
    if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG"} in ${rel}: ${alt.slice(0, 70).replace(/\n/g, "⏎")}…`); continue; }
    text = text.replace(alt, () => neu);
  }
  if (!fehler && !nurPruefen) { fs.writeFileSync(abs, text); console.log(`geschrieben: ${rel}`); } else console.log(`${nurPruefen ? "Vorschau" : "NICHT geschrieben"}: ${rel}`);
}
if (fehler) process.exit(1);
