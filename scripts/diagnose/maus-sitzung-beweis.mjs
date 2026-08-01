#!/usr/bin/env node
// smejj.com — Sitzungs-Beweis mit ECHTEM Browser, ohne Control-Server.
//
// Zweck: die Abnahmefrage "laufen zwei Auftraege nacheinander in DERSELBEN
// Sitzung, ohne Neustart?" nicht behaupten, sondern messen. Schwester-Werkzeug
// zu maus-direktlauf.mjs: dort wird der Control-Server aus der Kette genommen,
// hier zusaetzlich das Netz zur Engine — es laeuft alles im eigenen Prozess.
//
// Braucht Playwright. Das Repo ist bewusst abhaengigkeitsfrei (Playwright lebt
// nur im Abbild der Maus-Engine); ist es lokal nicht da, sagt dieses Skript das
// klar und bricht ab, statt einen Beweis vorzutaeuschen. Fuer einen lokalen
// Lauf reicht:
//   npm install playwright --prefix /pfad/ausserhalb/des/repos
//   npx playwright install chromium
//   SMEJJ_PLAYWRIGHT_PFAD=/pfad/ausserhalb/des/repos/node_modules/playwright/index.mjs \
//     node scripts/diagnose/maus-sitzung-beweis.mjs
//
// Es werden KEINE Artefakte hochgeladen (skipUpload) und kein Modell gefragt —
// der Lauf kostet nichts.
import { executeRunInSession } from "../../workers/maus-engine/worker.mjs";
import { createSessionRegistry } from "../../workers/maus-engine/session-registry.mjs";

const ZIEL = process.env.SMEJJ_SITZUNG_ZIEL || "https://smejj.com/";
const HOST = new URL(ZIEL).hostname;

function plan(planId, steps) {
  return {
    schemaVersion: 1,
    planId,
    createdAt: new Date().toISOString(),
    capsuleRef: "maus-sitzung-beweis",
    planner: { modelId: "kein-modell", promptTemplateVersion: "v1" },
    policy: {
      domainAllowlist: [HOST],
      budget: {
        maxActions: 20,
        maxLocalRetries: 1,
        maxPlannerRoundtrips: 0,
        maxDurationMs: 120_000,
        defaultActionTimeoutMs: 30_000
      }
    },
    steps
  };
}

// Auftrag 1 oeffnet den Browser und navigiert.
const AUFTRAG_1 = plan("sitzung-beweis-1", [
  { id: "a1", action: "openBrowser" },
  { id: "a2", action: "navigate", url: ZIEL },
  { id: "a3", action: "screenshot", name: "auftrag-1" }
]);

// Auftrag 2 navigiert BEWUSST NICHT: findet er die Seite vor, ist die Sitzung
// wirklich stehengeblieben. Genau das war vorher unmoeglich (Kaltstart je Lauf).
const AUFTRAG_2 = plan("sitzung-beweis-2", [
  { id: "b1", action: "openBrowser" },
  { id: "b2", action: "assert", condition: "urlMatches", urlPattern: HOST.replace(/\./g, "\\.") },
  { id: "b3", action: "screenshot", name: "auftrag-2" }
]);

// ESM ignoriert NODE_PATH — deshalb ein ausdruecklicher Pfad statt eines
// stillen Fehlschlags. SMEJJ_PLAYWRIGHT_PFAD zeigt auf die installierte
// Playwright-Datei ausserhalb des Repos.
async function ladePlaywright() {
  const pfad = String(process.env.SMEJJ_PLAYWRIGHT_PFAD || "").trim();
  try {
    return pfad ? await import(pfad) : await import("playwright");
  } catch (error) {
    console.error("Playwright ist hier nicht ladbar — dieses Werkzeug misst mit einem echten Browser.");
    console.error(`Grund: ${String(error?.message || error).slice(0, 200)}`);
    console.error("Siehe Kopf dieser Datei; das Repo bleibt bewusst abhaengigkeitsfrei.");
    process.exit(3);
  }
  return null;
}

async function main() {
  const playwright = await ladePlaywright();
  let starts = 0;
  const browserFactory = async ({ viewport } = {}) => {
    starts += 1;
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: viewport || { width: 1365, height: 900 } });
    return { browser, context };
  };

  const registry = createSessionRegistry({ browserFactory, leaseStore: null, holder: "beweis-lokal" });
  const sessionId = "maus-beweis-lokal-1";
  const gemeinsam = { registry, skipUpload: true, sessionId };

  console.log(`Ziel: ${ZIEL}`);
  console.log("--- Auftrag 1 (oeffnen + navigieren) ---");
  const t1 = Date.now();
  const eins = await executeRunInSession(AUFTRAG_1, gemeinsam);
  const d1 = Date.now() - t1;
  console.log(`  ok=${eins.ok} schritte=${eins.actionLog?.length ?? 0} dauer=${(d1 / 1000).toFixed(1)}s`);
  console.log(`  Sitzung offen: ${eins.sitzungOffen}`);
  console.log(`  aktive Seite:  ${eins.sitzung?.aktiveSeite ?? "-"}`);
  if (!eins.ok) {
    console.error("  Abbruch:", eins.abortReason || JSON.stringify(eins.errors));
    await registry.closeAll();
    process.exit(1);
  }

  console.log("--- Auftrag 2 (OHNE navigate — findet er die Seite vor?) ---");
  const t2 = Date.now();
  const zwei = await executeRunInSession(AUFTRAG_2, gemeinsam);
  const d2 = Date.now() - t2;
  console.log(`  ok=${zwei.ok} schritte=${zwei.actionLog?.length ?? 0} dauer=${(d2 / 1000).toFixed(1)}s`);
  console.log(`  neue Sitzung:  ${zwei.sitzungNeu}`);
  console.log(`  aktive Seite:  ${zwei.sitzung?.aktiveSeite ?? "-"}`);
  const wiederverwendet = zwei.actionLog?.find((e) => e.action === "openBrowser")?.result?.wiederverwendet === true;
  console.log(`  Browser wiederverwendet: ${wiederverwendet}`);

  await registry.closeAll();

  const bestanden = eins.ok && zwei.ok && starts === 1 && zwei.sitzungNeu === false && wiederverwendet
    && eins.sitzung?.aktiveSeite === zwei.sitzung?.aktiveSeite;

  console.log("--- Messung ---");
  console.log(`  Browserstarts fuer zwei Auftraege: ${starts} (erwartet 1)`);
  console.log(`  Kaltstart-Ersparnis Auftrag 2:     ${(d1 - d2) / 1000 > 0 ? `${((d1 - d2) / 1000).toFixed(1)}s schneller` : "kein Vorteil gemessen"}`);
  console.log(bestanden ? "ERGEBNIS: BESTANDEN — zwei Auftraege, eine Sitzung, Seite stand still." : "ERGEBNIS: NICHT BESTANDEN.");
  process.exit(bestanden ? 0 : 1);
}

main().catch((error) => {
  console.error("Fehler:", error?.message || error);
  process.exit(2);
});
