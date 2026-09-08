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

async function hole(url, timeoutMs = 15000) {
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
  try {
    const { status, dauer } = await hole("https://smejj.com/");
    if (status !== 200) return [befund("Besucher → smejj.com (statisch)", "rot", `HTTP ${status}`)];
    return [dauer <= LADEZEIT_GRENZE_MS
      ? befund("Besucher → smejj.com (statisch)", "gruen", `HTTP 200 in ${dauer} ms`)
      : befund("Besucher → smejj.com (statisch)", "rot", `HTTP 200, aber ${dauer} ms (Grenze ${LADEZEIT_GRENZE_MS} ms)`)];
  } catch (fehler) {
    return [befund("Besucher → smejj.com (statisch)", "rot", `nicht erreichbar: ${fehler.message}`)];
  }
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
  const git = (args) => execFileAsync("git", args, { cwd: WURZEL, maxBuffer: 8 * 1024 * 1024 });

  try {
    await git(["fetch", "--prune", "--quiet", "origin"]);
    await git(["fetch", "--prune", "--quiet", "codeberg"]);
  } catch (fehler) {
    return [befund("GitHub → Codeberg (Spiegel)", "rot", `Abgleich nicht moeglich: ${String(fehler.stderr || fehler.message).trim().split("\n").pop()}`)];
  }

  const { stdout } = await git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"]);
  const zweige = stdout.split("\n").map((z) => z.replace(/^origin\//, "").trim())
    .filter((z) => z && z !== "HEAD" && z !== "origin");

  const rueckstand = [];
  for (const zweig of zweige) {
    try {
      await git(["rev-parse", "--verify", "--quiet", `refs/remotes/codeberg/${zweig}`]);
    } catch {
      rueckstand.push(`${zweig} (fehlt ganz)`);
      continue;
    }
    const { stdout: anzahl } = await git(["rev-list", "--count", `codeberg/${zweig}..origin/${zweig}`]);
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
// Ohne gh-Werkzeug ist das grau, nicht rot — fehlendes Werkzeug ist kein Defekt.

export async function pruefeSpiegelLauf() {
  try {
    const { stdout } = await execFileAsync("gh",
      ["run", "list", "--workflow=codeberg-spiegel.yml", "--limit", "1", "--json", "conclusion,createdAt"],
      { cwd: WURZEL });
    const [letzter] = JSON.parse(stdout);
    if (!letzter) return [befund("Taegliche Sicherung (Action)", "grau", "noch kein Lauf")];
    const tag = String(letzter.createdAt).slice(0, 10);
    return [letzter.conclusion === "success"
      ? befund("Taegliche Sicherung (Action)", "gruen", `letzter Lauf ${tag} erfolgreich`)
      : befund("Taegliche Sicherung (Action)", "rot", `letzter Lauf ${tag}: ${letzter.conclusion} — Secret CODEBERG_TOKEN pruefen`)];
  } catch {
    return [befund("Taegliche Sicherung (Action)", "grau", "gh nicht verfuegbar — nicht messbar")];
  }
}

// ----------------------------------------------------------------- Kante 13
// Geheimnisse. Keine Verbindung, aber die Stelle, an der die ganze Kette auf
// einmal offen stehen kann.

export async function pruefeGeheimnisse() {
  const ergebnisse = [];
  try {
    const ignore = await readFile(join(WURZEL, ".gitignore"), "utf8");
    ergebnisse.push(/^\.env$/m.test(ignore) || /^\.env\b/m.test(ignore)
      ? befund("Geheimnisse: .env ignoriert", "gruen", ".env steht in .gitignore")
      : befund("Geheimnisse: .env ignoriert", "rot", ".env FEHLT in .gitignore"));
  } catch {
    ergebnisse.push(befund("Geheimnisse: .env ignoriert", "rot", "keine .gitignore gefunden"));
  }

  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--error-unmatch", ".env"], { cwd: WURZEL });
    ergebnisse.push(befund("Geheimnisse: .env nicht versioniert", "rot", `.env liegt IM Repo: ${stdout.trim()}`));
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
    pruefeSpiegelLauf(),
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
