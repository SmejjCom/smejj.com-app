// smejj.com — Betreiber-Werkzeug fuer das Versionsregister (Alias "smejj").
//
// Der Autopilot Nr. 83 entscheidet und haengt um; dieses Werkzeug zeigt den
// Stand und bietet den HAND-Rueckweg (Rote Liste: ein Mensch dreht zurueck,
// wenn Nutzer sich beschweren, bevor eine Ampel es merkt). Es schreibt das
// Register direkt nach e2; der Takt liest es im naechsten Durchgang und gibt
// es dem Router.
//
// Aufruf:
//   node scripts/training/smejj-alias.mjs --stand
//   node scripts/training/smejj-alias.mjs --zurueck "Grund"    (vorige Version wieder stable)
//   node scripts/training/smejj-alias.mjs --live aus "Grund"   (Alias sofort auf Standardmodell)
//   node scripts/training/smejj-alias.mjs --live an "Grund"    (nur wenn die Note die Referenz traegt)
import { leseKonfig } from "../../workers/con-autopilot/config.js";
import { e2KonfigAusEnv, e2Client } from "../../workers/con-autopilot/e2.js";
import { ladeEnvLocal } from "./smejj-1-1-messen.mjs";
import { leeresRegister, liveTauglich, rolleZurueck, schalteLive, stableEintrag } from "../../src/shared/smejjVersionen.js";
import { SMEJJ_VERSIONEN_ABLAGE, REGISTER_ID } from "../../control-server/src/llm/smejjAlias.js";

const SCHLUESSEL = `${SMEJJ_VERSIONEN_ABLAGE}/${REGISTER_ID}.json`;

function zeige(register) {
  const s = stableEintrag(register);
  console.log(`Alias ${register.alias}: stable ${register.stable || "keine"}${s ? ` (${(s.note * 100).toFixed(1)} %, ${s.kritisch} kritisch, Job ${s.jobId})` : ""}`);
  console.log(`Live: ${register.live ? "AN" : "AUS"} — ${register.liveGrund}`);
  console.log(`Referenz: ${register.referenzNote ?? "?"} %`);
  for (const v of register.versionen || []) console.log(`  ${v.version.padEnd(12)} ${v.status.padEnd(14)} ${v.note != null ? (v.note * 100).toFixed(1) + " %" : "?"}${v.gruende ? "  " + v.gruende.join(", ") : ""}`);
  for (const e of (register.verlauf || []).slice(0, 5)) console.log(`  ${e.zeit}  ${e.art}  ${e.von || ""} → ${e.nach || ""}${e.grund ? "  " + e.grund : ""}`);
}

async function main() {
  await ladeEnvLocal();
  leseKonfig(process.env);
  const e2k = e2KonfigAusEnv(process.env);
  if (!e2k.ok) { console.error("ABBRUCH: e2 nicht konfiguriert —", e2k.fehlend.join(", ")); process.exit(2); }
  const e2 = e2Client(e2k, { timeoutMs: 60_000 });
  const argv = process.argv.slice(2);
  const register = (await e2.getJson(SCHLUESSEL, null)) || leeresRegister();
  zeige(register);
  const i = argv.indexOf("--zurueck");
  const l = argv.indexOf("--live");
  if (i >= 0) {
    const grund = argv[i + 1] || "Betreiber-Rueckweg";
    const r = rolleZurueck(register, grund);
    if (!r.zurueckgerollt) { console.error("ABBRUCH:", r.grund); process.exit(3); }
    await e2.putJson(SCHLUESSEL, r.register);
    console.log(`\nZurueckgerollt: ${register.stable} → ${r.register.stable || "keine"} (${grund}). Der Takt uebernimmt es im naechsten Durchgang.`);
  } else if (l >= 0) {
    const an = argv[l + 1] === "an";
    const grund = argv[l + 2] || (an ? "Betreiber schaltet live" : "Betreiber schaltet ab");
    if (an) {
      const s = stableEintrag(register);
      const lt = liveTauglich({ note: s?.note, referenzNote: s?.referenzNote ?? register.referenzNote });
      if (!lt.tauglich) { console.error("ABBRUCH: nicht live-tauglich —", lt.grund); process.exit(4); }
    }
    await e2.putJson(SCHLUESSEL, schalteLive(register, an, grund));
    console.log(`\nLive ${an ? "AN" : "AUS"} (${grund}). Der Takt uebernimmt es im naechsten Durchgang.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}
