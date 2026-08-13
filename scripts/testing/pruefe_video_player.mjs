// Spielt der LIVE ausgelieferte Player ein ECHTES Worker-Video ab?
//
// Getestet wird in einem richtigen Chrome (projekteigener CDP-Client), nicht in
// der Agenten-Browser-Instanz: die dekodiert gar keine Medien (auch kein WAV).
//
// Aufbau wie live: dieselbe CSP (media-src 'self' blob:), die von smejj.com
// geladene chat-markdown.js, und ein MP4 aus der echten Worker-Kette.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

// Ein echtes Worker-MP4 als Beweisstueck: Pfad per SMEJJ_VIDEO_PROBE setzen.
const SCRATCH = process.env.SMEJJ_VIDEO_PROBE_DIR || "/tmp";

// 1) Echten Player-Code und ein echtes Worker-Video besorgen
const player = await (await fetch("https://smejj.com/assets/chat-markdown.js")).text();
const mp4 = await readFile(`${SCRATCH}/end-ok.mp4`);
const wav = await readFile(`${SCRATCH}/mini-ton.wav`).catch(() => null);

const seite = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self' data: blob:; img-src 'self' data:">
<div class="entry assistant"><div id="ziel"></div></div>
<script type="module">
${player.replace(/\0/g, "")}
window.__mess = async () => {
  const v = document.querySelector('video.chat-video');
  if (!v) return { fehler: 'kein video-Element' };
  return { readyState: v.readyState, netz: v.networkState,
    dauer: Number.isFinite(v.duration) ? +v.duration.toFixed(2) : String(v.duration),
    groesse: v.videoWidth + 'x' + v.videoHeight,
    fehlercode: v.error ? v.error.code : null,
    quelle: (v.currentSrc || v.src || '').slice(0, 12),
    stumm: v.muted, schleife: v.loop };
};
window.__start = (b64) => {
  document.getElementById('ziel').textContent =
    'Hier ist dein Video:\\n\\n![Erzähltes Video](data:video/mp4;base64,' + b64 + ')';
  renderChatMarkdown(document.getElementById('ziel'));
};
window.__spielt = async () => {
  const v = document.querySelector('video.chat-video');
  v.muted = true;                       // Autoplay-Sperre umgehen, Ton separat geprueft
  try { await v.play(); } catch(e) { return { gestartet:false, grund:String(e).slice(0,60) }; }
  const t0 = v.currentTime;
  await new Promise(r => setTimeout(r, 1500));
  return { gestartet:true, vonSekunde:+t0.toFixed(2), nachSekunde:+v.currentTime.toFixed(2),
           laeuft: v.currentTime > t0, pausiert: v.paused,
           tonspurVorhanden: (v.mozHasAudio ?? v.webkitAudioDecodedByteCount > 0) || 'unbekannt',
           gepuffert: v.buffered.length ? +v.buffered.end(0).toFixed(2) : 0 };
};
window.__wavProbe = (b64) => new Promise(ok => {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  const a = document.createElement('audio'); a.muted = true;
  a.addEventListener('loadedmetadata', () => ok('KANN MEDIEN (' + a.duration.toFixed(1) + 's)'), {once:true});
  a.addEventListener('error', () => ok('WAV-FEHLER'), {once:true});
  setTimeout(() => ok('WAV HAENGT — Umgebung dekodiert nichts'), 5000);
  a.src = URL.createObjectURL(new Blob([arr], {type:'audio/wav'})); a.load();
});
</script>`;

await writeFile(`${SCRATCH}/probe.html`, seite);

// 2) Kleiner Server, damit 'self' in der CSP echt ist
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(seite);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const chrome = await launchChrome({});
const seiteCdp = await openPage(chrome);
await seiteCdp("Page.enable");
await seiteCdp("Runtime.enable");
await seiteCdp("Page.navigate", { url: `http://127.0.0.1:${port}/` });
await sleep(2500);

const werte = async (ausdruck) => {
  const r = await seiteCdp("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};

// 3) MERKREGEL: erst pruefen, ob dieser Chrome ueberhaupt Medien kann
const wavB64 = wav ? wav.toString("base64") : "";
if (wavB64) console.log("WAV-Vorpruefung:", await werte(`window.__wavProbe(${JSON.stringify(wavB64)})`));

// 4) Echtes Video durch den echten Player schicken
await werte(`window.__start(${JSON.stringify(mp4.toString("base64"))})`);
for (const s of [1, 3, 6, 10]) {
  await sleep(s === 1 ? 1000 : 2000);
  const m = await werte("window.__mess()");
  console.log(`nach ~${s}s:`, JSON.stringify(m));
  if (m && m.readyState >= 1) break;
}

console.log("Abspielprobe:", JSON.stringify(await werte("window.__spielt()")));
await chrome.close();
server.close();
