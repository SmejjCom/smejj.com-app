// Einmal-Skript 20.09.2026: Chat-Bridge auf Zeabur neu starten, damit sie das
// neue Buendel (assets/chat-bridge.js @ smejj-app-frontend/main) zieht.
// Der Dienst laeuft als PREBUILT_V2 und holt seinen Quelltext beim Start selbst
// per curl — restartService genuegt, redeployService kann er nicht.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { schluesselKandidaten } from "../diagnose/zeabur-schluessel-suchen.mjs";
const API = "https://api.zeabur.com/graphql";
const SERVICE_ID = "6a6680070d0b094201bb9ce4";
const UMGEBUNG_ID = "6a6666895f062718bc7b1ab2";
const GESUNDHEIT = "https://smejj-chat-bridge.zeabur.app/health";
const ERWARTET = "20260920-v159-sprachverlauf";
loadSecureLocalEnv();
if (!process.env.ZEABUR_API_TOKEN) {
  const k = schluesselKandidaten()[0];
  if (k?.wert) process.env.ZEABUR_API_TOKEN = k.wert;
}
if (!process.env.ZEABUR_API_TOKEN) { console.error("ZEABUR_API_TOKEN fehlt — nichts angefasst."); process.exit(1); }
async function graphql(query, variables = {}) {
  const a = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZEABUR_API_TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const d = await a.json();
  if (d.errors) { console.error("Zeabur:", d.errors.map((f) => f.message).join(" | ").slice(0, 300)); process.exit(1); }
  return d.data;
}
const r = await graphql(`mutation($s: ObjectID!, $e: ObjectID!) { restartService(serviceID: $s, environmentID: $e) }`, { s: SERVICE_ID, e: UMGEBUNG_ID });
console.log("Neustart angestossen:", JSON.stringify(r));
for (let i = 1; i <= 30; i += 1) {
  await new Promise((f) => setTimeout(f, 10000));
  const h = await fetch(GESUNDHEIT).then((x) => x.json()).catch(() => null);
  if (h?.version === ERWARTET) { console.log(`LIVE: ${h.version} nach ${i * 10} s`); process.exit(0); }
  console.log(`  noch ${h?.version || "(nicht erreichbar)"} ...`);
}
console.error("Version kam nicht hoch — bitte pruefen.");
process.exit(1);
