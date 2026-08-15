#!/usr/bin/env node
// smejj.com — prueft ZWEIGWEIT, ob die Sperre gegen Zeaburs loeschende
// Sammelform ueberall dort liegt, wo das Setz-Skript liegt.
//
// WARUM ES DAS GIBT: Am 2026-08-14 hat `updateEnvironmentVariable(data: Map)`
// ZWEIMAL an einem Tag die Produktionsumgebung von smejj-control geloescht —
// Sitzungsgeheimnis, Modellschluessel, Speicher- und Mailzugang. Der zweite
// Vorfall passierte, OBWOHL die Sperre schon gebaut war: sie lag auf einem
// anderen Zweig. Auf dem Zweig, auf dem gearbeitet wurde, bevorzugte die
// Auswahlformel die loeschende Form weiterhin ausdruecklich.
//
// Ein Test in tests/ kann das nicht bemerken — er sieht immer nur den Zweig,
// auf dem er gerade laeuft. Dieser Waechter sieht ueber den Zweigrand.
//
// Am 2026-08-14 fand die erste Messung zwei OFFENE Zweige mit der
// Vorfall-Fassung. Von Hand gemessen faellt so etwas genau einmal auf; danach
// nie wieder, weil niemand daran denkt.
//
// GEMESSEN WIRD DER INHALT, NICHT DIE AHNENSCHAFT. Ein Zweig kann die Sperre
// auch ueber einen anderen Commit haben, und `merge-base --is-ancestor` gegen
// einen einzelnen Fix-Commit wuerde ihn faelschlich anklagen.
//
//   node scripts/check-zweig-sperren.mjs [--fetch] [--alle] [--tage N]
//
// --fetch  holt die Zweige vorher (sonst wird der lokal bekannte Stand
//          gemessen — das sagt der Bericht dann auch)
// --alle   auch Archivzweige (sicherung/*, gh-pages) und alte Zweige bewerten
// --tage   wie frisch ein Zweig sein muss, um zu blockieren (Standard 14)
import { execFileSync } from "node:child_process";

export const QUELLE = "scripts/deploy/zeabur-umgebung-setzen.mjs";
export const WACHE = "tests/zeabur-umgebung-setzen.test.mjs";
export const STANDARD_TAGE = 14;

// Die vier Kennzeichen, an denen der Schutzstand einer Fassung ablesbar ist.
// Sie stehen absichtlich als Zeichenketten hier und nicht als Regeln, die den
// Code nachbauen: was hier steht, muss im Skript woertlich vorkommen.
const KENNZEICHEN = {
  sperre1: "zeabur_ersetzende_mutation_verweigert", // Form im Schema
  haertung: "sammelArgumente",                      // erkennt auch fremde Namen am Map-Typ
  sperre2: "zeabur_sammelwert_verweigert"           // Werte vor dem Absenden
};

// Die Auswahlformel der Vorfall-Fassung: sie gibt der Sammelform Punkte und
// greift damit zielsicher nach der Form, die die Umgebung ersetzt.
const VORFALL_FORMEL = /\[\s*"data",\s*"variables",\s*"envs"\s*\]\.includes\(n\)\s*\)\s*\)\s*p \+=/;

export function bewerteQuelle(text) {
  return {
    sperre1: text.includes(KENNZEICHEN.sperre1),
    haertung: text.includes(KENNZEICHEN.haertung),
    sperre2: text.includes(KENNZEICHEN.sperre2),
    bevorzugtSammelform: VORFALL_FORMEL.test(text)
  };
}

// Archiv: Sicherungszweige und die Seitenausgabe sind Momentaufnahmen. Sie
// duerfen berichtet, aber nicht zum Blocker werden — sonst steht der Waechter
// dauerhaft auf rot und wird weggeklickt.
export function istArchiv(zweig) {
  return zweig.startsWith("sicherung/") || zweig === "gh-pages";
}

export function stufeVon({ hatQuelle, hatWache, quelle }) {
  if (!hatQuelle) return "unbetroffen";
  if (!quelle.sperre1) return "scharf";
  if (!quelle.haertung || !quelle.sperre2 || !hatWache) return "ungehaertet";
  return "vollstaendig";
}

