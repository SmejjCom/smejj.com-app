// smejj.com Maus-Engine — interaktiver Loop-Modus (Observe-Decide-Act).
// Single Responsibility: den budgetierten Loop fahren:
//   beobachten (observer.mjs) -> entscheiden (injizierter plannerClient,
//   modellneutral, JSON-Vertrag maus-step-decision.schema.json) ->
//   handeln (injiziertes runAction, deterministische Engine) -> pruefen.
// NICHT Standard: nur bei task.mode === "interaktiv" oder nach
// gescheitertem Plan-Modus (Verdrahtung in planner-roundtrip.mjs).
// Alles fail-closed: hartes Budget maxLoopSteps, Einzelschritt-Validierung
// gegen das bestehende Plan-Schema, Allowlist bei JEDEM Schritt.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createValidator } from "./schema-validator.mjs";
import { validatePlan } from "./plan-validator.mjs";
import { checkUrlAllowed } from "./allowlist.mjs";
import { normalizePlannerOutput } from "./plan-normalizer.mjs";
import { buildStepPrompt, PROMPT_TEMPLATE_VERSION } from "./prompt-template.mjs";
import { buildObservation } from "./observer.mjs";

export const LOOP_DEFAULT_MAX_STEPS = 8;
export const LOOP_HARD_MAX_STEPS = 25;
export const LOOP_FORBIDDEN_ACTIONS = Object.freeze(["openBrowser", "closeBrowser", "runMacro"]);

const DECISION_SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas", "maus-step-decision.schema.json");

let cachedDecisionValidator = null;
function decisionValidator() {
  if (!cachedDecisionValidator) {
    cachedDecisionValidator = createValidator(JSON.parse(readFileSync(DECISION_SCHEMA_PATH, "utf8")));
  }
  return cachedDecisionValidator;
}

// Synthetischer Ein-Schritt-Plan: der Loop-Schritt wird gegen das VOLLE
// bestehende Plan-Schema inkl. Semantik (Allowlist, files, vision, budget)
// validiert — exakt dieselben Regeln wie im Plan-Modus, fail-closed.
function syntheticPlanFor(step, policyInput) {
  return {
    schemaVersion: 1,
    planId: "loop-schritt",
    createdAt: new Date(0).toISOString(),
    capsuleRef: policyInput.capsuleRef,
    planner: { modelId: "loop", promptTemplateVersion: PROMPT_TEMPLATE_VERSION },
    policy: {
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      ...(policyInput.files ? { files: policyInput.files } : {}),
      ...(policyInput.visionAllowed === true ? { visionAllowed: true } : {})
    },
    steps: [step]
  };
}

