#!/usr/bin/env node
// smejj.com — den Fern-Browser-Dienst (smejj-remote-browser) aus Git neu bauen.
//
// WARUM ES DIESE DATEI GIBT: Der Dienst laeuft als vorgebautes Abbild, und
// build_and_push_remote_browser_image.sh verlangt ein `docker login ghcr.io`
// — Zugangsdaten, die hier niemand eingeben darf ([[smejj-maus-engine-deploy-blockiert]]).
// Zeabur kann den Dienst aber wie smejj-control DIREKT aus GitHub bauen; dafuer
// liegt Dockerfile.smejj-remote-browser im Repo-Wurzelverzeichnis. Damit
// entfaellt die Registry vollstaendig.
//
// Aufruf:
//   CONFIRM_BROWSER_BAU=JA node scripts/deploy/remote-browser-neu-bauen.mjs [branch]
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";

const SERVICE_ID = "6a7e53af2b4272705cd18e54";
const ENVIRONMENT_ID = "6a6666895f062718bc7b1ab2";
const REPO_ID = 1270642167; // SmejjCom/smejj.com-app
// Derselbe Bau-Branch wie der Control-Server — NICHT main.
const STANDARD_BRANCH = "feature/auth-redesign-github-magiclink";

export async function baueNeu(branch = STANDARD_BRANCH, abfrage = zeaburAbfrage) {
  const ergebnis = await abfrage(
    "mutation($s:ObjectID!,$e:ObjectID,$g:GitRef){ deploy(serviceID:$s, environmentID:$e, gitRef:$g) }",
    { s: SERVICE_ID, e: ENVIRONMENT_ID, g: { repoID: REPO_ID, ref: branch } }
  );
  return { ok: ergebnis?.deploy === true, branch };
}

/** Letzter Bau-Zustand — der Beweis, dass wirklich neu gebaut wurde. */
export async function letzterBau(abfrage = zeaburAbfrage) {
  const r = await abfrage(
    "query($s:ObjectID!,$e:ObjectID!){ deployments(serviceID:$s, environmentID:$e){ edges { node { status createdAt } } } }",
    { s: SERVICE_ID, e: ENVIRONMENT_ID }
  );
  return (r?.deployments?.edges || [])[0]?.node || null;
}

if (process.argv[1] && process.argv[1].endsWith("remote-browser-neu-bauen.mjs")) {
  if (process.env.CONFIRM_BROWSER_BAU !== "JA") {
    console.error("Abbruch: CONFIRM_BROWSER_BAU=JA fehlt. Dieser Lauf baut den Fern-Browser neu.");
    process.exit(1);
  }
  const vorher = await letzterBau();
  console.log(`Vorher: ${vorher?.status || "(unbekannt)"} ${vorher?.createdAt || ""}`);
  const ergebnis = await baueNeu(process.argv[2] || STANDARD_BRANCH);
  if (!ergebnis.ok) {
    console.error("Abbruch: Zeabur hat den Bau nicht bestaetigt.");
    process.exit(1);
  }
  console.log(`Bau angestossen aus ${ergebnis.branch}.`);
  console.log("Playwright-Images sind gross — der Bau dauert mehrere Minuten.");
  console.log("Fertig, wenn letzterBau() RUNNING mit NEUEM createdAt zeigt.");
}