// Trennt Blocker von Hinweisen. Fail-closed: wurde NICHTS gemessen, ist das
// kein "alles in Ordnung". Genau diese Verwechslung — eine kaputte Schleife
// meldete fuer jeden Zweig "Datei fehlt" — haette die zwei scharfen Zweige
// beinahe verborgen.
export function entscheide(befunde) {
  if (!befunde.length) {
    return { code: 1, grund: "keine_zweige_gemessen" };
  }
  const scharf = befunde.filter((b) => b.stufe === "scharf" && !b.archiv && b.frisch);
  const ungehaertet = befunde.filter((b) => b.stufe === "ungehaertet" && !b.archiv && b.frisch);
  return { code: scharf.length ? 1 : 0, scharf, ungehaertet, grund: scharf.length ? "scharfe_zweige" : "ok" };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function zeigeDatei(ref, pfad) {
  try {
    // stderr stumm: dass die Datei auf einem Zweig fehlt, ist der Normalfall
    // und kein Fehler — git meldet es trotzdem lautstark ("exists on disk,
    // but not in ..."). Der Bericht dieses Waechters soll lesbar bleiben.
    return execFileSync("git", ["show", `${ref}:${pfad}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

// Rangordnung fuer den Fall, dass derselbe Zweigname unter mehreren Remotes
// steht. Es zaehlt der SCHLECHTESTE Stand, nicht der neueste.
//
// Der erste Entwurf machte es andersherum ("derselbe Zweig, nimm den neueren")
// und liess sich prompt taeuschen: fix/cve-klassifizierer-blind lag unter gh/
// mit der loeschenden Fassung und unter origin/ bereits geheilt — der Waechter
// meldete gruen. Ein Ref mit der Vorfall-Fassung ist aber ein Ref, von dem
// jemand abzweigen und arbeiten kann, egal wie aktuell ein anderer ist.
const RANG = { scharf: 3, ungehaertet: 2, vollstaendig: 1, unbetroffen: 0 };
export function schaerfere(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANG[b.stufe] > RANG[a.stufe] ? b : a;
}

function sammleRefs() {
  // JEDER Remote-Ref einzeln — kein Zusammenfassen vor der Bewertung.
  const roh = git(
    "for-each-ref",
    "--format=%(refname)|%(committerdate:unix)",
    "refs/remotes/"
  ).trim();
  if (!roh) return [];
  const refs = [];
  for (const zeile of roh.split("\n")) {
    const [refname, unix] = zeile.split("|");
    const ohnePrefix = refname.replace("refs/remotes/", "");
    const [remote, ...rest] = ohnePrefix.split("/");
    const zweig = rest.join("/");
    if (!zweig || zweig === "HEAD") continue;
    refs.push({ zweig, remote, ref: refname, unix: Number(unix) || 0 });
  }
  return refs.sort((a, b) => b.unix - a.unix);
}

function main() {
  const args = process.argv.slice(2);
  const alle = args.includes("--alle");
  const tageIndex = args.indexOf("--tage");
  const tage = tageIndex >= 0 ? Number(args[tageIndex + 1]) || STANDARD_TAGE : STANDARD_TAGE;
  let geholt = false;

  if (args.includes("--fetch")) {
    // Je Remote einzeln. `git fetch --all` bricht beim ersten unerreichbaren
    // Remote ab und laesst die uebrigen ungeholt — hier faellt regelmaessig
    // Codeberg aus (SSH), und dann waere GitHub gleich mit ungemessen.
    let remotes = [];
    try {
      remotes = git("remote").trim().split("\n").filter(Boolean);
    } catch { /* kein Remote konfiguriert */ }
    const gelungen = [];
    const gescheitert = [];
    for (const remote of remotes) {
      try {
        execFileSync("git", ["fetch", remote, "--prune", "--quiet"], {
          encoding: "utf8",
          stdio: ["ignore", "ignore", "ignore"],
          timeout: 120000
        });
        gelungen.push(remote);
      } catch {
        gescheitert.push(remote);
      }
    }
    geholt = gelungen.length > 0;
    if (gescheitert.length) {
      console.warn(
        `Hinweis: nicht erreicht: ${gescheitert.join(", ")}`
        + `${gelungen.length ? ` (geholt: ${gelungen.join(", ")})` : " — gemessen wird der lokal bekannte Stand"}.`
      );
    }
  }

  const grenze = Date.now() / 1000 - tage * 86400;
  const refs = sammleRefs();

  // Erst jeden Ref einzeln bewerten, dann je Zweigname den schaerfsten behalten.
  const jeZweig = new Map();
  for (const r of refs) {
    const quelltext = zeigeDatei(r.ref, QUELLE);
    const befund = {
      zweig: r.zweig,
      remote: r.remote,
      archiv: istArchiv(r.zweig),
      frisch: r.unix >= grenze,
      hatQuelle: quelltext !== null,
      hatWache: zeigeDatei(r.ref, WACHE) !== null,
      quelle: bewerteQuelle(quelltext || "")
    };
    befund.stufe = stufeVon(befund);
    jeZweig.set(r.zweig, schaerfere(jeZweig.get(r.zweig), befund));
  }
  const befunde = [...jeZweig.values()];

  const urteil = entscheide(alle ? befunde.map((b) => ({ ...b, archiv: false, frisch: true })) : befunde);

  if (urteil.grund === "keine_zweige_gemessen") {
    console.error("check:zweig-sperren FAILED — kein einziger Zweig messbar.");
    console.error("  Das ist KEIN gruenes Ergebnis: ohne Remote-Zweige ist der Schutzstand unbekannt.");
    console.error("  Abhilfe: git fetch --all (oder diesen Waechter mit --fetch aufrufen).");
    process.exit(1);
  }

  const betroffen = befunde.filter((b) => b.hatQuelle);
  console.log(
    `Refs geprueft: ${refs.length}, Zweige: ${befunde.length} — davon mit ${QUELLE}: ${betroffen.length}`
    + `${geholt ? " (frisch geholt)" : " (lokal bekannter Stand)"}`
  );
  for (const b of betroffen) {
    const marke = { scharf: "SCHARF     ", ungehaertet: "ungehaertet", vollstaendig: "vollstaendig" }[b.stufe];
    const zusatz = [b.archiv ? "Archiv" : null, b.frisch ? null : `aelter als ${tage} Tage`]
      .filter(Boolean).join(", ");
    // Das Remote gehoert dazu: bei zwei Staenden desselben Zweiges muss man
    // sehen, WO der schlechtere liegt.
    console.log(`  ${marke}  ${b.remote}/${b.zweig}${zusatz ? `  (${zusatz})` : ""}`);
  }

  for (const b of urteil.ungehaertet) {
    console.log(`Hinweis: ${b.zweig} hat die Sperre, aber nicht den vollen Stand `
      + `(Haertung: ${b.quelle.haertung ? "ja" : "nein"}, zweite Sperre: ${b.quelle.sperre2 ? "ja" : "nein"}, `
      + `Wache: ${b.hatWache ? "ja" : "nein"}). Bau-Branch hineinmergen.`);
  }

  if (urteil.code !== 0) {
    console.error(`\ncheck:zweig-sperren FAILED (${urteil.scharf.length} Zweige ohne Sperre):`);
    for (const b of urteil.scharf) {
      console.error(`  - ${b.zweig}: traegt ${QUELLE} OHNE die Sperre gegen die Sammelform`
        + `${b.quelle.bevorzugtSammelform ? " — und bevorzugt sie sogar in der Auswahl (Vorfall-Fassung)" : ""}.`);
    }
    console.error("\n  Wer dort das Setz-Skript ausfuehrt, loescht die Umgebung des Dienstes.");
    console.error("  Abhilfe je Zweig: den Bau-Branch hineinmergen, dann messen.");
    process.exit(1);
  }
  console.log("check:zweig-sperren OK — jeder Zweig, der das Skript traegt, traegt auch die Sperre.");
}

// Nur ausfuehren, wenn direkt aufgerufen — der Test importiert die Bewertung.
if (process.argv[1] && process.argv[1].endsWith("check-zweig-sperren.mjs")) main();
