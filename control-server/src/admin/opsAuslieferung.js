// smejj.com — Modul AL: "Was ist wirklich live?"
//
// Nicht "was wurde gepusht", sondern: welche Fassung antwortet gerade. Jede
// Zeile stellt den LIVE-Stand (vom Dienst selbst gemeldet) neben den
// BAU-Stand (was im Repo bzw. im letzten Bau liegt). Drei Lehren aus der
// eigenen Geschichte stehen dahinter (Design-Vorschlag "Adminbereich", 2026-08-23):
//   - Push ≠ gebaut:      ein Push baut nicht automatisch (Zeabur, 2026-08-13).
//   - Neustart ≠ Umgebung: restartService behaelt die alte Umgebung (2026-08-17).
//   - Artefakt ≠ Quelle:   ein fertiges Design verschwand, weil es nur im Buendel lag.
//
// Ehrlichkeitsregeln:
//   - Was der Server nicht selbst messen kann, steht als "nicht messbar" da —
//     nie als gruen. Tests laufen hier nicht (kein npm im Abbild), ein
//     Screenshot-Vergleich existiert noch nicht.
//   - Der eigene Commit ist dem Control-Server nur bekannt, wenn die Umgebung
//     ihn traegt (ZEABUR_GIT_COMMIT_SHA). Sonst wird aus Startzeit und Bau-
//     Abschluss geschlossen — und das steht als "abgeleitet" dabei.
//   - GitHub wird unangemeldet gefragt (60 Abrufe/Stunde) und 2 Minuten
//     zwischengespeichert; ein Rate-Limit ist eine Messluecke, kein Ausfall.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ZEIT_MS = 8_000;
const CACHE_MS = 2 * 60 * 1000;
const FRONTEND_REPO = "SmejjCom/smejj-app-frontend";
const APP_REPO = "SmejjCom/smejj.com-app";
const BAU_BRANCH = "feature/auth-redesign-github-magiclink";

const cache = new Map(); // url -> { am, wert }

async function hole(fetchImpl, url, { json = false, jetztMs = Date.now() } = {}) {
  const alt = cache.get(url);
  if (alt && jetztMs - alt.am < CACHE_MS) return alt.wert;
  let wert;
  try {
    const antwort = await fetchImpl(url, {
      signal: AbortSignal.timeout(ZEIT_MS),
      headers: { "User-Agent": "smejj.com-control/auslieferung", Accept: json ? "application/json" : "*/*" }
    });
    const text = await antwort.text();
    wert = { status: antwort.status, text, json: json ? sicherJson(text) : null, ms: null };
  } catch (fehler) {
    wert = { status: 0, text: "", json: null, fehler: String(fehler?.message || fehler).slice(0, 80) };
  }
  cache.set(url, { am: jetztMs, wert });
  return wert;
}

function sicherJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function cacheName(swQuelltext) {
  const m = /const CACHE_NAME\s*=\s*["']([^"']+)["']/.exec(swQuelltext || "");
  return m ? m[1] : null;
}

function bridgeVersion(quelltext) {
  const m = /BRIDGE_VERSION\s*=\s*["']([^"']+)["']/.exec(quelltext || "");
  return m ? m[1] : null;
}

function kurz(sha) {
  return sha ? String(sha).slice(0, 8) : null;
}

// ---- Dienste ---------------------------------------------------------------

async function frontend(fetchImpl, jetztMs) {
  const [live, bau, commit] = await Promise.all([
    hole(fetchImpl, "https://smejj.com/sw.js", { jetztMs }),
    hole(fetchImpl, `https://raw.githubusercontent.com/${FRONTEND_REPO}/main/sw.js`, { jetztMs }),
    hole(fetchImpl, `https://api.github.com/repos/${FRONTEND_REPO}/commits/main`, { json: true, jetztMs })
  ]);
  const liveStand = live.status === 200 ? cacheName(live.text) : null;
  const bauStand = bau.status === 200 ? cacheName(bau.text) : null;
  let zustand, satz;
  if (!liveStand) { zustand = "unbekannt"; satz = "smejj.com/sw.js nicht lesbar — Live-Stand unbekannt."; }
  else if (!bauStand) { zustand = "unbekannt"; satz = "Repo-Stand nicht lesbar (raw.githubusercontent) — kein Vergleich."; }
  else if (liveStand === bauStand) { zustand = "gleich"; satz = "Der Rand liefert genau den Stand von main."; }
  else { zustand = "dahinter"; satz = "main traegt " + bauStand + ", der Rand liefert noch " + liveStand + " — GitHub Pages baut, oder der Rand-Cache (max-age 600) haelt noch."; }
  return {
    id: "frontend", name: "smejj.com", bautAus: "GitHub Pages · main",
    liveStand, bauStand, zustand, satz,
    commitBau: kurz(commit.json?.sha), antwortMs: null
  };
}

