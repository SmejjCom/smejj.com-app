// Waechter: JEDE Aktion im Plan-Schema muss auch ausfuehrbar UND im Prompt
// beschrieben sein.
//
// ZWEI GEMESSENE VORFAELLE stehen hinter diesem Pruefer:
//
// 1. 2026-08-18: `scroll` fehlte als einzige Aktion in der Feldliste des
//    Prompts. Das Modell riet die Form — und riet falsch. JEDER Auftrag mit
//    "scrolle" wurde abgelehnt und komplett neu geplant, 15-25 s pro Runde.
//    Der Plan war nicht schlecht, ihm fehlte nur ein Feld, das niemand
//    genannt hatte.
//
// 2. 2026-08-21: Beim Einbau der Dialog-Aktionen faellt auf, dass eine
//    Aktion im Schema stehen kann, ohne dass ein Handler existiert. Der Plan
//    ist dann gueltig und bricht erst ZUR LAUFZEIT — nach dem Modellaufruf,
//    mitten im Auftrag.
//
// Beides ist dieselbe Familie: eine Liste wurde erweitert, eine zweite
// vergessen. Ein Waechter, der die Listen gegeneinander haelt, ist der
// einzige Weg, das beim naechsten Mal SOFORT zu sehen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPlannerPrompt } from "../workers/maus-engine/prompt-template.mjs";
import { navActions } from "../workers/maus-engine/actions/nav-actions.mjs";
import { mouseActions } from "../workers/maus-engine/actions/mouse-actions.mjs";
import { inputActions } from "../workers/maus-engine/actions/input-actions.mjs";
import { fileActions } from "../workers/maus-engine/actions/file-actions.mjs";
import { dataActions } from "../workers/maus-engine/actions/data-actions.mjs";
import { controlActions } from "../workers/maus-engine/actions/control-actions.mjs";
import { sessionActions } from "../workers/maus-engine/actions/session-actions.mjs";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(WURZEL, "schemas", "maus-action-plan.schema.json"), "utf8"));
const SCHEMA_AKTIONEN = SCHEMA.$defs.step.oneOf.map((v) => v.properties.action.const);

const HANDLER = {
  ...navActions, ...mouseActions, ...inputActions,
  ...fileActions, ...dataActions, ...controlActions, ...sessionActions
};

test("jede Schema-Aktion hat einen Handler — sonst bricht der Plan ZUR LAUFZEIT", () => {
  const ohneHandler = SCHEMA_AKTIONEN.filter((a) => typeof HANDLER[a] !== "function");
  assert.deepEqual(
    ohneHandler,
    [],
    `Diese Aktionen stehen im Schema, aber niemand kann sie ausfuehren:\n  ${ohneHandler.join("\n  ")}`
  );
});

test("jeder Handler steht auch im Schema — keine heimlichen Aktionen", () => {
  const ohneSchema = Object.keys(HANDLER).filter((a) => !SCHEMA_AKTIONEN.includes(a));
  assert.deepEqual(
    ohneSchema,
    [],
    `Diese Handler kennt das Schema nicht — ein Plan mit ihnen waere ungueltig:\n  ${ohneSchema.join("\n  ")}`
  );
});

test("jede Aktion wird im Planer-Prompt genannt — sonst raet das Modell die Form", () => {
  const prompt = buildPlannerPrompt({
    task: "beliebig",
    capsuleRef: "c",
    domainAllowlist: ["example.com"],
    budget: { maxActions: 10 }
  });
  const ungenannt = SCHEMA_AKTIONEN.filter((a) => !prompt.includes(a));
  assert.deepEqual(
    ungenannt,
    [],
    `Diese Aktionen kommen im Prompt nicht vor. Genau daran scheiterte scroll am 2026-08-18:\n  ${ungenannt.join("\n  ")}`
  );
});

test("die neuen Dialog-Aktionen sind vollstaendig angeschlossen", () => {
  // Der konkrete Anlass — bewusst zusaetzlich benannt, damit ein Umbau der
  // Listen oben nicht versehentlich genau diese wieder herausfallen laesst.
  for (const aktion of ["dialogAccept", "dialogDismiss"]) {
    assert.ok(SCHEMA_AKTIONEN.includes(aktion), `${aktion} fehlt im Schema`);
    assert.equal(typeof HANDLER[aktion], "function", `${aktion} hat keinen Handler`);
  }
});

test("die Dialog-Wache haengt an JEDER neuen Seite", () => {
  // Eine Wache, die nur am ersten Tab haengt, laesst den zweiten stumm
  // scheitern — und das faellt erst live auf.
  const quelle = readFileSync(join(WURZEL, "workers", "maus-engine", "actions", "nav-actions.mjs"), "utf8");
  const neueSeiten = (quelle.match(/newPage\(\)/g) || []).length;
  const wachen = (quelle.match(/bewacheSeite\(ctx\.state/g) || []).length;
  assert.equal(wachen, neueSeiten, `${neueSeiten} Stellen erzeugen eine Seite, aber nur ${wachen} bekommen eine Dialog-Wache`);
});
