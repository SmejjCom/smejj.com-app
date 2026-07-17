#!/usr/bin/env node
// smejj.com — Control-Release-Artefakt fuer den Maus-Engine-Livegang.
// Duenner Wrapper um den verifizierten Builder
// (scripts/deploy/build_control_release_artifact.mjs): identische Pruef-,
// Secret- und Determinismus-Regeln UND identischer Inhalt.
//
// Historie (wichtig): Diese Datei pflegte frueher eine EIGENE Include-Liste
// (workers/maus-engine, workers/glm-salad/s3.js, schemas), waehrend der
// Basis-Builder Defaults OHNE diese Pfade hatte. Genau diese Doppelung war die
// Ursache des rc1-Crash-Loops am 2026-07-17: Ein Artefakt aus dem Basis-Builder
// war boot-kaputt, der Preflight-Check prueft aber nur gegen EINE Liste.
// Seither gilt: EINE Quelle der Wahrheit in release-include-paths.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildControlReleaseArtifact } from "./build_control_release_artifact.mjs";
import { CONTROL_RELEASE_INCLUDE_PATHS } from "./release-include-paths.mjs";

const INCLUDE_PATHS = CONTROL_RELEASE_INCLUDE_PATHS;

async function main() {
  const releaseId = process.env.SMEJJ_CONTROL_RELEASE_ID || "smejj-control-maus-2026-07-14-rc1";
  const outputArchive = process.argv[2] || `tmp/maus-livegang/${releaseId}.tar.gz`;
  const result = await buildControlReleaseArtifact({
    releaseId,
    createdAt: process.env.SMEJJ_CONTROL_RELEASE_CREATED_AT || "2026-07-14T00:00:00.000Z",
    includePaths: INCLUDE_PATHS,
    outputArchive
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
