// smejj.com — EINE Quelle der Wahrheit fuer den Inhalt von Control-Release-Artefakten.
//
// Warum dieses Modul existiert (Lehre aus dem rc1-Crash, 2026-07-17):
// Es gab zwei Builder mit zwei getrennt gepflegten Include-Listen
// (build_control_release_artifact.mjs mit Defaults OHNE workers/schemas,
// build_maus_control_release_artifact.mjs MIT beiden). Der Preflight-Check
// pruefte nur gegen EINE der Listen — ein Artefakt aus dem anderen Builder war
// boot-kaputt (ERR_MODULE_NOT_FOUND workers/maus-engine/planner-roundtrip.mjs)
// und lief in einen Endlos-Crash-Loop. Zwei Listen driften zwangslaeufig
// auseinander; ab hier importieren ALLE Builder und ALLE Checks diese Liste.
//
// Aenderungsregel: Wer eine neue Laufzeit-Abhaengigkeit des Control Servers
// einfuehrt (Import ODER per fs gelesene Datei), ergaenzt sie HIER — nirgends sonst.

// Vollstaendiger Inhalt eines Control-Release-Artefakts.
export const CONTROL_RELEASE_INCLUDE_PATHS = Object.freeze([
  "package.json",
  "src",
  "control-server",
  "gatekeeper",
  "worker-templates",
  "public",
  "docs",
  // schemas: die Maus-Engine liest maus-*.schema.json zur LAUFZEIT per fs
  // (plan-validator, interactive-loop, prompt-template) — fehlt der Ordner,
  // bootet der Server zwar, aber der erste Maus-Lauf scheitert mit ENOENT.
  "schemas",
  // workers: src/server.js -> control-server/src/routes/mausEngineRoutes.js
  // importiert workers/maus-engine/* + workers/glm-salad/s3.js statisch;
  // src/agent/roleRegistry.js importiert workers/smejj-worker/role-registry.mjs.
  "workers",
  "Memory_Bank.md",
  "AI_Guidelines.md",
  "Project_Goals.md",
  "AGENTS.md",
  "README.md",
  "deploy/control-server/Dockerfile"
]);

// Dateien, die zur LAUFZEIT per fs gelesen werden (kein Import — ein
// Import-Graph-Check kann sie prinzipbedingt nicht finden), aber genauso
// zwingend im Artefakt liegen muessen wie importierte Module.
// `whenPresent` koppelt die Forderung an das Modul, das die Datei liest:
// Nur wenn dieses Modul im Artefakt ist, wird die Ressource verlangt —
// so bleibt die Regel fuer Teil-Artefakte korrekt statt pauschal.
export const CONTROL_RELEASE_RUNTIME_RESOURCES = Object.freeze([
  Object.freeze({
    resource: "schemas/maus-action-plan.schema.json",
    whenPresent: "workers/maus-engine/plan-validator.mjs",
    reason: "plan-validator/prompt-template lesen das Plan-Schema beim ersten Maus-Lauf (ENOENT ohne Datei)"
  }),
  Object.freeze({
    resource: "schemas/maus-step-decision.schema.json",
    whenPresent: "workers/maus-engine/interactive-loop.mjs",
    reason: "interactive-loop liest das Entscheidungs-Schema pro Schritt (ENOENT ohne Datei)"
  })
]);

// Liegt ein relativer Pfad innerhalb der Include-Liste?
export function isInReleaseIncludePaths(relativePath, includePaths = CONTROL_RELEASE_INCLUDE_PATHS) {
  return includePaths.some((include) => relativePath === include || relativePath.startsWith(`${include}/`));
}
