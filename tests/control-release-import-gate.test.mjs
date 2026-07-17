// smejj.com — Import-Gate des Control-Release-Builders (rc1-Crash-Klasse, 2026-07-17).
// Beweis: Ein Artefakt, dem ein statisch importiertes Modul fehlt, kann gar nicht
// mehr gebaut werden (fail-closed im Builder, nicht nur im Preflight-Check).
// Standalone: node tests/control-release-import-gate.test.mjs
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildControlReleaseArtifact, DEFAULT_INCLUDE_PATHS } from "../scripts/deploy/build_control_release_artifact.mjs";
import {
  CONTROL_RELEASE_INCLUDE_PATHS,
  CONTROL_RELEASE_RUNTIME_RESOURCES,
  isInReleaseIncludePaths
} from "../scripts/deploy/release-include-paths.mjs";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

// --- Fixture: Mini-Projekt mit kaputtem Import bauen -------------------------------
async function makeFixture({ withMissingImport }) {
  const root = await mkdtemp(path.join(tmpdir(), "smejj-import-gate-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "workers/maus-engine"), { recursive: true });
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "fixture", type: "module" })}\n`);
  const importLine = withMissingImport
    ? 'import { x } from "../workers/maus-engine/fehlt.mjs";\n'
    : 'import { x } from "../workers/maus-engine/da.mjs";\n';
  await writeFile(path.join(root, "src/server.js"), `${importLine}console.log(x);\n`);
  await writeFile(path.join(root, "workers/maus-engine/da.mjs"), "export const x = 1;\n");
  return root;
}

// --- Test 1: fehlendes Modul -> Build wirft control_release_import_missing ---------
{
  const root = await makeFixture({ withMissingImport: true });
  let thrown = "";
  try {
    await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-import-gate-negativ",
      includePaths: ["package.json", "src", "workers"],
      outputArchive: path.join(root, "out.tar.gz")
    });
  } catch (error) {
    thrown = String(error && error.message);
  }
  check("1a Negativ: Build bricht ab", thrown.startsWith("control_release_import_missing:"));
  check("1b Negativ: Fehler nennt Verursacher", thrown.includes("src/server.js") && thrown.includes("fehlt.mjs"));
  await rm(root, { recursive: true, force: true });
}

// --- Test 2: gleiches Projekt mit vorhandenem Modul -> Build laeuft durch ----------
{
  const root = await makeFixture({ withMissingImport: false });
  let result = null;
  let thrown = "";
  try {
    result = await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-import-gate-positiv",
      includePaths: ["package.json", "src", "workers"],
      outputArchive: path.join(root, "out.tar.gz")
    });
  } catch (error) {
    thrown = String(error && error.message);
  }
  check("2 Positiv: Build ok", thrown === "" && result && result.ok === true);
  await rm(root, { recursive: true, force: true });
}

// --- Test 3: Import fehlt, weil der Ordner NICHT in includePaths ist ---------------
{
  const root = await makeFixture({ withMissingImport: false });
  let thrown = "";
  try {
    await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-import-gate-include",
      includePaths: ["package.json", "src"], // workers absichtlich weggelassen (rc1-Fall!)
      outputArchive: path.join(root, "out.tar.gz")
    });
  } catch (error) {
    thrown = String(error && error.message);
  }
  check("3 rc1-Fall: fehlender Include-Ordner wird beim Bauen erkannt",
    thrown.startsWith("control_release_import_missing:"));
  await rm(root, { recursive: true, force: true });
}

// --- Test 4: Defaults enthalten workers und schemas --------------------------------
{
  check("4 DEFAULT_INCLUDE_PATHS enthaelt workers + schemas",
    DEFAULT_INCLUDE_PATHS.includes("workers") && DEFAULT_INCLUDE_PATHS.includes("schemas"));
}

// --- Test 5: Laufzeit-Ressourcen-Gate (schemas werden per fs gelesen) -------------
// Baut ein Mini-Projekt, das die Maus-Engine-Module enthaelt, aber die von
// ihnen zur Laufzeit gelesenen Schemas vergisst (= rc2-Fall: bootet, aber der
// erste Maus-Lauf waere mit ENOENT gescheitert).
{
  const root = await mkdtemp(path.join(tmpdir(), "smejj-runtime-res-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "workers/maus-engine"), { recursive: true });
  await mkdir(path.join(root, "schemas"), { recursive: true });
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "fixture", type: "module" })}\n`);
  await writeFile(path.join(root, "src/server.js"), 'import "../workers/maus-engine/plan-validator.mjs";\n');
  await writeFile(path.join(root, "workers/maus-engine/plan-validator.mjs"), "export const validatePlan = () => ({});\n");
  await writeFile(path.join(root, "schemas/maus-action-plan.schema.json"), "{}\n");

  let thrown = "";
  try {
    await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-runtime-res-negativ",
      includePaths: ["package.json", "src", "workers"], // schemas vergessen (rc2-Fall)
      outputArchive: path.join(root, "out.tar.gz")
    });
  } catch (error) {
    thrown = String(error && error.message);
  }
  check("5a rc2-Fall: fehlende Laufzeit-Ressource bricht den Build ab",
    thrown.startsWith("control_release_runtime_resource_missing:"));
  check("5b rc2-Fall: Fehler nennt Datei und Leser",
    thrown.includes("maus-action-plan.schema.json") && thrown.includes("plan-validator.mjs"));

  let ok = false;
  try {
    const result = await buildControlReleaseArtifact({
      rootDir: root,
      releaseId: "smejj-runtime-res-positiv",
      includePaths: ["package.json", "src", "workers", "schemas"],
      outputArchive: path.join(root, "out-ok.tar.gz")
    });
    ok = result.ok === true;
  } catch { ok = false; }
  check("5c mit schemas: Build laeuft durch", ok);

  // Gegenprobe: Ohne den lesenden Modul-Pfad wird die Ressource NICHT verlangt
  // (Teil-Artefakte ohne Maus-Engine bleiben baubar).
  const root2 = await mkdtemp(path.join(tmpdir(), "smejj-runtime-res2-"));
  await mkdir(path.join(root2, "src"), { recursive: true });
  await writeFile(path.join(root2, "package.json"), `${JSON.stringify({ name: "fixture", type: "module" })}\n`);
  await writeFile(path.join(root2, "src/server.js"), "console.log('ok');\n");
  let ok2 = false;
  try {
    const result = await buildControlReleaseArtifact({
      rootDir: root2,
      releaseId: "smejj-runtime-res-neutral",
      includePaths: ["package.json", "src"],
      outputArchive: path.join(root2, "out.tar.gz")
    });
    ok2 = result.ok === true;
  } catch { ok2 = false; }
  check("5d ohne Maus-Engine: Schemas werden nicht verlangt", ok2);

  await rm(root, { recursive: true, force: true });
  await rm(root2, { recursive: true, force: true });
}

