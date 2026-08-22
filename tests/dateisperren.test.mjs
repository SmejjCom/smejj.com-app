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
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROTECTED_FILES as SECURITY_FILES, SECURITY_LOCK } from "../scripts/check-security-lock.mjs";
import { PROTECTED_FILES as DEPLOY_FILES } from "../scripts/check-deploy-lock.mjs";
import { PROTECTED_FILES as ADMIN_FILES } from "../scripts/check-admin-lock.mjs";

// Alle Sperren, die als echter Prozess anschlagen muessen. Neue Sperre? Hier
// eintragen — sonst ist sie ungeprueft, und eine ungeprueft Sperre ist genau
// das, was am 2026-08-04 lautlos gar nichts tat.
const ALLE_SPERREN = [
  "scripts/check-start-lock.mjs",
  "scripts/check-security-lock.mjs",
  "scripts/check-deploy-lock.mjs",
  "scripts/check-admin-lock.mjs",
  "scripts/check-abo-lock.mjs",
  // Der Auslieferungs-Waechter (2026-08-22): alle Sperren oben bewachen nur
  // public/, die App laedt aber aus /assets/. Er prueft die Gleichheit.
  "scripts/check-auslieferung-lock.mjs"
];

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

test("alle Sperren melden sich ueberhaupt — kein stiller Exitcode 0", () => {
  // Der Fehler beim Bau: kein Wort Ausgabe, Exitcode 0, Schutz nur auf dem
  // Papier. Eine leere Ausgabe ist deshalb selbst ein Fehler.
  for (const skript of ALLE_SPERREN) {
    const { ausgabe } = sperreAufrufen(skript);
    assert.ok(ausgabe.trim().length > 0, `${skript} gibt nichts aus — laeuft der Einstiegspunkt?`);
  }
});

test("alle Sperren sind aktuell erfuellt", () => {
  for (const skript of ALLE_SPERREN) {
    const { code, ausgabe } = sperreAufrufen(skript);
    assert.equal(code, 0, `${skript} ist verletzt:\n${ausgabe}`);
    assert.match(ausgabe, /OK —/, `${skript} meldet keinen OK-Stand`);
  }
});

test("die Deploy-Sperre schlaegt bei einer geaenderten Spiegel-Datei an", () => {
  // Dieselbe Zusicherung wie unten fuer den Security-Lock, nur fuer die dritte
  // Sperre: der Schutz muss MERKEN und die Datei NENNEN. Genau hier war der
  // Bau-Fehler von 2026-08-04 (Exitcode 0 ohne jede Ausgabe) — deshalb wird
  // jede neue Sperre als echter Prozess geprueft, nicht am Quelltext.
  const opfer = "scripts/deploy/codeberg_spiegel_sync.sh";
  const original = fs.readFileSync(opfer);
  try {
    fs.appendFileSync(opfer, "\n# Testaenderung\n");
    const { code, ausgabe } = sperreAufrufen("scripts/check-deploy-lock.mjs");
    assert.equal(code, 1, "geaenderte Spiegel-Datei muss die Sperre ausloesen");
    assert.match(ausgabe, /VERLETZT/, "die Sperre muss die Verletzung benennen");
    assert.match(ausgabe, /codeberg_spiegel_sync\.sh/, "die betroffene Datei muss genannt werden");
  } finally {
    fs.writeFileSync(opfer, original);
  }
  const { code } = sperreAufrufen("scripts/check-deploy-lock.mjs");
  assert.equal(code, 0, "nach dem Zuruecksetzen muss die Sperre wieder erfuellt sein");
});

test("der Auslieferungs-Waechter schlaegt an, wo die anderen Sperren blind sind", () => {
  // Die eigentliche Zusicherung, und zugleich der Beweis fuer die Luecke:
  // eine verstellte AUSLIEFERUNG bei unberuehrter Quelle. Der Start-Lock
  // meldet dabei weiter OK — er sieht die Kopie gar nicht.
  const opfer = "public/assets/eckig.css";
  const original = fs.readFileSync(opfer);
  try {
    fs.appendFileSync(opfer, "\n/* Probe der Auslieferungs-Sperre */\n");
    const { code, ausgabe } = sperreAufrufen("scripts/check-auslieferung-lock.mjs");
    assert.equal(code, 1, "eine verstellte Auslieferung MUSS fehlschlagen");
    assert.match(ausgabe, /VERLETZT \(1\)/);
    assert.match(ausgabe, /public\/assets\/eckig\.css/);
    assert.match(ausgabe, /build:assets/, "die Heilung muss dabeistehen");
    // Der Nachweis der Luecke: die Quelle ist unberuehrt, also schweigt
    // der Start-Lock.
    assert.equal(sperreAufrufen("scripts/check-start-lock.mjs").code, 0,
      "der Start-Lock sieht die Auslieferung nicht — genau darum gibt es diesen Waechter");
  } finally {
    fs.writeFileSync(opfer, original);
  }
  assert.equal(sperreAufrufen("scripts/check-auslieferung-lock.mjs").code, 0,
    "nach dem Zuruecksetzen muss der Waechter wieder gruen sein");
});

