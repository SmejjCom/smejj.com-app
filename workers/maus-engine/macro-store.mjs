// smejj.com Maus-Engine — Makro-Store auf IDrive e2.
// Single Responsibility: erfolgreiche Plaene als wiederverwendbare Makros
// speichern und laden, damit wiederkehrende Aufgaben ganz OHNE
// Planer-Modell laufen (Kostenregel). Makros sind reine Schrittlisten;
// die Sicherheitspolicy (Allowlist, Budget, Dateiregeln) kommt IMMER vom
// aktiven Plan des aufrufenden Tasks und wird bei jeder Ausfuehrung neu
// fail-closed validiert.
import { signedS3Request } from "../glm-salad/s3.js";

const MACRO_SCHEMA_VERSION = 1;

function macroKey(ref) {
  const safe = String(ref).replace(/\.json$/i, "").replace(/[^a-zA-Z0-9._/-]/g, "-").replace(/\.\./g, "-").slice(0, 160);
  return `maus-engine/makros/${safe}.json`;
}

// Deterministischer Makro-Name aus dem Aufgabentext (Stufe 0 / Loop-
// Recorder, additiv 2026-07-15): kebab-case Slug, ohne Pfad, ohne .json.
// Gleiche Aufgabe -> gleicher Name -> Makro-Treffer mit 0 Modell-Aufrufen.
export function deriveMacroName(task) {
  const text = typeof task === "object" && task !== null ? String(task.text ?? "") : String(task ?? "");
  const slug = text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug ? `loop-${slug}` : "loop-aufgabe";
}

// Platzhalter {{name}} in String-Werten deterministisch ersetzen.
// Unaufgeloeste Platzhalter nach der Ersetzung => Fehler (fail-closed).
export function substituteMacroParams(steps, params = {}) {
  const substituted = JSON.parse(JSON.stringify(steps), (key, value) => {
    if (typeof value !== "string") return value;
    return value.replace(/\{\{([a-zA-Z0-9._-]+)\}\}/g, (match, name) => {
      if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
      return String(params[name]);
    });
  });
  const rest = JSON.stringify(substituted).match(/\{\{[a-zA-Z0-9._-]+\}\}/);
  if (rest) throw new Error(`macro_parameter_fehlt: ${rest[0]}`);
  return substituted;
}

// e2-gestuetzter Store; getObject/putObject injizierbar (Tests ohne Netz).
export function createMacroStore({ config, getObject, putObject } = {}) {
  const put = putObject || ((key, body) => signedS3Request(config, "PUT", key, body, "application/json"));
  const get = getObject || ((key) => signedS3Request(config, "GET", key));
  return {
    // Nur erfolgreiche, validierte Plaene werden zu Makros. runMacro-
    // Schritte im Quellplan sind verboten (keine Verschachtelung).
    async save(name, plan) {
      if (!name || !plan || !Array.isArray(plan.steps)) throw new Error("macro_save_parameter_ungueltig");
      if (plan.steps.some((step) => step.action === "runMacro")) {
        throw new Error("macro_darf_kein_runMacro_enthalten");
      }
      const macro = {
        schemaVersion: MACRO_SCHEMA_VERSION,
        name: String(name),
        createdAt: new Date().toISOString(),
        sourcePlanId: plan.planId,
        sourceCapsuleRef: plan.capsuleRef,
        promptFree: true,
        steps: plan.steps
      };
      await put(macroKey(name), JSON.stringify(macro, null, 2));
      return { key: macroKey(name), steps: macro.steps.length };
    },

    async load(ref) {
      let text;
      try {
        text = await get(macroKey(ref));
      } catch {
        return null;
      }
      try {
        const macro = JSON.parse(text);
        if (macro?.schemaVersion !== MACRO_SCHEMA_VERSION || !Array.isArray(macro.steps)) return null;
        return macro;
      } catch {
        return null;
      }
    }
  };
}
