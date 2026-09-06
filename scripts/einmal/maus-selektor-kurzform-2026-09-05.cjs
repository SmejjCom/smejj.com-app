// smejj.com — 2026-09-06 frueh: Live-Mitschnitt zeigte, dass das Modell ein "extract" mit
// id/action/target/name vorschlug — abgelehnt, und die Meldung sprach von "Pflichtfeld fehlt:
// url" (der Pruefer nennt nur die ersten drei Schema-Varianten). Drei Massnahmen:
//   1. Selektor-Kurzformen normalisieren: "h1" | {selector:"h1"} | {css:"h1"} | {text:"…"} |
//      {role:"heading", name:"…"} -> {strategy, value[, name]}.
//   2. Praezise Fehler je Aktion VOR den Schema-Gruenden: fehlende Pflichtfelder und ein
//      unbrauchbares Ziel werden benannt — fuer die Nachfrage und fuer den Nutzer.
//   3. Der "vorschlag" nennt auch die Form des Ziels.
const fs = require("fs"); const path = require("path");
const wurzel = process.argv[2]; if (!wurzel) { console.error("Wurzel fehlt."); process.exit(1); }
const abs = path.join(wurzel, "workers/maus-engine/interactive-loop.mjs"); let t = fs.readFileSync(abs, "utf8");
if (t.includes("normalisiereSelektor")) { console.log("schon drin"); process.exit(0); }
const EDITS = [
  [`export function repariereEntscheidung(eingabe) {`,
`const STRATEGIEN = ["role", "testId", "label", "text", "css", "xpath"];
const KLICK_FAMILIE = ["click", "doubleClick", "rightClick", "hover"];
/** Kurzformen eines Selektors in die Schema-Form bringen — oder unveraendert lassen. */
function normalisiereSelektor(ziel) {
  if (typeof ziel === "string" && ziel.trim()) {
    const s = ziel.trim();
    // Ein nacktes Wort ist nur dann CSS, wenn es ein HTML-Element ist ("h1",
    // "button") — "Weiter" ist Text auf einem Knopf, kein Element.
    const istElement = /^(h[1-6]|a|p|button|input|form|main|nav|header|footer|section|article|aside|table|thead|tbody|tr|td|th|ul|ol|li|span|div|img|select|option|textarea|label|body|title|summary|details|dialog|iframe)$/.test(s);
    return (istElement || (/^[#.\\[]|^[a-z][a-z0-9-]*[#.\\[:>\\s]/i.test(s) && !/\\s/.test(s)))
      ? { strategy: "css", value: s } : { strategy: "text", value: s };
  }
  if (!ziel || typeof ziel !== "object" || Array.isArray(ziel)) return ziel;
  if (typeof ziel.strategy === "string" && typeof ziel.value === "string") return ziel;
  if (typeof ziel.selector === "string") { const innen = normalisiereSelektor(ziel.selector); return ziel.name && innen && !innen.name && innen.strategy === "role" ? { ...innen, name: String(ziel.name) } : innen; }
  for (const k of STRATEGIEN) {
    if (typeof ziel[k] === "string" && ziel[k].trim()) {
      const aus = { strategy: k, value: ziel[k].trim() };
      if (k === "role" && typeof ziel.name === "string") aus.name = ziel.name;
      return aus;
    }
  }
  return ziel;
}
/** Praezise Gruende je Aktion — statt der ersten drei Schema-Varianten. */
function praeziseGruende(step, pflichtfelder) {
  const gruende = [];
  const eintrag = pflichtfelder.find((p) => p.action === step?.action);
  if (!eintrag) return gruende;
  for (const feld of eintrag.required) if (step[feld] === undefined) gruende.push(\`Pflichtfeld fehlt fuer \${step.action}: \${feld}\`);
  const ziel = KLICK_FAMILIE.includes(step.action) ? step.target?.selector : step.target;
  if (step.target !== undefined && !(ziel && typeof ziel === "object" && typeof ziel.strategy === "string" && typeof ziel.value === "string")) {
    gruende.push(\`target unbrauchbar fuer \${step.action}: erwartet \${KLICK_FAMILIE.includes(step.action) ? "{selector:{strategy,value}}" : "{strategy,value}"}, erhalten \${typeof step.target === "object" ? "Felder " + Object.keys(step.target).join(",") : typeof step.target}\`);
  }
  return gruende;
}
let cachedPflichtfelder = null;
function pflichtfelderAusSchema() {
  if (!cachedPflichtfelder) {
    const s = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas", "maus-action-plan.schema.json"), "utf8"));
    cachedPflichtfelder = s.$defs.step.oneOf.map((v) => ({ action: v.properties.action.const, required: (v.required || []).filter((f) => f !== "action") }));
  }
  return cachedPflichtfelder;
}

export function repariereEntscheidung(eingabe) {`],
  [`  // 8. Ein nackter Selektor-String wird zum Selektor-Objekt.
  if (typeof s.target === "string" && s.target.trim()) {
    const t = s.target.trim();
    s.target = /^[#.\\[]|^[a-z][a-z0-9]*[#.\\[:>\\s]/i.test(t) ? { strategy: "css", value: t } : { strategy: "text", value: t };
    repariert.push("target_zu_selektor");
  }`,
   `  // 8. Kurzformen des Ziels in die Schema-Form bringen: "h1", {selector:"h1"},
  //    {css:"h1"}, {text:"…"}, {role:"heading", name:"…"} (Live-Mitschnitt 06.09.:
  //    ein extract mit id/action/target/name wurde abgelehnt — die Zielform passte nicht).
  if (s.target !== undefined) {
    const vorher = JSON.stringify(s.target);
    const innenVorher = s.target && typeof s.target === "object" && s.target.selector && typeof s.target.selector === "object" ? s.target.selector : null;
    if (innenVorher) { const innen = normalisiereSelektor(innenVorher); if (JSON.stringify(innen) !== JSON.stringify(innenVorher)) s.target = { ...s.target, selector: innen }; }
    else s.target = normalisiereSelektor(s.target);
    if (JSON.stringify(s.target) !== vorher) repariert.push("target_zu_selektor");
  }`],
  [`  const KLICK_FAMILIE = ["click", "doubleClick", "rightClick", "hover"];
  if (s.target && typeof s.target === "object" && !Array.isArray(s.target)) {`,
   `  if (s.target && typeof s.target === "object" && !Array.isArray(s.target)) {`],
  [`  const vorschlag = decision && typeof decision === "object"
    ? { decision: decision.decision, action: decision.step?.action, felder: Object.keys(decision.step || {}) }
    : null;`,
   `  const vorschlag = decision && typeof decision === "object"
    ? {
      decision: decision.decision, action: decision.step?.action, felder: Object.keys(decision.step || {}),
      target: typeof decision.step?.target === "string" ? decision.step.target.slice(0, 80)
        : decision.step?.target && typeof decision.step.target === "object" ? { felder: Object.keys(decision.step.target), selector: decision.step.target.selector && typeof decision.step.target.selector === "object" ? Object.keys(decision.step.target.selector) : typeof decision.step.target.selector } : undefined
    }
    : null;`],
  [`  const validation = validatePlan(syntheticPlanFor(step, policyInput));
  if (!validation.ok) {
    const allowlistViolation = validation.errors.some((error) => /Allowlist|Blockierter Host/i.test(error));
    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10), repariert, vorschlag };
  }`,
   `  const validation = validatePlan(syntheticPlanFor(step, policyInput));
  if (!validation.ok) {
    const allowlistViolation = validation.errors.some((error) => /Allowlist|Blockierter Host/i.test(error));
    // Praezise Gruende ZUERST: "Pflichtfeld fehlt fuer extract: name" sagt dem
    // Modell (und dem Nutzer) mehr als drei fremde Schema-Varianten.
    const praezise = allowlistViolation ? [] : praeziseGruende(step, pflichtfelderAusSchema());
    return { ok: false, allowlistViolation, errors: [...praezise, ...validation.errors].slice(0, 10), repariert, vorschlag };
  }`]
];
let fehler = 0;
for (const [alt, neu] of EDITS) { const n = t.split(alt).length - 1; if (n !== 1) { fehler += 1; console.error(`ANKER ${n===0?"FEHLT":"MEHRDEUTIG"}: ${alt.slice(0,70).replace(/\n/g,"⏎")}`); continue; } t = t.replace(alt, () => neu); }
if (fehler) process.exit(1);
fs.writeFileSync(abs, t); console.log("geschrieben: workers/maus-engine/interactive-loop.mjs");
