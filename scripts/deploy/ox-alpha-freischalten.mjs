#!/usr/bin/env node
// smejj.com — Ox Alpha am Control-Server freischalten (Betreiber-Auftrag
// 2026-08-26: "ox alpha an 3. Stelle ... Mach Du komplett fertig").
//
// Setzt GENAU EINE Variable: SMEJJ_OX_ALPHA_ENABLED=1 — das Feature-Flag der
// Registry (src/shared/modelRegistry.js, id ox-alpha). KEIN Geheimnis: der
// API-Key (SMEJJ_LLM_OX_ALPHA_API_KEY oder Konto-Fallback
// SMEJJ_LLM_OPENROUTER_API_KEY) wird hier AUSDRUECKLICH NICHT angefasst —
// Schluessel traegt nur der Betreiber selbst ein. Ohne Key bleibt das Modell
// fail-closed (Router faellt ehrlich markiert auf GLM-5.2 zurueck).
//
// Ein Wert je Aufruf (Salad-Lehre 2026-08-14: updateEnvironmentVariable mit
// Map ERSETZT die ganze Umgebung — kommt hier nicht vor; setzeUmgebungswerte
// erzwingt die Einzelform und bricht sonst ab).
//
// Aufruf: CONFIRM_OX_ALPHA=JA node scripts/deploy/ox-alpha-freischalten.mjs
import { setzeUmgebungswerte } from "./zeabur-umgebung-setzen.mjs";

if (process.env.CONFIRM_OX_ALPHA !== "JA") {
  console.error("Abbruch: CONFIRM_OX_ALPHA=JA fehlt — es wird nichts veraendert.");
  process.exit(1);
}

const ergebnis = await setzeUmgebungswerte("smejj-control", { SMEJJ_OX_ALPHA_ENABLED: "1" });
console.log(`SMEJJ_OX_ALPHA_ENABLED=1 gesetzt (${ergebnis?.mutation || "Mutation"}, ${ergebnis?.anzahl ?? 1} Wert).`);
console.log("Wirksam nach dem naechsten Neustart/Neubau des Dienstes smejj-control.");
