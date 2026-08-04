// smejj.com — Die beiden Dateisperren (Startseite + sicherheitskritische Dateien).
//
// Freigabe des Betreibers vom 2026-08-04: den Change-Lock auf Anmeldeseiten,
// account-sessions.js, chat-history-context.js, chat-bridge.js und
// fetch-retry.js ausweiten, "byte-genau einfrieren wie die Startseite".
//
// Eine Sperre ist nur so viel wert wie ihr Anschlagen. Beim Bau ist genau das
// schiefgegangen: der Einstiegspunkt verglich `import.meta.url` mit
// `"file://" + process.argv[1]`. Unter einem Pfad MIT Leerzeichen (dieses
// Projekt liegt in Google Drive) trifft das nie zu — das Skript tat gar nichts
// und meldete Exitcode 0. Ein Schutz, der niemals anschlaegt, ist schlimmer als
// kein Schutz, weil er Sicherheit vortaeuscht. Darum pruefen diese Tests die
// Sperren als PROZESS, nicht nur ihren Quelltext.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROTECTED_FILES as SECURITY_FILES, SECURITY_LOCK } from "../scripts/check-security-lock.mjs";

// Die Startseiten-Liste wird NICHT aus dem Skript importiert: check-start-lock.mjs
// ist digest-gepinnt (siehe unten) und exportiert bewusst nichts. Massgeblich ist
// ohnehin das eingefrorene Manifest — das ist der Stand, der wirklich gilt.
const START_FILES = Object.keys(
  JSON.parse(fs.readFileSync("docs/frontend/start-lock-manifest.json", "utf8")).files
);

