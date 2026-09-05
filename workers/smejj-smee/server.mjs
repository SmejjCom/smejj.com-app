// smejj.com — Zeabur-Dienst 'smejj-smee': haelt den Smee-Client am Leben und
// beantwortet /health, damit die Plattform und der Autopilot ihn pruefen koennen.
//
// KEIN systemd: smejj.com hat keinen eigenen Linux-Server. Alles laeuft in
// Zeabur-Containern (gemessen 05.09.: 14 Worker-Dienste, kein VPS). Was die
// uebliche Anleitung mit Restart=on-failure und MemoryMax loest, macht hier die
// Plattform — Neustart bei Absturz, Speichergrenze am Dienst. Ein
// systemd-Service waere hier eine Datei, die nie jemand ausfuehrt.
import http from "node:http";
import { leseKonfig, laufe } from "./relay.mjs";

const konfig = leseKonfig(process.env);
const start = Date.now();
let stand = { verbunden: false, zugestellt: 0, verworfen: 0, letzte: null };

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const gesund = konfig.ok && konfig.an && stand.verbunden;
    res.writeHead(gesund ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: gesund,
      an: konfig.an,
      konfiguriert: konfig.ok,
      fehlend: konfig.fehlend,
      verbunden: stand.verbunden,
      zugestellt: stand.zugestellt,
      verworfen: stand.verworfen,
      letzte: stand.letzte,
      laufzeitSekunden: Math.round((Date.now() - start) / 1000),
      speicherMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(Number(process.env.PORT) || 8080, process.env.SMEJJ_HOST || "0.0.0.0", () => {
  console.log(`[smee] /health auf Port ${server.address().port}`);
  if (!konfig.an) { console.log("[smee] AUS (SMEJJ_SMEE_ENABLED != YES) — es wird nichts weitergeleitet."); return; }
  if (!konfig.ok) { console.log(`[smee] nicht konfiguriert: ${konfig.fehlend.join(", ")}`); return; }
  laufe(konfig, {
    melde: (text) => {
      console.log(text);
      stand.letzte = new Date().toISOString();
      if (text.includes("verbunden mit")) stand.verbunden = true;
      if (text.includes("Verbindung verloren") || text.includes("Strom beendet")) stand.verbunden = false;
      if (text.includes("] zugestellt")) stand.zugestellt += 1;
      if (text.includes("NICHT zugestellt")) stand.verworfen += 1;
    }
  }).catch((f) => console.log(`[smee] beendet: ${String(f?.message || f).slice(0, 120)}`));
});
