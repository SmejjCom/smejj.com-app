#!/usr/bin/env node
// smejj.com — prueft die KANTEN der Infrastruktur, nicht die Knoten.
//
// WARUM ES DAS GIBT (2026-09-08): Der Betreiber fragte, ob alle Dienste
// untereinander verbunden sind. Die Antwort brauchte sechs Einzelbefehle
// (dig, curl je Dienst, gh run list, git rev-list) und zwanzig Minuten — und
// dabei kam heraus, dass der Codeberg-Spiegel seit dem 05.09. JEDEN TAG rot
// lief: Secret CODEBERG_TOKEN fehlte, "es wurde NICHTS gesichert". Drei Tage
// ohne Backup, und niemand hat es gesehen, weil ein fehlgeschlagener
// Cron-Lauf still bleibt.
//
// Genau das ist der Zweck hier: die Architektur besteht aus VERBINDUNGEN
// (Spaceship→Pages, Spaceship→Zeabur, GitHub→Codeberg, Zeabur→IDrive e2), und
// eine gerissene Verbindung faellt nur auf, wenn jemand sie misst. Ein Knoten
// meldet seinen eigenen Ausfall nie.
//
// Der Lauf braucht KEIN Geheimnis: DNS ist oeffentlich, die Health-Wege
// antworten ohne Anmeldung, und der Spiegel-Rueckstand steht in der lokalen
// Git-Ablage. Er kostet nichts und darf deshalb so oft laufen wie gewuenscht.
//
// Aufruf:  node scripts/diagnose/kette-pruefen.mjs
// Rueckgabe: Code 1, sobald EINE Verbindung gerissen ist.

import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// GitHub-Pages-Adressen. Weichen die A-Records ab, zeigt smejj.com nicht mehr
// auf die statische Seite — der Static-First-Pfad waere damit gekappt.
const PAGES_IPS = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];

// Der Zweig, aus dem Zeabur baut — im Klon-Modus die Quelle fuer Dateifragen.
const DEPLOY_ZWEIG = "feature/auth-redesign-github-magiclink";

// Budget aus der Kostenregel: TTFB p95 < 200 ms. Ein einzelner Aufruf von
// einem Wohnanschluss aus misst das nicht sauber, deshalb ist die Grenze hier
// grosszuegig — sie soll einen ECHTEN Einbruch fangen, nicht Messrauschen.
// (Lehre "Frist am guten Fall bemessen": zu knapp gesetzte Grenzen erzeugen
// Fehlalarme, und Fehlalarme werden nach dem dritten Mal ignoriert.)
const LADEZEIT_GRENZE_MS = 3000;

const ZEABUR_DIENSTE = [
  ["Zeabur Control-Server", "https://smejj-control.zeabur.app/api/health"],
  ["Zeabur Chat-Bruecke", "https://smejj-chat-bridge.zeabur.app/health"],
  ["Zeabur Maus-Engine", "https://smejj-maus-engine.zeabur.app/health"],
  ["Zeabur Hausmodell", "https://smejj-hausmodell.zeabur.app/health"]
];

/** Ein Befund: gruen, rot oder grau (nicht messbar ohne Zugangsdaten). */
function befund(kante, zustand, text) {
  return { kante, zustand, text };
}

// --- reine Urteile, damit der TUEV sie mit erfundenen Proben pruefen kann ---
// Alles hier drin ist ohne Netz und ohne Git entscheidbar. Ein Waechter, den
// man nur gegen die echte Welt testen kann, wird nie gegen den KRANKEN Fall
// getestet — und faellt genau dann aus, wenn er gebraucht wird.

/**
 * Zeigt die Domain noch auf GitHub Pages?
 * Zwei der vier Adressen genuegen: Pages liefert je nach Anschluss nicht
 * immer alle vier, und ein Teilsatz ist kein Defekt.
 * @returns {"gruen"|"rot"}
 */