/** Ruft eine Sperre als echten Prozess auf und liefert Ausgabe plus Exitcode. */
function sperreAufrufen(skript, args = []) {
  try {
    const stdout = execFileSync("node", [skript, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, ausgabe: stdout };
  } catch (fehler) {
    return { code: fehler.status ?? 1, ausgabe: `${fehler.stdout || ""}${fehler.stderr || ""}` };
  }
}

test("beide Sperren melden sich ueberhaupt — kein stiller Exitcode 0", () => {
  // Der Fehler beim Bau: kein Wort Ausgabe, Exitcode 0, Schutz nur auf dem
  // Papier. Eine leere Ausgabe ist deshalb selbst ein Fehler.
  for (const skript of ["scripts/check-start-lock.mjs", "scripts/check-security-lock.mjs"]) {
    const { ausgabe } = sperreAufrufen(skript);
    assert.ok(ausgabe.trim().length > 0, `${skript} gibt nichts aus — laeuft der Einstiegspunkt?`);
  }
});

test("beide Sperren sind aktuell erfuellt", () => {
  for (const skript of ["scripts/check-start-lock.mjs", "scripts/check-security-lock.mjs"]) {
    const { code, ausgabe } = sperreAufrufen(skript);
    assert.equal(code, 0, `${skript} ist verletzt:\n${ausgabe}`);
    assert.match(ausgabe, /OK —/, `${skript} meldet keinen OK-Stand`);
  }
});

test("eine geaenderte Datei schlaegt an und wird namentlich genannt", () => {
  // Die eigentliche Zusicherung: der Schutz merkt es und sagt WAS.
  const opfer = "public/account-sessions.js";
  const original = fs.readFileSync(opfer);
  try {
    fs.appendFileSync(opfer, "\n// Probe der Sperre\n");
    const { code, ausgabe } = sperreAufrufen("scripts/check-security-lock.mjs");
    assert.equal(code, 1, "eine Aenderung MUSS den Lauf fehlschlagen lassen");
    assert.match(ausgabe, /VERLETZT \(1\)/);
    assert.match(ausgabe, new RegExp(`${opfer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: VERAENDERT`));
    assert.match(ausgabe, /ausdruecklicher schriftlicher Bestaetigung/);
  } finally {
    fs.writeFileSync(opfer, original);
  }
  assert.equal(sperreAufrufen("scripts/check-security-lock.mjs").code, 0,
    "nach dem Zuruecksetzen muss die Sperre wieder erfuellt sein");
});

test("Einfrieren ohne schriftliche Bestaetigung wird verweigert", () => {
  const { code, ausgabe } = sperreAufrufen("scripts/check-security-lock.mjs", ["--freeze"]);
  assert.equal(code, 1);
  assert.match(ausgabe, /FREEZE VERWEIGERT/);
  // Auch ein zu kurzer Text darf nicht durchgehen.
  assert.equal(sperreAufrufen("scripts/check-security-lock.mjs", ["--freeze", "--confirm", "ok"]).code, 1);
});

test("die beiden Sperren teilen sich KEINE Datei", () => {
  // Zwei Sperren auf derselben Datei waeren zwei Wahrheiten: wer die eine
  // einfriert, laesst die andere rot zurueck.
  const doppelt = SECURITY_FILES.filter((f) => START_FILES.includes(f));
  assert.deepEqual(doppelt, [], `in beiden Listen: ${doppelt.join(", ")}`);
});

test("die Sicherheitssperre deckt genau die freigegebenen Bereiche ab", () => {
  for (const pflicht of [
    "public/auth/login/index.html",
    "public/auth/register/index.html",
    "public/auth/auth-page.js",
    "public/account-sessions.js",
    "public/chat-history-context.js",
    "public/chat-bridge.js",
    "public/ai/fetch-retry.js"
  ]) {
    assert.ok(SECURITY_FILES.includes(pflicht), `${pflicht} fehlt in der Sicherheitssperre`);
  }
  for (const datei of SECURITY_FILES) {
    assert.ok(fs.existsSync(datei), `${datei} steht in der Liste, existiert aber nicht`);
  }
});

test("getrennte Manifeste — ein Einfrieren fasst die andere Sperre nicht an", () => {
  // Der Grund fuer zwei Manifeste: der Start-Lock wird bei jedem
  // sw.js-Sprung neu eingefroren. Laege alles in einem Manifest, wuerde das
  // jede Aenderung an einem Passwortfeld still mit absegnen.
  const start = JSON.parse(fs.readFileSync("docs/frontend/start-lock-manifest.json", "utf8"));
  assert.notEqual(SECURITY_LOCK.manifestPath, "docs/frontend/start-lock-manifest.json");
  for (const datei of SECURITY_FILES) {
    assert.ok(!(datei in start.files), `${datei} steht auch im Startseiten-Manifest`);
  }
});

test("das Manifest haelt den Wortlaut der Freigabe fest", () => {
  const manifest = JSON.parse(fs.readFileSync(SECURITY_LOCK.manifestPath, "utf8"));
  assert.ok(manifest.confirmation && manifest.confirmation.length >= 10,
    "ohne festgehaltenen Wortlaut ist nicht nachvollziehbar, wer was erlaubt hat");
  assert.equal(Object.keys(manifest.files).length, SECURITY_FILES.length);
  assert.ok(manifest.frozenAt, "Zeitpunkt fehlt");
});

test("der Einstiegspunkt haelt auch Pfaden mit Leerzeichen stand", async () => {
  // Reproduktion des Baufehlers: ein Skript in einem Ordner MIT Leerzeichen
  // muss trotzdem laufen. Genau daran ist der naive Vergleich gescheitert.
  const { istDirektAufgerufen } = await import("../scripts/lib/datei-sperre.mjs");
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "smejj sperre "));
  const skript = path.join(ordner, "probe.mjs");
  fs.writeFileSync(skript, [
    'import { istDirektAufgerufen } from ' + JSON.stringify(path.resolve("scripts/lib/datei-sperre.mjs")) + ';',
    'console.log(istDirektAufgerufen(import.meta.url) ? "DIREKT" : "NICHT");'
  ].join("\n"));
  try {
    const ausgabe = execFileSync("node", [skript], { encoding: "utf8" });
    assert.match(ausgabe, /DIREKT/, "im Pfad mit Leerzeichen erkennt sich das Skript nicht selbst");
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
  assert.equal(typeof istDirektAufgerufen, "function");
});

test("check-start-lock.mjs bleibt digest-gepinnt — die Doppelung ist Absicht", () => {
  // Beim Bau der zweiten Sperre lag es nahe, beide auf eine gemeinsame Mechanik
  // umzustellen. Das schlug fehl, und zwar zu Recht: check-start-lock.mjs ist
  // eine der digest-gepinnten Dateien der Modell-Freigabe (immutable, nicht
  // ueberschreibbar). Die Pins verhindern, dass jemand die Pruefungen still
  // umschreibt. Wer hier "aufraeumt", bricht eine Manipulationssperre.
  const suite = JSON.parse(fs.readFileSync(
    "idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json", "utf8"));
  const gepinnt = suite.execution.protectedAssets.map((a) => a.path);
  assert.ok(gepinnt.includes("scripts/check-start-lock.mjs"),
    "der Start-Lock muss digest-gepinnt bleiben");
  assert.equal(suite.immutable, true);
  assert.equal(suite.protection.overwriteAllowed, false);
  // Die neue Mechanik darf NICHT im Start-Lock landen, solange der Pin gilt.
  const startSkript = fs.readFileSync("scripts/check-start-lock.mjs", "utf8");
  assert.ok(!/datei-sperre\.mjs/.test(startSkript),
    "check-start-lock.mjs darf die gemeinsame Mechanik nicht importieren, solange sein Digest gepinnt ist");
});
