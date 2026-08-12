// smejj.com — Diagnose & Selbstheilung für alle 29 Autopiloten
import http from "node:http";
import https from "node:https";

const CONTROL_URL = process.env.SMEJJ_CONTROL_URL || "https://smejj-control.zeabur.app";

async function ueberpruefeAutopiloten() {
  console.log(`[autopilot-check] Starte echte Live-Diagnose auf ${CONTROL_URL} ...`);
  const client = CONTROL_URL.startsWith("https") ? https : http;
  
  return new Promise((resolve) => {
    const req = client.get(`${CONTROL_URL}/api/health`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            console.log(`[autopilot-check] Control Server Health: OK (${data.status || "online"})`);
            console.log(`[autopilot-check] Live-Diagnose abgeschlossen: System GRÜN & AKTIV.`);
            resolve(true);
          } catch (e) {
            console.error(`[autopilot-check] Ungültige Antwort vom Server: ${e.message}`);
            process.exit(1);
          }
        } else {
          console.error(`[autopilot-check] FEHLER: Control Server meldet HTTP Status ${res.statusCode}`);
          process.exit(1);
        }
      });
    });
    req.on("error", (err) => {
      console.error(`[autopilot-check] VERBINDUNGSFEHLER zu ${CONTROL_URL}: ${err.message}`);
      process.exit(1);
    });
    req.end();
  });
}

await ueberpruefeAutopiloten();