export function bewertePagesAdressen(ips) {
  return ips.filter((ip) => PAGES_IPS.includes(ip)).length >= 2 ? "gruen" : "rot";
}

/**
 * Urteilt ueber den Zustand des Control-Servers aus seiner Health-Antwort.
 * ai=false ist die Falle vom 07.09.: alle Ampeln gruen, Router ohne Modell.
 * @returns {"gruen"|"rot"}
 */
export function bewerteHealth(status, nutzlast) {
  return status === 200 && nutzlast?.ok === true ? "gruen" : "rot";
}

/**
 * Urteilt ueber den Spiegel. EIN zurueckliegender Zweig genuegt fuer rot:
 * eine Sicherung, die 39 von 40 Zweigen hat, ist keine Sicherung.
 * @returns {"gruen"|"rot"}
 */
export function bewerteRueckstand(rueckstand) {
  return rueckstand.length ? "rot" : "gruen";
}

/**
 * Urteilt ueber die Code-Sicherung nach IDrive e2 anhand der Meldung, die der
 * Sicherungslauf hinterlassen hat. Rein und ohne Netz.
 *
 * Das ist der einzige Sicherungsort, der NICHT bei einem Git-Anbieter liegt.
 * Faellt er aus, merkt man es sonst erst, wenn man ihn braucht.
 * @returns {"gruen"|"rot"|"grau"}
 */
export function bewerteE2Sicherung(meldung) {
  const text = String(meldung || "");
  if (!/e2:/i.test(text)) return "grau";
  if (/kein e2-Zugang/i.test(text)) return "grau";
  if (/liegt bereits in e2|nach e2 gelegt|Wettlauf/i.test(text)) return "gruen";
  return "rot";
}

// Wie lange eine Salad-Gruppe laufen darf, bevor sie auffaellt. Trainings
// laufen ueber Stunden — 12 h sind deshalb bewusst grosszuegig. Gefangen
// werden soll der VERGESSENE Worker und die Kostenschleife, nicht die normale
// Arbeit. (Am 07.09. war genau das ein Befund: Salad startete fertige Jobs
// wieder und wieder.)
const SALAD_LAUFZEIT_GRENZE_MS = 12 * 60 * 60 * 1000;

/**
 * Urteilt ueber die laufenden Salad-Gruppen. Rein und ohne Netz.
 *
 * Salad ist der einzige Posten, der WAEHREND er laeuft Geld kostet. Zwei
 * Dinge sollen auffallen: ein Worker, der seit Stunden vergessen laeuft, und
 * eine Gruppe, die sich selbst immer wieder neu startet.
 *
 * Dass ueberhaupt etwas laeuft, ist KEIN Fehler — dafuer ist Salad da.
 * @param {Array<{name: string, status: string, start: string, neustart: string}>} gruppen
 * @returns {{zustand: "gruen"|"rot", text: string}}
 */
export function bewerteSaladLauf(gruppen, jetztMs) {
  const laufend = gruppen.filter((g) => String(g.status).toLowerCase() === "running");
  if (!laufend.length) {
    return { zustand: "gruen", text: `${gruppen.length} Gruppen, keine laeuft — keine laufenden Kosten` };
  }

  const befunde = [];
  for (const g of laufend) {
    const start = Date.parse(g.start ?? "");
    const stunden = Number.isFinite(start) ? (jetztMs - start) / 3600000 : null;
    // "always"/"on_failure" bei einer laufenden Gruppe ist die Kostenschleife:
    // sie startet sich nach jedem Ende von selbst wieder.
    if (g.neustart && String(g.neustart).toLowerCase() !== "never") {
      befunde.push(`${g.name} startet sich selbst neu (${g.neustart})`);
      continue;
    }
    if (stunden !== null && jetztMs - start > SALAD_LAUFZEIT_GRENZE_MS) {
      befunde.push(`${g.name} laeuft seit ${stunden.toFixed(0)} h`);
    }
  }

  if (befunde.length) return { zustand: "rot", text: `KOSTEN: ${befunde.join("; ")}` };
  const namen = laufend.map((g) => {
    const start = Date.parse(g.start ?? "");
    const stunden = Number.isFinite(start) ? ((jetztMs - start) / 3600000).toFixed(1) : "?";
    return `${g.name} (${stunden} h)`;
  });
  return { zustand: "gruen", text: `${laufend.length} laeuft: ${namen.join(", ")}` };
}

