// smejj.com — WAECHTER-TUEV: der Pruefer fuer die Pruefer.
//
// WARUM ES DAS GIBT (2026-08-14). An einem einzigen Tag haben sich drei
// Messgeraete dieses Projekts selbst belogen:
//   1. Das Werkstatt-Tor verglich gegen einen 95 Commits alten Branch und
//      meldete deshalb JEDE Nacht "zu" — der Nachtbau hat nie gebaut.
//   2. Der Backlog-Sammler machte aus einem frischen Deploy 30 Phantom-Aufgaben.
//   3. Der Bug-Predictor meldete 2310 Befunde und fand dabei vor allem
//      SICH SELBST — seine eigenen Suchmuster und Testfixtures.
// Keiner dieser Fehler war ein Absturz. Alle drei sahen aus wie Arbeit.
//
// Ein Waechter kann auf ZWEI Arten kaputt sein, und beide sind hier gedeckt:
//   BLIND  — er schweigt, obwohl etwas kaputt ist  (der gefaehrlichere Fall:
//            er erzeugt Vertrauen, das nicht gedeckt ist)
//   LAUT   — er schlaegt an, obwohl alles in Ordnung ist (er erzeugt Arbeit,
//            die es nicht gibt, und wird deshalb bald ignoriert)
//
// Deshalb bekommt jeder Waechter hier ZWEI Proben: einen absichtlich kaputten
// Fall, bei dem er anschlagen MUSS, und einen gesunden, bei dem er schweigen
// MUSS. Gemessen wird der Prozess-Exitcode — also genau das, worauf sich die
// Tor-Pruefung und der Nachtbau verlassen.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Baut ein Wegwerf-Repo, in dem ein Waechter isoliert laufen kann.
 * `git init` ist noetig, weil manche Pruefer ihre Dateiliste ueber
 * `git ls-files` holen — ohne Repo saehen sie NICHTS und waeren faelschlich
 * gruen (genau die Sorte Blindheit, die dieser TUEV sucht).
 */
function baueProbeRepo(dateien) {
  const wurzel = mkdtempSync(path.join(os.tmpdir(), "waechter-tuev-"));
  for (const [relativerPfad, inhalt] of Object.entries(dateien)) {
    const ziel = path.join(wurzel, relativerPfad);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, inhalt);
  }
  spawnSync("git", ["init", "-q"], { cwd: wurzel });
  spawnSync("git", ["add", "-A"], { cwd: wurzel });
  return wurzel;
}

/** Kopiert die Skripte, die der Waechter zum Laufen braucht. */
function legeSkripteBei(wurzel, skripte) {
  for (const rel of skripte) {
    const ziel = path.join(wurzel, rel);
    mkdirSync(path.dirname(ziel), { recursive: true });
    cpSync(path.join(REPO, rel), ziel);
  }
}

/** Fuehrt einen Waechter im Probe-Repo aus und gibt Exitcode + Ausgabe zurueck. */
function laufeWaechter(wurzel, skript, argumente = []) {
  const ergebnis = spawnSync("node", [skript, ...argumente], {
    cwd: wurzel, encoding: "utf8", timeout: 120_000
  });
  return { code: ergebnis.status, ausgabe: `${ergebnis.stdout || ""}${ergebnis.stderr || ""}` };
}

const langeDatei = (zeilen) => Array.from({ length: zeilen }, (_, i) => `const zeile${i} = ${i};`).join("\n");

