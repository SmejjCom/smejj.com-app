// smejj.com — minimaler Chrome-DevTools-Protokoll-Client (ohne Abhaengigkeiten).
//
// Warum selbst gebaut: Die Messpflicht (LCP, INP, CLS, TTFB) braucht einen echten
// Browser. Puppeteer/Playwright wuerden ein eigenes Chromium (~150 MB) in
// node_modules laden — das verstoesst gegen "jede neue Abhaengigkeit muss ihr
// Gewicht rechtfertigen" und blaeht den Google-Drive-Ordner auf. Chrome ist auf
// dem Rechner bereits installiert; Node 22+ bringt WebSocket mit. Damit reichen
// rund 120 Zeilen und null Pakete.
//
// Zweck: Chrome headless starten, eine Seite oeffnen, JavaScript auswerten.
// Kein Zustand bleibt zurueck — das Profil liegt in einem Temp-Ordner.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];

/** Startet Chrome headless und liefert einen verbundenen Client. */
export async function launchChrome({ chromePath = "", timeoutMs = 20000 } = {}) {
  const binary = chromePath || (await firstExistingChrome());
  if (!binary) throw new Error("Kein Chrome gefunden — Pfad per CHROME_PATH setzen.");
  const profile = await mkdtemp(join(tmpdir(), "smejj-vitals-"));
  const chrome = spawn(binary, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    "--window-size=1280,900",
    "about:blank"
  ], { stdio: ["ignore", "ignore", "ignore"] });

  const port = await waitForPort(profile, timeoutMs);
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const socket = await openSocket(version.webSocketDebuggerUrl);

  return {
    profile,
    send: socket.send,
    close: async () => {
      socket.close();
      chrome.kill();
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/** Oeffnet eine neue Seite und liefert eine an sie gebundene send-Funktion. */
export async function openPage(client) {
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  return (method, params = {}) => client.send(method, params, sessionId);
}

async function firstExistingChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const path of CHROME_PATHS) {
    try {
      await readFile(path);
      return path;
    } catch {
      // Datei nicht lesbar (Binaerdatei ist gross, aber readFile bestaetigt Existenz).
    }
  }
  return "";
}

async function waitForPort(profile, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      const port = Number(raw.split("\n")[0]);
      if (port > 0) return port;
    } catch {
      // Chrome schreibt die Datei erst nach dem Start.
    }
    await sleep(120);
  }
  throw new Error("Chrome hat den Debug-Port nicht geoeffnet.");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DevTools-Endpunkt antwortete ${response.status}`);
  return response.json();
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("DevTools-Verbindung fehlgeschlagen.")));
    socket.addEventListener("open", () => resolve({
      send: (method, params = {}, sessionId) => new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej, method });
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      }),
      close: () => socket.close()
    }));
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