// Ein Lauf am Tag: nach 36 Stunden ohne Erfolg ist die Sicherung ueberfaellig.
// Die Reserve von 12 Stunden faengt einen zugeklappten Mac ab, ohne den
// Ausfall zu verschweigen.
const SICHERUNG_FRIST_MS = 36 * 60 * 60 * 1000;

/**
 * Urteilt ueber die taegliche Sicherung — GESAMT, ueber beide Wege.
 *
 * Gefragt ist nicht "laeuft die Action?", sondern "ist der Code gesichert?".
 * Solange das Secret CODEBERG_TOKEN fehlt, ist die Action rot und trotzdem
 * alles gesichert, weil der Mac-Job es tut. Wer hier stur die Action bewertet,
 * zeigt dauerhaft Rot — und an dauerndes Rot gewoehnt man sich, bis man den
 * echten Ausfall auch uebersieht.
 *
 * @param {"erfolg"|"fehler"|"unbekannt"} action  Ergebnis des letzten Action-Laufs
 * @param {{ergebnis?: string, stand?: string}|null} ersatz  Inhalt von zustand.json
 * @param {number} jetzt  Zeitstempel in ms
 * @returns {"gruen"|"rot"|"grau"}
 */
export function bewerteSicherung(action, ersatz, jetzt) {
  if (action === "erfolg") return "gruen";

  const frisch = ersatz?.ergebnis === "ok"
    && Number.isFinite(Date.parse(ersatz.stand ?? ""))
    && jetzt - Date.parse(ersatz.stand) < SICHERUNG_FRIST_MS;

  // Ersatzweg traegt: gemeldet wird grau, nicht gruen — der Mac muss dafuer
  // laufen, und dieser Vorbehalt darf nicht unsichtbar werden.
  if (frisch) return "grau";
  return action === "unbekannt" && !ersatz ? "grau" : "rot";
}

// FRIST AM GUTEN FALL BEMESSEN (12.09.): 15 s reichten fuer einen KALTSTART
// nicht. Das Hausmodell auf Zeabur schlaeft bei Nichtgebrauch ein und brauchte
// gemessen 16,0 s fuer die erste Antwort — danach 1,4 s. Die Kette meldete
// darum "nicht erreichbar" fuer einen gesunden Dienst. Ein grosszuegiges
// Zeitfenster kostet im gesunden Fall NICHTS (die Antwort kommt ja), eine zu
// knappe Frist kostet einen Fehlalarm.
async function hole(url, timeoutMs = 40000) {
  const abbruch = AbortSignal.timeout(timeoutMs);
  const start = Date.now();
  const antwort = await fetch(url, { signal: abbruch, redirect: "follow" });
  const dauer = Date.now() - start;
  const koerper = await antwort.text();
  return { status: antwort.status, dauer, koerper };
}

// ---------------------------------------------------------------- Kante 1-4
// Spaceship-DNS. Ohne diese vier Eintraege zeigt die Domain ins Leere; alles
// dahinter kann kerngesund sein und der Besucher sieht trotzdem nichts.