test("check-guidelines schlaegt bei einer zu langen Datei an", () => {
  const wurzel = baueProbeRepo({ "public/zu-lang.js": langeDatei(900) });
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    assert.notEqual(code, 0, "900 Zeilen muessen auffallen — sonst ist der Waechter blind");
    assert.match(ausgabe, /zu-lang\.js/, "die schuldige Datei muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-guidelines schweigt bei gesundem Code", () => {
  const wurzel = baueProbeRepo({ "public/kurz.js": langeDatei(50) });
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    assert.equal(code, 0, `50 Zeilen duerfen nicht anschlagen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-guidelines ist ohne git nicht faelschlich gruen", () => {
  // Ohne Repo liefert `git ls-files` nichts. Ein Waechter, der daraus "alles
  // in Ordnung" macht, ist die gefaehrlichste Bauart: er meldet Gruen, weil er
  // NICHTS gesehen hat. Erwartet wird also entweder ein Fehler oder wenigstens
  // eine Ausgabe, die die geprueften Dateien beziffert.
  const wurzel = mkdtempSync(path.join(os.tmpdir(), "waechter-tuev-ohnegit-"));
  mkdirSync(path.join(wurzel, "public"), { recursive: true });
  writeFileSync(path.join(wurzel, "public/zu-lang.js"), langeDatei(900));
  legeSkripteBei(wurzel, ["scripts/check-guidelines.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-guidelines.mjs");
    const stillGruen = code === 0 && /0 Dateien/.test(ausgabe);
    assert.equal(stillGruen, false,
      `Ohne git darf nicht "0 Dateien geprueft" + Exit 0 herauskommen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-precache-imports schlaegt bei einem Modul ohne Precache-Eintrag an", () => {
  const wurzel = baueProbeRepo({
    // Zeilenweise, wie im echten sw.js: der Pruefer liest das Array mit einem
    // zeilenbasierten Muster. Einzeilig faende er NICHTS und waere still.
    "public/sw.js": 'const SHELL = [\n  "/assets/vorhanden.js",\n];',
    "public/index.html": '<script type="module" src="/assets/fehlt.js"></script>',
    "public/vorhanden.js": "export const a = 1;",
    "public/fehlt.js": "export const b = 2;"
  });
  legeSkripteBei(wurzel, ["scripts/check-precache-imports.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-precache-imports.mjs");
    assert.notEqual(code, 0, "ein nicht vorgeladenes Modul macht die App offline tot — muss auffallen");
    assert.match(ausgabe, /fehlt\.js/, "die Luecke muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-precache-imports schweigt, wenn alles vorgeladen ist", () => {
  const wurzel = baueProbeRepo({
    "public/sw.js": 'const SHELL = [\n  "/assets/vorhanden.js",\n];',
    "public/index.html": '<script type="module" src="/assets/vorhanden.js"></script>',
    "public/vorhanden.js": "export const a = 1;"
  });
  legeSkripteBei(wurzel, ["scripts/check-precache-imports.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-precache-imports.mjs");
    assert.equal(code, 0, `vollstaendiger Precache darf nicht anschlagen. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

// --- check-memory-bank ------------------------------------------------------
// Memory_Bank.md ist die einzige Datei, die von selbst waechst; ihr Waechter
// muss deshalb BEIDE Fehlerarten aushalten. Besonders die "LAUT"-Faelle sind
// hier echt: beim ersten Lauf gegen die Produktivdatei meldete er zweimal
// falschen Alarm (ein Archiv im Projektstamm und einen IDrive-e2-Schluessel,
// der im Repo nie existiert). Beide Faelle stehen jetzt als Probe darunter.

/** Baut eine Memory_Bank-Probe mit gewuenschter Zeilenzahl und Verweisen. */
function memoryBank({ zeilen = 50, verweise = [], kopfzeilen = [] } = {}) {
  const block = [...kopfzeilen];
  verweise.forEach((pfad, i) => {
    block.push(`### [2026-08-23] Eintrag ${i} ausgelagert`, "", `Volltext: \`${pfad}\`.`, "");
  });
  while (block.length < zeilen) block.push(`Zeile ${block.length} mit Fliesstext.`);
  return block.slice(0, zeilen).join("\n") + "\n";
}

const ZWOELF_ZIELE = Array.from({ length: 12 }, (_, i) => `docs/memory/teil-${i}.md`);
/** Die Zieldateien, damit die Verweise nicht tot sind. */
const zieleAnlegen = (pfade) => Object.fromEntries(pfade.map((p) => [p, "# Volltext\n"]));

test("check-memory-bank schlaegt ueber 800 Zeilen an", () => {
  const wurzel = baueProbeRepo({
    "Memory_Bank.md": memoryBank({ zeilen: 850, verweise: ZWOELF_ZIELE }),
    ...zieleAnlegen(ZWOELF_ZIELE)
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.notEqual(code, 0, "850 Zeilen verletzen die 800-Zeilen-Regel — muss auffallen");
    assert.match(ausgabe, /850 Zeilen/, "die gemessene Zahl muss in der Meldung stehen");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank findet den toten Verweis — der eigentliche Datenverlust", () => {
  // Das ist der gefaehrliche Fall: die Kurzfassung sieht vollstaendig aus,
  // aber der Volltext liegt nirgends. Ohne diesen Test faellt es niemandem auf.
  const wurzel = baueProbeRepo({
    "Memory_Bank.md": memoryBank({ zeilen: 60, verweise: ["docs/memory/nie-angelegt.md"] }),
    "docs/memory/platzhalter.md": "# damit es den Ordner docs/ gibt\n"
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.notEqual(code, 0, "ein Verweis ins Leere ist verlorener Inhalt — muss auffallen");
    assert.match(ausgabe, /nie-angelegt\.md/, "der tote Pfad muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank schlaegt an, wenn eine Auslagerung keinen Pfad nennt", () => {
  const wurzel = baueProbeRepo({
    "Memory_Bank.md":
      "### [2026-08-23] Grosser Eintrag\n\nVolltext wurde ausgelagert.\n\nMehr steht nicht da.\n"
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.notEqual(code, 0, "'ausgelagert' ohne Ziel ist eine leere Zusage");
    assert.match(ausgabe, /Grosser Eintrag/, "der schuldige Abschnitt muss benannt werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank meldet sich selbst, wenn sein Suchmuster nichts mehr findet", () => {
  // Der Pruefer-fuer-Pruefer-Fall: eine grosse Bank ohne einen einzigen
  // erkannten Verweis heisst entweder "alle Auslagerungen sind weg" oder
  // "das Muster passt nicht mehr". Beides darf nicht gruen sein.
  const wurzel = baueProbeRepo({ "Memory_Bank.md": memoryBank({ zeilen: 400 }) });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.notEqual(code, 0, "400 Zeilen ohne jeden Verweis duerfen nicht gruen sein");
    assert.match(ausgabe, /Selbstpruefung/, "der Waechter muss sich selbst als Verdaechtigen nennen");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank schweigt bei einer gesunden Bank", () => {
  const wurzel = baueProbeRepo({
    "Memory_Bank.md": memoryBank({ zeilen: 700, verweise: ZWOELF_ZIELE }),
    ...zieleAnlegen(ZWOELF_ZIELE)
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.equal(code, 0, `700 Zeilen mit gueltigen Verweisen duerfen nicht anschlagen. Ausgabe: ${ausgabe}`);
    assert.doesNotMatch(ausgabe, /WARNUNG/, "700 liegt unter der Warnschwelle 760");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank warnt vor der Grenze, blockiert aber nicht", () => {
  // Der Kern des Rueckfallschutzes: die Meldung kommt VOR der Grenze. Sie darf
  // die Arbeit der Parallelsitzungen nicht anhalten — darum Exit 0.
  const wurzel = baueProbeRepo({
    "Memory_Bank.md": memoryBank({ zeilen: 780, verweise: ZWOELF_ZIELE }),
    ...zieleAnlegen(ZWOELF_ZIELE)
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.equal(code, 0, `die Warnung darf niemanden blockieren. Ausgabe: ${ausgabe}`);
    assert.match(ausgabe, /WARNUNG/, "bei 780 von 800 muss eine Warnung kommen");
    assert.match(ausgabe, /noch 20/, "die verbleibende Luft muss beziffert werden");
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank haelt einen IDrive-e2-Schluessel nicht fuer eine Repo-Datei", () => {
  // Falscher Alarm beim ersten Produktivlauf: `admin/index/analytik-tage.json`
  // ist ein Objektschluessel, keine Datei im Repo. Ein Waechter, der so etwas
  // meldet, erzeugt Arbeit, die es nicht gibt — und wird bald ignoriert.
  const wurzel = baueProbeRepo({
    "Memory_Bank.md":
      memoryBank({ zeilen: 60, verweise: ["docs/memory/echt.md"] }) +
      "\nEin abgeleitetes Objekt `admin/index/analytik-tage.json` auf IDrive e2.\n",
    "docs/memory/echt.md": "# Volltext\n"
  });
  legeSkripteBei(wurzel, ["scripts/check-memory-bank.mjs"]);
  try {
    const { code, ausgabe } = laufeWaechter(wurzel, "scripts/check-memory-bank.mjs");
    assert.equal(code, 0, `ein Objektspeicher-Schluessel ist kein toter Verweis. Ausgabe: ${ausgabe}`);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("check-memory-bank prueft auch Archive im Projektstamm", () => {
  // Zweiter falscher Alarm beim ersten Lauf: das Archiv liegt NICHT unter
  // docs/, sondern im Stamm. Der Markdown-Link muss trotzdem geprueft werden —
  // sonst waere ausgerechnet die groesste Auslagerung ungedeckt.
  const mitLink = "## Aeltere Eintraege\n\nStehen in [Archiv.md](Archiv.md).\n";
  const gesund = baueProbeRepo({ "Memory_Bank.md": mitLink, "Archiv.md": "# Archiv\n" });
  const krank = baueProbeRepo({ "Memory_Bank.md": mitLink });
  legeSkripteBei(gesund, ["scripts/check-memory-bank.mjs"]);
  legeSkripteBei(krank, ["scripts/check-memory-bank.mjs"]);
  try {
    assert.equal(laufeWaechter(gesund, "scripts/check-memory-bank.mjs").code, 0,
      "vorhandenes Archiv im Stamm ist in Ordnung");
    const { code, ausgabe } = laufeWaechter(krank, "scripts/check-memory-bank.mjs");
    assert.notEqual(code, 0, "fehlendes Archiv im Stamm muss auffallen");
    assert.match(ausgabe, /Archiv\.md/, "der tote Pfad muss benannt werden");
  } finally {
    rmSync(gesund, { recursive: true, force: true });
    rmSync(krank, { recursive: true, force: true });
  }
});

test("check-no-private-paths schlaegt bei einer echten file-URL an, nicht beim Schema-Zitat", () => {
  // Falscher Alarm 2026-08-25: die Capsule job_modelle_medien_20260818 zitiert
  // den Code-String "'file://' + argv[1]" als Lehre. Das blosse Schema ist kein
  // privater Pfad — eine file-URL MIT Pfad dahinter bleibt verboten.
  const krank = baueProbeRepo({ "docs/leck.md": "Siehe file:///Users/jemand/geheim.txt\n" });
  const gesund = baueProbeRepo({ "docs/lehre.md": "import.meta.url === 'file://' + argv[1] ist hier immer falsch.\n" });
  legeSkripteBei(krank, ["scripts/check-no-private-paths.mjs", "scripts/validation-utils.mjs"]);
  legeSkripteBei(gesund, ["scripts/check-no-private-paths.mjs", "scripts/validation-utils.mjs"]);
  try {
    const kaputt = laufeWaechter(krank, "scripts/check-no-private-paths.mjs");
    assert.notEqual(kaputt.code, 0, "file:///Users/... muss auffallen — sonst ist der Waechter blind");
    assert.match(kaputt.ausgabe, /leck\.md/, "die schuldige Datei muss benannt werden");
    const zitat = laufeWaechter(gesund, "scripts/check-no-private-paths.mjs");
    assert.equal(zitat.code, 0, `das Schema-Zitat ohne Pfad darf nicht anschlagen. Ausgabe: ${zitat.ausgabe}`);
  } finally {
    rmSync(krank, { recursive: true, force: true });
    rmSync(gesund, { recursive: true, force: true });
  }
});