test("Auslieferung und Sync teilen EINE Ausnahmeliste", async () => {
  // Zwei getrennte Listen wuerden auseinanderlaufen: der Waechter wuerde dann
  // "npm run build:assets" empfehlen fuer Dateien, die der Sync gar nicht
  // anfasst. Beim ersten Lauf ist genau das passiert (chat-bridge.js).
  const waechter = await import("../scripts/check-auslieferung-lock.mjs");
  const sync = await import("../scripts/build/sync-assets.mjs");
  const quelle = fs.readFileSync("scripts/check-auslieferung-lock.mjs", "utf8");
  assert.match(quelle, /import \{ AUSNAHMEN \} from "\.\/build\/sync-assets\.mjs"/,
    "der Waechter muss die Ausnahmen des Sync importieren, nicht nachbauen");
  assert.ok(Object.keys(sync.AUSNAHMEN).length > 0);
  assert.ok(typeof waechter.pruefe === "function");
});

test("die vier Sperren teilen sich keine Datei — sonst gaebe es zwei Wahrheiten", () => {
  // Eine Datei unter zwei Manifesten hiesse: zwei Stellen, die sie freigeben
  // koennen, und zwei Staende, die auseinanderlaufen duerfen.
  const deployFiles = DEPLOY_FILES;
  for (const datei of deployFiles) {
    assert.ok(!START_FILES.includes(datei), `${datei} liegt schon im Start-Lock`);
    assert.ok(!SECURITY_FILES.includes(datei), `${datei} liegt schon im Security-Lock`);
  }
  for (const datei of ADMIN_FILES) {
    assert.ok(!START_FILES.includes(datei), `${datei} liegt schon im Start-Lock`);
    assert.ok(!SECURITY_FILES.includes(datei), `${datei} liegt schon im Security-Lock`);
    assert.ok(!deployFiles.includes(datei), `${datei} liegt schon im Deploy-Lock`);
  }
});

test("die Admin-Sperre schlaegt am Step-up an und nennt die Datei", () => {
  // Der Step-up ist die juengste Schutzschicht des Adminbereichs. Wer sein
  // Zeitfenster still aufdreht, hebt ihn auf, ohne dass eine Zeile fehlt —
  // genau dafuer ist die Sperre da.
  const opfer = "control-server/src/admin/stepUp.js";
  const original = fs.readFileSync(opfer);
  try {
    fs.appendFileSync(opfer, "\n// Probe der Sperre\n");
    const { code, ausgabe } = sperreAufrufen("scripts/check-admin-lock.mjs");
    assert.equal(code, 1, "eine Aenderung MUSS den Lauf fehlschlagen lassen");
    assert.match(ausgabe, /VERLETZT \(1\)/);
    assert.match(ausgabe, new RegExp(`${opfer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: VERAENDERT`));
  } finally {
    fs.writeFileSync(opfer, original);
  }
  assert.equal(sperreAufrufen("scripts/check-admin-lock.mjs").code, 0,
    "nach dem Zuruecksetzen muss die Sperre wieder erfuellt sein");
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

  // Und der Digest muss auch STIMMEN. Bis zum 2026-08-22 prueft dieser Test
  // nur, DASS ein Eintrag existiert — nicht, ob die Datei noch dazu passt.
  // Am selben Tag wurde check-start-lock.mjs erweitert und der Pin dabei
  // gebrochen; die ganze Suite blieb gruen und meldete weiter
  // "bleibt digest-gepinnt". Ein Pin, dessen Bruch niemand bemerkt, ist
  // Dekoration. Gleiche Familie wie der Fokusring-Test in
  // konto-formulare.test.mjs: die Zusicherung stand im Namen, gerechnet
  // hat sie niemand.
  const eintrag = suite.execution.protectedAssets.find((a) => a.path === "scripts/check-start-lock.mjs");
  if (eintrag?.sha256) {
    const ist = createHash("sha256").update(fs.readFileSync("scripts/check-start-lock.mjs")).digest("hex");
    assert.equal(ist, eintrag.sha256,
      "check-start-lock.mjs weicht vom gepinnten Digest ab — die Datei ist immutable (overwriteAllowed: false); Aenderungen gehoeren DANEBEN, nicht hinein");
  }
  assert.equal(suite.immutable, true);
  assert.equal(suite.protection.overwriteAllowed, false);
  // Die neue Mechanik darf NICHT im Start-Lock landen, solange der Pin gilt.
  const startSkript = fs.readFileSync("scripts/check-start-lock.mjs", "utf8");
  assert.ok(!/datei-sperre\.mjs/.test(startSkript),
    "check-start-lock.mjs darf die gemeinsame Mechanik nicht importieren, solange sein Digest gepinnt ist");
});
