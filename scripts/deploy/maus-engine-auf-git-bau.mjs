#!/usr/bin/env node
// smejj.com — Maus-Engine vom eingefrorenen ghcr-Abbild auf Git-Bau umstellen.
//
// WARUM (Blocker 2 aus docs/PLAN_MAUS_BROWSER_LIVE_2026-08-13.md):
// Der Dienst laeuft aus `ghcr.io/smejjcom/smejj-maus-engine:v1`. Aller neue
// Engine-Code — etwa die Sitzungs-Lease vom 31.07. — erreicht die Produktion
// deshalb NICHT, und niemand kann nach ghcr pushen.
//
// WARUM ES JETZT GEHT: Die Behauptung "GitHub-App nie verbunden" war falsch.
// Per API gemessen bauen SECHS Dienste aus repoID 1270642167; nur die
// Portal-Oberflaeche zeigte eine leere Liste.
//
// DIE FALLE, die dieses Skript umgeht: Zeabur ordnet ein Dockerfile ueber
// `Dockerfile.<dienstname>` zu. Der Dienst heisst `ghcriosmejjcomsmejj-maus-
// enginev1`, nicht `smejj-maus-engine`. Ohne Treffer uebernimmt zbpack und
// fuehrt `npm start` aus — das ist in diesem Repo der CONTROL SERVER. Deshalb
// wurde das Dockerfile passend umbenannt (49147d6), NICHT der Dienst: an ihm
// haengen `name`, `dnsName` und die Domain an drei getrennten Feldern.
//
// Aufruf:  CONFIRM_GIT_BAU=JA node scripts/deploy/maus-engine-auf-git-bau.mjs
// Rueckweg: das alte Abbild steht unten im Klartext und ist per Portal oder
// derselben Mutation wieder setzbar.
import { zeaburAbfrage } from "../diagnose/zeabur-api.mjs";
import { findeDienst } from "./zeabur-umgebung-setzen.mjs";

const DIENST = "ghcriosmejjcomsmejj-maus-enginev1";
const REPO_ID = 1270642167;                                  // SmejjCom/smejj.com-app
const BRANCH = "feature/auth-redesign-github-magiclink";     // der Bau-Branch
const ALTES_ABBILD = "ghcr.io/smejjcom/smejj-maus-engine:v1"; // Rueckweg

if (process.env.CONFIRM_GIT_BAU !== "JA") {
  console.error("Abbruch: CONFIRM_GIT_BAU=JA fehlt. Dieser Lauf stellt einen laufenden Dienst um.");
  process.exit(1);
}

const dienst = await findeDienst(DIENST);
console.log(`Dienst gefunden: ${DIENST} (Projekt ${dienst.projektName}/${dienst.umgebungName})`);

const vorher = await zeaburAbfrage(
  `query($s:ObjectID!){ service(_id:$s){ spec { source { image source repoID branch } } } }`,
  { s: dienst.serviceId }
);
console.log("vorher:", JSON.stringify(vorher?.service?.spec?.source));

const ergebnis = await zeaburAbfrage(
  // `{ deploymentID }` ist PFLICHT: deployFromSpecification liefert einen
  // DeploymentResult, kein Skalar. Ohne Feldauswahl antwortet Zeabur mit
  // HTTP 422 — dieselbe Falle wie bei `spec` und `variables`.
  `mutation($s:ObjectID!,$spec:DeploymentSpecification!){ deployFromSpecification(serviceID:$s, specification:$spec){ deploymentID } }`,
  {
    s: dienst.serviceId,
    spec: {
      // preserveExistingEnv ist PFLICHT: der Dienst traegt den Engine-Token und
      // die e2-Zugaenge. Ohne dieses Flag waere die Umstellung ein Datenverlust.
      preserveExistingEnv: true,
      source: { source: "GITHUB", repoID: REPO_ID, branch: BRANCH, rootDirectory: "/" }
    }
  }
);
console.log("Umstellung ausgeloest:", JSON.stringify(ergebnis?.deployFromSpecification ?? ergebnis));

const nachher = await zeaburAbfrage(
  `query($s:ObjectID!){ service(_id:$s){ spec { source { image source repoID branch } } } }`,
  { s: dienst.serviceId }
);
console.log("nachher:", JSON.stringify(nachher?.service?.spec?.source));
console.log(`\nRueckweg, falls der Bau scheitert: Abbild wieder auf ${ALTES_ABBILD} setzen.`);
console.log("Beweis nach dem Bau: /health muss das Feld 'sitzungen' tragen (neuer Code) statt es wegzulassen.");