// Rohe Modellantwort -> validierte Entscheidung. Rueckgabe fail-closed:
// { ok:true, decision } oder { ok:false, errors, allowlistViolation? }.
// allowlistViolation loest im Loop den SOFORTIGEN Abbruch aus (kein
// weiterer Modell-Aufruf, kein Browser-Aufruf).
// OFFENSICHTLICHE FORMFEHLER REPARIEREN, BEVOR GEPRUEFT WIRD.
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
const URL_MUSTER = /^https?:\/\/\S+$/i;
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
  for (const f of PLAN_FELDER) if (f in d) { delete d[f]; repariert.push(`feld_entfernt:${f}`); }
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
      if (u) { s.url = u; delete s[k]; repariert.push(`url_aus_${k}`); break; }
    }
  }
  // 7. type/fill: der Text heisst "text".
  if (s.action === "fill") { s.action = "type"; repariert.push("fill_zu_type"); }
  if (s.action === "type" && typeof s.text !== "string") {
    for (const k of ["value", "input", "eingabe", "query"]) {
      if (typeof s[k] === "string") { s.text = s[k]; delete s[k]; repariert.push(`text_aus_${k}`); break; }
    }
  }
  // 7b. Ein KLICK AUF EINE ADRESSE ist ein navigate (live 2026-09-05: "Klicken:
  //     https://de.wikipedia.org/wiki/Ada_Lovelace" — als Text-Selektor ging der
  //     Klick ins Leere und beendete den Lauf; als navigate ist er genau richtig).
  if (["click", "openLink", "doubleClick"].includes(s.action) && !s.url) {
    const u = urlAus(s.target);
    if (u) { s.action = "navigate"; s.url = u; delete s.target; repariert.push("klick_auf_adresse_zu_navigate"); }
  }
  // 8. Ein nackter Selektor-String wird zum Selektor-Objekt.
  if (typeof s.target === "string" && s.target.trim()) {
    const t = s.target.trim();
    s.target = /^[#.\[]|^[a-z][a-z0-9]*[#.\[:>\s]/i.test(t) ? { strategy: "css", value: t } : { strategy: "text", value: t };
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

  const step = decision.step;
  if (LOOP_FORBIDDEN_ACTIONS.includes(step?.action)) {
    return { ok: false, errors: [`aktion_im_loop_verboten: ${step.action}`] };
  }
  // Allowlist-Pruefung VOR der Schema-Validierung sichtbar machen:
  // navigate/httpRequest ausserhalb der Allowlist ist ein harter Abbruch.
  if (typeof step?.url === "string") {
    const check = checkUrlAllowed(step.url, policyInput.domainAllowlist);
    if (!check.ok) return { ok: false, allowlistViolation: true, errors: [check.error] };
  }
  const validation = validatePlan(syntheticPlanFor(step, policyInput));
  if (!validation.ok) {
    const allowlistViolation = validation.errors.some((error) => /Allowlist|Blockierter Host/i.test(error));
    return { ok: false, allowlistViolation, errors: validation.errors.slice(0, 10), repariert };
  }
  return { ok: true, decision, repariert };
}

function taskText(task) {
  return typeof task === "object" && task !== null ? String(task.text ?? "") : String(task ?? "");
}

// Kernschleife. Alle Seiteneffekte sind injiziert (modellneutral, testbar
// ohne Browser): plannerClient(prompt) -> Antworttext; runAction(step, i)
// fuehrt einen validierten Schritt deterministisch aus (Produktion:
// Interpreter ctx.runMacroSteps + enforcePageAllowed, siehe loop-runner.mjs).
// Der Standard-Beobachter holt seit 2026-08-21 den Bedienbaum MIT (ZCode-
// Vorbild): das Modell soll Rolle und Beschriftung aus Chromiums eigenem
// Baum lesen, statt Selektoren zu raten. Fail-open — bleibt der Baum aus
// (Chrome-Adapter kann es nicht), arbeitet der Loop wie bisher weiter.
const LOOP_OBSERVER = (page) => buildObservation(page, { mitBedienbaum: true });

export async function observeDecideAct({ task, policyInput, page, plannerClient, runAction, observer = LOOP_OBSERVER, onDecision = null, clock = Date }) {
  if (typeof plannerClient !== "function" || typeof runAction !== "function") {
    throw new Error("loop_parameter_fehlen");
  }
  const requested = policyInput?.budget?.maxLoopSteps ?? LOOP_DEFAULT_MAX_STEPS;
  const maxLoopSteps = Math.min(Number(requested), LOOP_HARD_MAX_STEPS);
  if (!Number.isFinite(maxLoopSteps) || maxLoopSteps < 1) {
    return { ok: false, mode: "interaktiv", error: "loop_budget_ungueltig", loopSteps: 0, modelCalls: 0, decisions: [], recordedSteps: [] };
  }

  // ZEITGRENZE — bis 2026-08-17 hatte der Loop KEINE.
  //
  // Er zaehlte ausschliesslich Schritte. `maxDurationMs` wurde im Plan
  // mitgefuehrt, geklemmt und dokumentiert — und hier schlicht ignoriert. Der
  // Plan-Modus hat seine Frist (interpreter.run), der freie Modus hatte keine.
  //
  // Aufgefallen ist es beim Gegenteil eines Fehlers: Die Schrittzahl wurde von
  // 16 auf 10 gesenkt, damit ein Lauf in die ~300 s passt, die die Plattform
  // eine Verbindung offen haelt. Es aenderte NICHTS — der Lauf lief weiter bis
  // zur gekappten Verbindung und endete mit `worker_fehler: fetch failed`,
  // ohne Ergebnis und ohne Protokoll. Eine Frist, die niemand liest, ist keine.
  //
  // Jetzt endet der Lauf von selbst und liefert, wie weit er kam. Das ist der
  // Unterschied zwischen "abgebrochen, wir wissen nichts" und "hier ist der
  // Stand nach acht Schritten".
  const maxDurationMs = Number(policyInput?.budget?.maxDurationMs);
  const deadline = Number.isFinite(maxDurationMs) && maxDurationMs > 0
    ? clock.now() + maxDurationMs
    : Infinity;

  const decisions = [];
  const history = [];
  const recordedSteps = [];
  let modelCalls = 0;
  let zeitAbgelaufen = false;

  for (let iteration = 1; iteration <= maxLoopSteps; iteration += 1) {
    // VOR der Modellfrage pruefen: sie ist der teure Teil, und ein Schritt,
    // der ohnehin nicht mehr ausgefuehrt wird, muss nicht bezahlt werden.
    if (clock.now() >= deadline) { zeitAbgelaufen = true; break; }
    const observation = await observer(page);
    const prompt = buildStepPrompt({
      task: taskText(task),
      capsuleRef: policyInput.capsuleRef,
      domainAllowlist: policyInput.domainAllowlist,
      budget: policyInput.budget,
      files: policyInput.files,
      visionAllowed: policyInput.visionAllowed,
      observation,
      history,
      remainingSteps: maxLoopSteps - iteration + 1
    });
    modelCalls += 1;
    const rawAnswer = await plannerClient(prompt);
    const verdict = validateLoopDecision(rawAnswer, policyInput);

    if (!verdict.ok) {
      const entry = { iteration, phase: "validate", ok: false, errors: verdict.errors };
      decisions.push(entry);
      history.push({ schritt: iteration, abgelehnt: true, fehler: verdict.errors.slice(0, 3) });
      if (onDecision) await onDecision(entry, observation);
      if (verdict.allowlistViolation === true) {
        // Sofortiger Abbruch: Allowlist-Verstoss ist nie verhandelbar.
        return { ok: false, mode: "interaktiv", aborted: true, abortReason: `allowlist_verstoss: ${verdict.errors[0]}`, loopSteps: iteration, modelCalls, decisions, recordedSteps };
      }
      continue; // abgelehnter Schritt erreicht NIE den Browser; Budget zaehlt weiter
    }

    const decision = verdict.decision;
    const entry = { iteration, phase: "decide", decision: decision.decision, reason: decision.reason, step: decision.step ?? null, ok: true };
    if (onDecision) await onDecision(entry, observation);

    if (decision.decision === "done") {
      decisions.push(entry);
      return { ok: true, mode: "interaktiv", done: true, result: decision.result ?? null, reason: decision.reason, loopSteps: iteration, modelCalls, decisions, recordedSteps };
    }
    if (decision.decision === "fail") {
      decisions.push(entry);
      return { ok: false, mode: "interaktiv", error: "modell_meldet_nicht_loesbar", reason: decision.reason, loopSteps: iteration, modelCalls, decisions, recordedSteps };
    }

    try {
      const value = await runAction(decision.step, iteration);
      entry.actionOk = true;
      recordedSteps.push({ ...decision.step, id: `l${recordedSteps.length + 1}` });
      history.push({ schritt: iteration, action: decision.step.action, ok: true, ergebnis: value ?? null });
    } catch (error) {
      entry.actionOk = false;
      entry.actionError = String(error?.message || error).slice(0, 300);
      history.push({ schritt: iteration, action: decision.step.action, ok: false, fehler: entry.actionError });
      if (/allowlist|Blockierter Host|budget_/i.test(entry.actionError)) {
        decisions.push(entry);
        return { ok: false, mode: "interaktiv", aborted: true, abortReason: entry.actionError, loopSteps: iteration, modelCalls, decisions, recordedSteps };
      }
    }
    decisions.push(entry);
  }

  // Budget erschoepft: fail-closed, keine weiteren Modell-Aufrufe.
  // Zwei verschiedene Enden, zwei verschiedene Worte: `loop_zeit_erschoepft`
  // heisst "die Frist war um, weitere Schritte waeren gegangen" —
  // `loop_budget_erschoepft` heisst "alle Schritte verbraucht". Wer beides
  // gleich nennt, dreht beim Diagnostizieren wieder an der falschen Zahl.
  if (zeitAbgelaufen) {
    return { ok: false, mode: "interaktiv", error: "loop_zeit_erschoepft", loopSteps: decisions.length, modelCalls, decisions, recordedSteps };
  }
  return { ok: false, mode: "interaktiv", error: "loop_budget_erschoepft", loopSteps: maxLoopSteps, modelCalls, decisions, recordedSteps };
}