async function control(fetchImpl, jetztMs, env, startzeitMs) {
  const [commits, health] = await Promise.all([
    hole(fetchImpl, `https://api.github.com/repos/${APP_REPO}/commits/${encodeURIComponent(BAU_BRANCH)}`, { json: true, jetztMs }),
    hole(fetchImpl, "https://smejj-control.zeabur.app/api/health", { json: true, jetztMs })
  ]);
  const bauSha = commits.json?.sha || null;
  let lauf = null;
  if (bauSha) {
    const runs = await hole(fetchImpl, `https://api.github.com/repos/${APP_REPO}/commits/${bauSha}/check-runs`, { json: true, jetztMs });
    lauf = (runs.json?.check_runs || []).find((r) => /zeabur/i.test(r.name)) || null;
  }
  const eigenerCommit = env.ZEABUR_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || env.SOURCE_COMMIT || null;
  const gestartetAm = health.json?.gestartetAm || (Number.isFinite(startzeitMs) ? new Date(startzeitMs).toISOString() : null);
  let zustand, satz, liveStand;
  if (eigenerCommit) {
    liveStand = kurz(eigenerCommit);
    if (!bauSha) { zustand = "unbekannt"; satz = "Bau-Branch bei GitHub nicht lesbar."; }
    else if (bauSha.startsWith(eigenerCommit) || eigenerCommit.startsWith(bauSha.slice(0, 8))) { zustand = "gleich"; satz = "Der laufende Prozess ist aus dem juengsten Commit des Bau-Branch gebaut."; }
    else { zustand = "dahinter"; satz = "Der Bau-Branch ist weiter als der laufende Prozess — Push ≠ gebaut."; }
  } else {
    // Abgeleitet: kein Commit in der Umgebung. Startzeit gegen Bau-Abschluss.
    liveStand = gestartetAm ? "gestartet " + gestartetAm.slice(0, 16).replace("T", " ") + "Z" : null;
    if (!bauSha || !lauf) { zustand = "unbekannt"; satz = "Kein Bau-Lauf bei GitHub lesbar (Rate-Limit oder kein check-run) — nichts behauptet."; }
    else if (lauf.status !== "completed") { zustand = "bau-laeuft"; satz = "Zeabur baut gerade den juengsten Commit (" + kurz(bauSha) + ") — der laufende Prozess ist noch der vorige."; }
    else if (lauf.conclusion !== "success") { zustand = "dahinter"; satz = "Der letzte Bau (" + kurz(bauSha) + ") endete mit »" + lauf.conclusion + "« — live laeuft ein aelterer Stand."; }
    else if (gestartetAm && Date.parse(gestartetAm) >= Date.parse(lauf.completed_at)) { zustand = "gleich"; satz = "Abgeleitet: der Prozess startete NACH dem Abschluss des letzten erfolgreichen Baus (" + kurz(bauSha) + ") — der eigene Commit steht nicht in der Umgebung."; }
    else { zustand = "dahinter"; satz = "Der letzte Bau (" + kurz(bauSha) + ") ist fertig, der Prozess ist aber aelter — Neustart steht aus (Neustart ≠ neue Umgebung)."; }
  }
  return {
    id: "control", name: "smejj-control", bautAus: "Zeabur · " + BAU_BRANCH,
    liveStand, bauStand: kurz(bauSha), zustand, satz,
    bauLauf: lauf ? { status: lauf.status, ergebnis: lauf.conclusion, fertigAm: lauf.completed_at } : null,
    gestartetAm, abgeleitet: !eigenerCommit
  };
}