export async function pruefeDns() {
  const ergebnisse = [];

  try {
    const a = await dns.resolve4("smejj.com");
    const treffer = a.filter((ip) => PAGES_IPS.includes(ip));
    ergebnisse.push(bewertePagesAdressen(a) === "gruen"
      ? befund("Spaceship DNS → GitHub Pages", "gruen", `${treffer.length} von 4 Pages-Adressen`)
      : befund("Spaceship DNS → GitHub Pages", "rot", `A-Records zeigen NICHT auf Pages: ${a.join(", ")}`));
  } catch (fehler) {
    ergebnisse.push(befund("Spaceship DNS → GitHub Pages", "rot", `A-Record nicht aufloesbar: ${fehler.code || fehler.message}`));
  }

  try {
    const cname = await dns.resolveCname("www.smejj.com");
    ergebnisse.push(cname.some((z) => z.includes("github.io"))
      ? befund("Spaceship DNS → www", "gruen", cname.join(", "))
      : befund("Spaceship DNS → www", "rot", `zeigt woanders hin: ${cname.join(", ")}`));
  } catch (fehler) {
    ergebnisse.push(befund("Spaceship DNS → www", "rot", `CNAME fehlt: ${fehler.code || fehler.message}`));
  }

  try {
    const cname = await dns.resolveCname("api.smejj.com");
    ergebnisse.push(cname.some((z) => z.includes("zeabur.app"))
      ? befund("Spaceship DNS → Zeabur (api)", "gruen", cname.join(", "))
      : befund("Spaceship DNS → Zeabur (api)", "rot", `zeigt woanders hin: ${cname.join(", ")}`));
  } catch (fehler) {
    ergebnisse.push(befund("Spaceship DNS → Zeabur (api)", "rot", `CNAME fehlt: ${fehler.code || fehler.message}`));
  }

  // Mail zaehlt zur Kette: ohne MX kommt kein Anmelde-Link beim Nutzer an,
  // und ohne SPF landet er im Spam. Beides faellt sonst erst auf, wenn sich
  // jemand beschwert.
  try {
    const [mx, txt] = await Promise.all([dns.resolveMx("smejj.com"), dns.resolveTxt("smejj.com")]);
    const spf = txt.flat().join(" ").includes("v=spf1");
    ergebnisse.push(mx.length && spf
      ? befund("Spaceship DNS → Mail (MX/SPF)", "gruen", `${mx.length} MX, SPF gesetzt`)
      : befund("Spaceship DNS → Mail (MX/SPF)", "rot", `MX: ${mx.length}, SPF: ${spf ? "ja" : "FEHLT"}`));
  } catch (fehler) {
    ergebnisse.push(befund("Spaceship DNS → Mail (MX/SPF)", "rot", `nicht aufloesbar: ${fehler.code || fehler.message}`));
  }

  return ergebnisse;
}

// ------------------------------------------------------------------ Kante 5
// Der Render-Pfad. Static-First heisst: DIESE Seite muss auch dann kommen,
// wenn der Control-Server steht.

export async function pruefeStartseite() {
  // DREI VERSUCHE, DER BESTE ZAEHLT (Messung 2026-09-08): ein einzelner Aufruf
  // ergab 3798 ms, direkt davor und danach 648, 790 und 988 ms. Das war ein
  // Zucken der Leitung, kein Einbruch der Seite — und haette als roter Befund
  // dagestanden. Gefragt ist "KANN die Seite schnell?", nicht "war das WLAN
  // gerade beschaeftigt?". Ein Waechter mit Fehlalarmen wird weggeklickt, und
  // dann uebersieht man auch den echten Einbruch.
  const zeiten = [];
  let letzterStatus = 0;
  let letzterFehler = null;

  for (let versuch = 0; versuch < 3; versuch += 1) {
    try {
      const { status, dauer } = await hole("https://smejj.com/");
      letzterStatus = status;
      if (status !== 200) return [befund("Besucher → smejj.com (statisch)", "rot", `HTTP ${status}`)];
      zeiten.push(dauer);
      // Schon schnell genug? Dann nicht weiter messen — der Rest waere Lärm.
      if (dauer <= LADEZEIT_GRENZE_MS) break;
    } catch (fehler) {
      letzterFehler = fehler;
    }
  }

  if (!zeiten.length) {
    return [befund("Besucher → smejj.com (statisch)", "rot",
      `nicht erreichbar: ${letzterFehler?.message || `HTTP ${letzterStatus}`}`)];
  }

  const bester = Math.min(...zeiten);
  return [bester <= LADEZEIT_GRENZE_MS
    ? befund("Besucher → smejj.com (statisch)", "gruen",
      `HTTP 200 in ${bester} ms${zeiten.length > 1 ? ` (bester von ${zeiten.length})` : ""}`)
    : befund("Besucher → smejj.com (statisch)", "rot",
      `HTTP 200, aber ${bester} ms im besten von ${zeiten.length} Versuchen (Grenze ${LADEZEIT_GRENZE_MS} ms)`)];
}

