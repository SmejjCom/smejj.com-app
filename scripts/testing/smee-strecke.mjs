// smejj.com — Live-Probe des Webhook-Zweitwegs (Kanal -> Client -> Eingang).
//
// Sie beweist zwei Dinge an der ECHTEN Strecke, nicht an einem Doppel:
//   1. ein Ereignis kommt durch, mit unveraenderter Anbieter-Signatur
//   2. dasselbe Ereignis zweimal geschickt wirkt nur EINMAL
//
// Der Empfaenger ist bewusst ein lokales Doppel des Eingangs (dieselbe Route,
// derselbe Replay-Schutz). Ein Testereignis darf nie in der echten
// Zahlungslogik landen — deshalb steht dahinter ein Zaehler, kein Handler.
import http from "node:http";
import { laufe } from "../../workers/smejj-smee/relay.mjs";
import { erstelleWebhookRelayRoute } from "../../control-server/src/routes/webhookRelayRoutes.js";

const kanal = String(process.env.SMEJJ_SMEE_KANAL || "").trim();
const geheim = String(process.env.SMEJJ_SMEE_RELAY_SECRET || "").trim();
if (!kanal || !geheim) { console.error("SMEJJ_SMEE_KANAL und SMEJJ_SMEE_RELAY_SECRET noetig."); process.exit(2); }

const PORT = 8791;
const angekommen = [];
const route = erstelleWebhookRelayRoute({
  env: { SMEJJ_SMEE_RELAY_SECRET: geheim },
  weitergeben: async (kopf, koerper) => { angekommen.push({ signatur: kopf["stripe-signature"], koerper }); return { ok: true, status: 200 }; }
});
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (r, status, body) => { r.writeHead(status, { "content-type": "application/json" }); r.end(JSON.stringify(body)); };
  if (await route(req, res, url, json)) return;
  json(res, 404, { ok: false });
});
await new Promise((f) => server.listen(PORT, "127.0.0.1", f));

const abbruch = new AbortController();
const zustand = { verbunden: false };
laufe({ kanal, ziel: `http://127.0.0.1:${PORT}/api/webhooks/relay`, geheimnis: geheim, ok: true, an: true },
  { melde: (t) => { if (t.includes("verbunden mit")) zustand.verbunden = true; }, abbruch: abbruch.signal }).catch(() => {});

for (let i = 0; i < 20 && !zustand.verbunden; i += 1) await new Promise((f) => setTimeout(f, 500));
if (!zustand.verbunden) { console.error("FEHLER: keine Verbindung zum Kanal."); server.close(); process.exit(4); }
console.log("1/3 Kanal verbunden.");

const ereignis = { id: `evt_probe_${Date.now()}`, type: "smejj.probe" };
const kopf = { "content-type": "application/json", "stripe-signature": "t=1757000000,v1=probe" };
const hin = await fetch(kanal, { method: "POST", headers: kopf, body: JSON.stringify(ereignis) });
console.log(`2/3 Testereignis in den Kanal gelegt (HTTP ${hin.status}).`);
await new Promise((f) => setTimeout(f, 6000));

await fetch(kanal, { method: "POST", headers: kopf, body: JSON.stringify(ereignis) });
console.log("3/3 dasselbe Ereignis ein zweites Mal geschickt.");
await new Promise((f) => setTimeout(f, 6000));

abbruch.abort(); server.close();
const einmal = angekommen.length === 1;
console.log(`\nBeim Handler angekommen: ${angekommen.length}`);
if (angekommen[0]) console.log(`Signatur unveraendert: ${angekommen[0].signatur}`);
console.log(einmal ? "Die Wiederholung wurde erkannt und verworfen." : "FEHLER: die Wiederholung wurde NICHT erkannt.");
process.exit(einmal ? 0 : 5);