async function bruecke(fetchImpl, jetztMs) {
  const [live, bau] = await Promise.all([
    hole(fetchImpl, "https://smejj-chat-bridge.zeabur.app/health", { json: true, jetztMs }),
    hole(fetchImpl, `https://raw.githubusercontent.com/${FRONTEND_REPO}/main/assets/chat-bridge.js`, { jetztMs })
  ]);
  const liveStand = live.json?.version || null;
  const bauStand = bau.status === 200 ? bridgeVersion(bau.text) : null;
  let zustand, satz;
  if (!liveStand) { zustand = "nicht-erreichbar"; satz = "Die Bruecke antwortet nicht auf /health."; }
  else if (!bauStand) { zustand = "unbekannt"; satz = "Buendel im Repo nicht lesbar — kein Vergleich."; }
  else if (liveStand === bauStand) { zustand = "gleich"; satz = "Die Bruecke laeuft das Buendel, das in assets/chat-bridge.js liegt."; }
  else { zustand = "dahinter"; satz = "Im Repo liegt " + bauStand + ", die Bruecke laeuft " + liveStand + " — sie holt ihr Buendel erst beim Neustart."; }
  return { id: "bruecke", name: "smejj-chat-bridge", bautAus: "Zeabur · holt assets/chat-bridge.js beim Start", liveStand, bauStand, zustand, satz };
}

async function einfacherDienst(fetchImpl, jetztMs, { id, name, bautAus, url, versionAus }) {
  const a = await hole(fetchImpl, url, { json: true, jetztMs });
  if (a.status === 0) return { id, name, bautAus, liveStand: null, bauStand: null, zustand: "nicht-erreichbar", satz: "Nicht erreichbar: " + (a.fehler || "keine Antwort") + "." };
  if (a.status === 404) return { id, name, bautAus, liveStand: "antwortet (404)", bauStand: null, zustand: "erreichbar", satz: "Der Dienst antwortet, hat aber keinen Gesundheitspfad — Version nicht messbar." };
  if (a.status !== 200) return { id, name, bautAus, liveStand: "HTTP " + a.status, bauStand: null, zustand: "nicht-erreichbar", satz: "Antwortet mit HTTP " + a.status + "." };
  const version = versionAus ? versionAus(a.json) : null;
  return { id, name, bautAus, liveStand: version || "antwortet", bauStand: null, zustand: "erreichbar", satz: version ? "Meldet Version " + version + "; kein Bau-Stand zum Vergleich hinterlegt." : "Antwortet gesund; Version nicht gemeldet." };
}

// ---- Sperren im gebauten Abbild --------------------------------------------

function sha256Datei(pfad) {
  return createHash("sha256").update(readFileSync(pfad)).digest("hex");
}

export function sperrenImAbbild({ wurzel = process.cwd() } = {}) {
  const manifeste = [
    { name: "Admin-Lock", pfad: "docs/security/admin-lock-manifest.json" },
    { name: "Sicherheits-Lock", pfad: "docs/security/security-lock-manifest.json" },
    { name: "Start-Lock", pfad: "docs/frontend/start-lock-manifest.json" },
    { name: "Favicon-Lock", pfad: "docs/frontend/favicon-lock-manifest.json" }
  ];
  return manifeste.map((m) => {
    const voll = path.join(wurzel, m.pfad);
    if (!existsSync(voll)) return { name: m.name, zustand: "fehlt", satz: "Manifest nicht im Abbild.", dateien: 0, abweichend: [], fehlend: [] };
    let manifest;
    try { manifest = JSON.parse(readFileSync(voll, "utf8")); } catch { return { name: m.name, zustand: "fehlt", satz: "Manifest nicht lesbar.", dateien: 0, abweichend: [], fehlend: [] }; }
    const dateien = manifest.files || {};
    const abweichend = [], fehlend = [];
    for (const [rel, soll] of Object.entries(dateien)) {
      const p = path.join(wurzel, rel);
      if (!existsSync(p)) { fehlend.push(rel); continue; }
      if (sha256Datei(p) !== soll) abweichend.push(rel);
    }
    const zustand = abweichend.length ? "veraendert" : (fehlend.length === Object.keys(dateien).length ? "nicht-im-abbild" : "stimmt");
    const satz = abweichend.length
      ? abweichend.length + " Datei(en) weichen vom eingefrorenen Stand ab — erst ansehen, dann neu einfrieren. Nie umgekehrt."
      : (zustand === "nicht-im-abbild" ? "Keine der Dateien liegt im Abbild — nur lokal pruefbar." : "Alle " + (Object.keys(dateien).length - fehlend.length) + " Dateien byte-identisch" + (fehlend.length ? " (" + fehlend.length + " nicht im Abbild)" : "") + ".");
    return { name: m.name, zustand, satz, dateien: Object.keys(dateien).length, eingefrorenAm: manifest.frozenAt || null, abweichend, fehlend };
  });
}

