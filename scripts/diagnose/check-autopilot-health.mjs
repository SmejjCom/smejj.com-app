#!/usr/bin/env node
// smejj.com — ECHTE Autopiloten-Diagnose gegen die Live-Ampel.
//
// WARUM NEU (2026-08-12): Die Vorgängerversion dieses Skripts druckte für
// alle 31 Autopiloten "🟢 Aktiv & verifiziert" — OHNE eine einzige Anfrage.
// Ein Diagnose-Skript, das nichts misst, ist gefährlicher als keines: es
// beendet jede Fehlersuche mit einem falschen "alles grün".
//
// Dieses Skript fragt die echte Ampel des Control-Servers ab
// (GET /api/admin/ops/autopiloten) und gibt wieder, was der Server MISST.
// Es braucht einen Anmelde-Nachweis; der bewährte Weg ist das Mint-Skript:
//
//   SMEJJ_EVAL_SESSION_TOKEN=$(node scripts/verlauf/mint-eval-token.mjs) \
//     node scripts/diagnose/check-autopilot-health.mjs
//
// Exit 0 = keine rote Ampel. Exit 1 = mindestens ein Autopilot rot oder
// die Abfrage selbst scheiterte (fail-closed, nie "grün aus Höflichkeit").
const CONTROL_URL = process.env.SMEJJ_CONTROL_URL || "https://smejj-control.zeabur.app";
const TOKEN = process.env.SMEJJ_EVAL_SESSION_TOKEN || "";

if (!TOKEN) {
  console.error("SMEJJ_EVAL_SESSION_TOKEN fehlt — ohne Nachweis keine Diagnose (siehe Kopfkommentar).");
  process.exit(1);
}

const AMPEL_ZEICHEN = { gruen: "🟢", gelb: "🟡", rot: "🔴", grau: "⚪", wartung: "🔧" };

try {
  const antwort = await fetch(`${CONTROL_URL}/api/admin/ops/autopiloten`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!antwort.ok) {
    console.error(`Ampel-Abfrage fehlgeschlagen: HTTP ${antwort.status} — Diagnose NICHT möglich.`);
    process.exit(1);
  }
  const daten = await antwort.json();
  console.log(`[autopilot-check] Live-Ampel von ${CONTROL_URL}:`);
  for (const a of daten.autopiloten || []) {
    const zeichen = AMPEL_ZEICHEN[a.ampel] || "?";
    const letzter = a.letzterLauf ? `${a.letzterLauf.am} — ${a.letzterLauf.meldung || ""}` : "nie gemeldet";
    console.log(` ${zeichen} ${a.id}: ${a.ampelGrund} (${letzter})`.slice(0, 160));
  }
  console.log(`[autopilot-check] Summe: ${daten.gruen} grün, ${daten.gelb} gelb, ${daten.rot} rot, ${daten.grau} grau (geplant/ohne Messung), ${daten.wartung} Wartung — ${daten.total} gesamt.`);
  process.exit(daten.rot > 0 ? 1 : 0);
} catch (fehler) {
  console.error(`Ampel-Abfrage fehlgeschlagen (${fehler.name}) — Diagnose NICHT möglich.`);
  process.exit(1);
}