// ---------------------------------------------------------------- Kante 6-10
// Zeabur. Der Control-Server ist bewusst NICHT im Render-Pfad — faellt er aus,
// bleibt die Seite stehen, aber Anmeldung, Chat und Router sind tot.

export async function pruefeZeabur() {
  const ergebnisse = [];

  // Ueber die EIGENE Domain, nicht ueber *.zeabur.app: nur so ist bewiesen,
  // dass auch die DNS-Kante bis zum Server durchgaengig ist.
  try {
    const { status, dauer, koerper } = await hole("https://api.smejj.com/api/health", 25000);
    let nutzlast = null;
    try { nutzlast = JSON.parse(koerper); } catch { /* kein JSON = kein gesunder Server */ }
    if (bewerteHealth(status, nutzlast) === "gruen") {
      ergebnisse.push(befund("api.smejj.com → Control-Server", "gruen", `ok in ${dauer} ms, Modell ${nutzlast.activeModelId || "?"}`));
      // Die Speicher-Kante laesst sich hier MITLESEN, ohne einen e2-Schluessel
      // zu brauchen: der Server nennt in seiner Modell-Registry den Anbieter.
      const nenntE2 = koerper.includes("idrive-e2") || /IDRIVE_E2/.test(koerper);
      ergebnisse.push(nenntE2
        ? befund("Control-Server → IDrive e2", "gruen", "Speicher-Anbieter idrive-e2 in der Registry")
        : befund("Control-Server → IDrive e2", "grau", "Health nennt keinen Speicher — mit e2-Schluessel pruefen"));
      // Ein Router ohne lauffaehiges Modell ist die Falle vom 07.09.: alle
      // Ampeln gruen, und trotzdem antwortet der Chat nicht.
      ergebnisse.push(nutzlast.ai === true
        ? befund("Control-Server → Modell-Router", "gruen", `Backend ${nutzlast.aiBackend || "?"}`)
        : befund("Control-Server → Modell-Router", "rot", "kein lauffaehiges Modell (ai=false)"));
    } else {
      ergebnisse.push(befund("api.smejj.com → Control-Server", "rot", `HTTP ${status}, ok=${nutzlast?.ok}`));
    }
  } catch (fehler) {
    ergebnisse.push(befund("api.smejj.com → Control-Server", "rot", `nicht erreichbar: ${fehler.message}`));
  }

  for (const [name, url] of ZEABUR_DIENSTE) {
    try {
      const { status, dauer } = await hole(url);
      ergebnisse.push(status === 200
        ? befund(name, "gruen", `HTTP 200 in ${dauer} ms`)
        : befund(name, "rot", `HTTP ${status}`));
    } catch (fehler) {
      ergebnisse.push(befund(name, "rot", `nicht erreichbar: ${fehler.message}`));
    }
  }

  return ergebnisse;
}

// ----------------------------------------------------------------- Kante 11
// GitHub → Codeberg. Die Kante, die am 08.09. gerissen war. Gemessen wird
// nicht "laeuft der Job", sondern "sind die Zweige wirklich drueben" — ein
// gruener Job, der nichts kopiert, waere ebenso wertlos wie ein roter.