// ---- Einstieg ----------------------------------------------------------------

export async function auslieferungUebersicht({ env = process.env, startzeitMs = null, fetchImpl = fetch, jetztMs = Date.now(), wurzel = process.cwd() } = {}) {
  const dienste = await Promise.all([
    frontend(fetchImpl, jetztMs),
    control(fetchImpl, jetztMs, env, startzeitMs),
    bruecke(fetchImpl, jetztMs),
    einfacherDienst(fetchImpl, jetztMs, { id: "waechter", name: "smejj-brueckenwaechter", bautAus: "Zeabur · eigener Dienst", url: "https://smejj-brueckenwaechter.zeabur.app/health", versionAus: (j) => j?.version || null }),
    einfacherDienst(fetchImpl, jetztMs, { id: "maus", name: "smejj-maus-engine", bautAus: "Zeabur · Dockerfile im Repo", url: "https://smejj-maus-engine.zeabur.app/health", versionAus: (j) => j?.engine ? "antwortet" : null }),
    einfacherDienst(fetchImpl, jetztMs, { id: "video", name: "smejj-video-worker", bautAus: "Zeabur · deploy/smejj-video", url: "https://smejj-video-worker.zeabur.app/health" }),
    einfacherDienst(fetchImpl, jetztMs, { id: "bild", name: "smejj-bild-maler", bautAus: "Zeabur · eigener Branch", url: "https://smejj-bild-maler.zeabur.app/health" })
  ]);
  const sperren = sperrenImAbbild({ wurzel });
  const zaehle = (z) => dienste.filter((d) => d.zustand === z).length;
  return {
    ok: true,
    gemessenAm: new Date(jetztMs).toISOString(),
    dienste,
    gleich: zaehle("gleich"),
    dahinter: zaehle("dahinter") + zaehle("bau-laeuft"),
    nichtErreichbar: zaehle("nicht-erreichbar"),
    sperren,
    sperrenVeraendert: sperren.filter((s) => s.zustand === "veraendert").length,
    // Was der Server NICHT messen kann, steht hier ehrlich — nie als gruen.
    nichtMessbar: [
      { name: "Alle Tests gruen", satz: "Laufen nur lokal (npm test / npm run check:all) — im Abbild gibt es kein npm. Ein Deploy ohne lokalen Lauf ist ungeprueft." },
      { name: "Erreichbares CVE-Risiko", satz: "npm run check:cve misst lokal gegen den Lockfile; der Server hat den Pruefer nicht." },
      { name: "Screenshot-Vergleich", satz: "Gibt es noch nicht. Er haette das verschwundene Glas-Design gefangen — offener Vorschlag." }
    ],
    lehren: [
      { titel: "Push ≠ gebaut", satz: "Ein Push auf den Bau-Branch loest nicht immer einen Bau aus (2026-08-13: drei Pushes, kein Bau). Hier steht, was der Dienst selbst meldet, nicht was im Repo steht." },
      { titel: "Neustart ≠ neue Umgebung", satz: "restartService behaelt die alte Umgebung. Nur ein Neu-Ausrollen zieht geaenderte Variablen (2026-08-17)." },
      { titel: "Artefakt ≠ Quelle", satz: "Drei CSS-Dateien verschwanden, weil sie nur im Buendel lagen. Deshalb steht die Bruecke mit Buendel-Version gegen Repo-Version hier." }
    ]
  };
}

export function _cacheLeeren() {
  cache.clear();
}