// --- Test 6: KEIN Listen-Drift mehr (Ursache des rc1-Crashs) -----------------------
// Alle Builder und Checks muessen die zentrale Liste importieren statt eigene
// Kopien zu pflegen. Das ist die eigentliche Lehre aus dem rc1-Ausfall.
{
  const konsumenten = [
    "scripts/deploy/build_control_release_artifact.mjs",
    "scripts/deploy/build_maus_control_release_artifact.mjs",
    "scripts/deploy/check_release_import_closure.mjs"
  ];
  for (const datei of konsumenten) {
    const quelle = await readFile(new URL(`../${datei}`, import.meta.url), "utf8");
    check(`6 ${datei} importiert die zentrale Liste`,
      quelle.includes('from "./release-include-paths.mjs"'));
  }
  check("6 Basis-Builder exportiert die zentrale Liste als Default",
    DEFAULT_INCLUDE_PATHS === CONTROL_RELEASE_INCLUDE_PATHS);
  check("6 Laufzeit-Ressourcen sind vollstaendig deklariert (resource/whenPresent/reason)",
    CONTROL_RELEASE_RUNTIME_RESOURCES.every((e) => e.resource && e.whenPresent && e.reason));
  check("6 Alle Laufzeit-Ressourcen liegen in den Include-Pfaden",
    CONTROL_RELEASE_RUNTIME_RESOURCES.every((e) => isInReleaseIncludePaths(e.resource)));
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);