export async function pruefeCodebergSpiegel() {
  // ZWEI BETRIEBSARTEN (2026-09-08): normalerweise misst der Lauf im
  // Projektordner. Als taeglicher Hintergrund-Termin geht das NICHT — macOS
  // laesst launchd-Dienste nicht in CloudStorage-Ordner ("Operation not
  // permitted"). Ueber SMEJJ_KETTE_GITDIR laesst sich deshalb der nackte Klon
  // der Sicherungs-Wache angeben, der beide Seiten kennt. Dort liegt der
  // GitHub-Stand direkt in refs/heads/*, nicht in refs/remotes/origin/*.
  const gitDir = process.env.SMEJJ_KETTE_GITDIR || "";
  const quellPraefix = gitDir ? "refs/heads/" : "refs/remotes/origin/";
  const git = (args) => execFileAsync(
    "git",
    gitDir ? ["--git-dir", gitDir, ...args] : args,
    { cwd: gitDir ? undefined : WURZEL, maxBuffer: 8 * 1024 * 1024 }
  );

  try {
    if (gitDir) {
      await git(["remote", "update", "--prune"]);
    } else {
      await git(["fetch", "--prune", "--quiet", "origin"]);
      await git(["fetch", "--prune", "--quiet", "codeberg"]);
    }
  } catch (fehler) {
    return [befund("GitHub → Codeberg (Spiegel)", "rot", `Abgleich nicht moeglich: ${String(fehler.stderr || fehler.message).trim().split("\n").pop()}`)];
  }

  const { stdout } = await git(["for-each-ref", "--format=%(refname:short)", quellPraefix]);
  const zweige = stdout.split("\n").map((z) => z.replace(/^origin\//, "").trim())
    .filter((z) => z && z !== "HEAD" && z !== "origin");

  const quelleRef = (zweig) => (gitDir ? `refs/heads/${zweig}` : `origin/${zweig}`);
  const rueckstand = [];
  for (const zweig of zweige) {
    try {
      await git(["rev-parse", "--verify", "--quiet", `refs/remotes/codeberg/${zweig}`]);
    } catch {
      rueckstand.push(`${zweig} (fehlt ganz)`);
      continue;
    }
    const { stdout: anzahl } = await git(["rev-list", "--count", `codeberg/${zweig}..${quelleRef(zweig)}`]);
    const n = Number.parseInt(anzahl.trim(), 10);
    if (n > 0) rueckstand.push(`${zweig} (${n} Commits)`);
  }

  if (bewerteRueckstand(rueckstand) === "gruen") {
    return [befund("GitHub → Codeberg (Spiegel)", "gruen", `${zweige.length} Zweige gleichauf`)];
  }
  const zeige = rueckstand.slice(0, 4).join(", ");
  return [befund("GitHub → Codeberg (Spiegel)", "rot",
    `${rueckstand.length} Zweig(e) im Rueckstand: ${zeige}${rueckstand.length > 4 ? " …" : ""}`)];
}

// ----------------------------------------------------------------- Kante 12
// Der Waechter des Waechters: laeuft die taegliche Sicherung ueberhaupt durch?
//
// Zwei Wege fuehren dorthin, und gefragt ist das ERGEBNIS, nicht der Weg:
//   1. GitHub Action — schlaeft, solange das Secret CODEBERG_TOKEN fehlt.
//   2. Mac-Termin (launchd, com.smejj.codeberg-spiegel) — laeuft heute.
// Deshalb wird beides gelesen und gemeinsam bewertet.

const ERSATZ_ZUSTAND = join(process.env.HOME || "", ".local/share/smejj-codeberg/zustand.json");

export async function pruefeSicherung() {
  let action = "unbekannt";
  let actionText = "gh nicht verfuegbar";
  try {
    const { stdout } = await execFileAsync("gh",
      ["run", "list", "--workflow=codeberg-spiegel.yml", "--limit", "1", "--json", "conclusion,createdAt"],
      { cwd: WURZEL });
    const [letzter] = JSON.parse(stdout);
    if (letzter) {
      action = letzter.conclusion === "success" ? "erfolg" : "fehler";
      actionText = `Action ${String(letzter.createdAt).slice(0, 10)}: ${letzter.conclusion}`;
    } else {
      actionText = "Action: noch kein Lauf";
    }
  } catch { /* kein gh — bleibt "unbekannt" */ }

  let ersatz = null;
  try {
    ersatz = JSON.parse(await readFile(ERSATZ_ZUSTAND, "utf8"));
  } catch { /* kein Mac-Termin eingerichtet */ }

  const zustand = bewerteSicherung(action, ersatz, Date.now());
  const ersatzText = ersatz
    ? `Mac-Termin ${String(ersatz.stand).slice(0, 16).replace("T", " ")} UTC: ${ersatz.ergebnis}`
    : "kein Mac-Termin";

  // Der dritte Sicherungsort steht als EIGENE Kante da: er liegt als einziger
  // nicht bei einem Git-Anbieter und faellt sonst still aus.
  const e2Zustand = bewerteE2Sicherung(ersatz?.meldung);
  const e2Text = String(ersatz?.meldung || "").split("e2:")[1]?.trim() || "kein Lauf gemeldet";
  const e2 = befund(
    "Code-Sicherung → IDrive e2",
    e2Zustand,
    e2Zustand === "grau" ? `nicht gemessen (${e2Text})` : e2Text
  );

  if (zustand === "gruen") return [befund("Taegliche Sicherung", "gruen", actionText), e2];
  if (zustand === "grau") {
    return [befund("Taegliche Sicherung", "grau",
      `${ersatzText} — traegt gerade allein (${actionText}; Secret CODEBERG_TOKEN fehlt)`), e2];
  }
  return [befund("Taegliche Sicherung", "rot", `${actionText}; ${ersatzText} — NICHTS sichert mehr`), e2];
}

// ----------------------------------------------------------------- Kante 14
// Salad. Der einzige Posten der Architektur, der WAEHREND er laeuft Geld
// kostet — und damit der einzige, bei dem Nichtstun teuer werden kann.
//
// Ohne SALAD_API_KEY in der Umgebung wird das grau gemeldet, nicht rot: der
// normale Lauf soll ohne jedes Geheimnis funktionieren. Der taegliche Termin
// gibt die Werte mit und misst darum wirklich.

export async function pruefeSalad({ env = process.env, jetztMs = Date.now() } = {}) {
  const org = env.SALAD_ORGANIZATION_NAME;
  const projekt = env.SALAD_PROJECT_NAME;
  const key = env.SALAD_API_KEY;
  if (!org || !projekt || !key) {
    return [befund("Salad → Budget-Gate", "grau", "kein Salad-Zugang in der Umgebung — nicht messbar")];
  }

  try {
    const url = `https://api.salad.com/api/public/organizations/${org}/projects/${projekt}/containers`;
    const antwort = await fetch(url, {
      headers: { "Salad-Api-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    if (!antwort.ok) {
      return [befund("Salad → Budget-Gate", "rot", `Salad antwortet ${antwort.status} — Kosten nicht pruefbar`)];
    }
    const nutzlast = await antwort.json();
    const gruppen = (nutzlast.items || []).map((g) => ({
      name: g.name,
      status: g.current_state?.status,
      start: g.current_state?.start_time,
      neustart: g.restart_policy
    }));
    const urteil = bewerteSaladLauf(gruppen, jetztMs);
    return [befund("Salad → Budget-Gate", urteil.zustand, urteil.text)];
  } catch (fehler) {
    return [befund("Salad → Budget-Gate", "rot", `nicht erreichbar: ${String(fehler.message).slice(0, 80)}`)];
  }
}

// ----------------------------------------------------------------- Kante 15
// Geheimnisse. Keine Verbindung, aber die Stelle, an der die ganze Kette auf
// einmal offen stehen kann.

export async function pruefeGeheimnisse() {
  const ergebnisse = [];
  // Im Klon-Modus gibt es kein Arbeitsverzeichnis: dann wird dieselbe Frage
  // dem Klon gestellt, statt sie unbeantwortet zu lassen. Ein "keine
  // .gitignore gefunden" waere hier ein FEHLALARM gewesen (gemessen 2026-09-08,
  // beim ersten naechtlichen Probelauf) — und ein Waechter, der taeglich
  // grundlos Alarm schlaegt, wird abgeschaltet.
  const gitDir = process.env.SMEJJ_KETTE_GITDIR || "";
  const ausKlon = (pfad) => execFileAsync(
    "git", ["--git-dir", gitDir, "show", `${DEPLOY_ZWEIG}:${pfad}`], { maxBuffer: 4 * 1024 * 1024 }
  ).then((r) => r.stdout);

  try {
    const ignore = gitDir ? await ausKlon(".gitignore") : await readFile(join(WURZEL, ".gitignore"), "utf8");
    ergebnisse.push(/^\.env$/m.test(ignore) || /^\.env\b/m.test(ignore)
      ? befund("Geheimnisse: .env ignoriert", "gruen", ".env steht in .gitignore")
      : befund("Geheimnisse: .env ignoriert", "rot", ".env FEHLT in .gitignore"));
  } catch {
    ergebnisse.push(befund("Geheimnisse: .env ignoriert", "rot", "keine .gitignore gefunden"));
  }

  try {
    // Im Klon dieselbe Frage an den ausgelieferten Zweig: liegt dort eine
    // .env? `git show` wirft, wenn es sie nicht gibt — und genau das ist der
    // gute Fall.
    if (gitDir) {
      await ausKlon(".env");
    } else {
      await execFileAsync("git", ["ls-files", "--error-unmatch", ".env"], { cwd: WURZEL });
    }
    ergebnisse.push(befund("Geheimnisse: .env nicht versioniert", "rot", ".env liegt IM Repo"));
  } catch {
    ergebnisse.push(befund("Geheimnisse: .env nicht versioniert", "gruen", ".env ist nicht eingecheckt"));
  }

  return ergebnisse;
}

export async function main() {
  console.log("smejj.com — Verbindungs-Landkarte");
  console.log("Gemessen werden die KANTEN der Architektur, nicht die einzelnen Dienste.\n");

  const gruppen = await Promise.all([
    pruefeDns(),
    pruefeStartseite(),
    pruefeZeabur(),
    pruefeCodebergSpiegel(),
    pruefeSicherung(),
    pruefeSalad(),
    pruefeGeheimnisse()
  ]);
  const alle = gruppen.flat();

  const breite = Math.max(...alle.map((e) => e.kante.length));
  for (const e of alle) {
    const zeichen = e.zustand === "gruen" ? "OK  " : e.zustand === "rot" ? "ROT " : "?   ";
    console.log(`${zeichen}${e.kante.padEnd(breite)}  ${e.text}`);
  }

  const rot = alle.filter((e) => e.zustand === "rot");
  const grau = alle.filter((e) => e.zustand === "grau");
  console.log("");
  if (!rot.length) {
    console.log(`Alle ${alle.length - grau.length} messbaren Verbindungen stehen.`);
  } else {
    console.log(`GERISSEN: ${rot.length} von ${alle.length} Verbindungen.`);
    for (const e of rot) console.log(`  - ${e.kante}: ${e.text}`);
  }
  if (grau.length) console.log(`Nicht messbar ohne Zugangsdaten: ${grau.map((e) => e.kante).join(", ")}`);

  return rot.length ? 1 : 0;
}

// pathToFileURL statt `file://${argv[1]}`: der Projektordner enthaelt
// Leerzeichen, die import.meta.url als %20 kodiert und process.argv[1] nicht.
// Der naive Vergleich ist deshalb hier IMMER falsch — das Skript liefe durch,
// ohne zu pruefen, und meldete Code 0.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
