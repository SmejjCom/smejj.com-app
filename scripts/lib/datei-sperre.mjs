// smejj.com — Byte-genaue Dateisperre (Mechanik der Sicherheitssperre).
//
// Warum dieses Modul existiert (2026-08-04): Mit der Betreiber-Freigabe kam eine
// ZWEITE Sperre dazu (scripts/check-security-lock.mjs). Sie nutzt diese Mechanik.
//
// WARUM check-start-lock.mjs sie NICHT nutzt — bitte nicht "aufraeumen":
// Der erste Entwurf hat den Start-Lock auf dieses Modul umgestellt. Das schlug
// fehl, und zwar zu Recht: `scripts/check-start-lock.mjs` ist eine von 19
// digest-gepinnten Dateien in
// `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json`
// (immutable: true, overwriteAllowed: false). Diese Pins existieren, damit
// niemand die Pruefungen still umschreiben kann, waehrend eine Modell-Freigabe
// laeuft. Ein Refactoring dort haette den Digest gebrochen — und den Digest
// nachzuziehen, um das eigene Refactoring durchzubekommen, waere genau die
// Manipulation, gegen die der Pin gebaut ist.
//
// Die Doppelung ist also KEIN Versehen, sondern der Preis einer
// Manipulationssperre. Wer hier etwas aendert, aendert es NICHT automatisch im
// Start-Lock — und darf das auch nicht ohne die dortige Freigabe.
//
// Warum ZWEI Manifeste und nicht eine gemeinsame Liste — das ist der Kern:
// Der Start-Lock wird oft neu eingefroren (allein am 2026-08-03/04 mehrfach,
// jedes Mal wegen eines sw.js-Versionssprungs). Laegen die Sicherheitsdateien
// im selben Manifest, wuerde JEDES dieser Einfrieren auch eine Aenderung an
// account-sessions.js oder den Anmeldeseiten still mit absegnen — der Schutz
// waere ein Selbstlaeufer. Getrennte Manifeste heisst: wer die Startseite
// einfriert, fasst die Sicherheitsdateien nicht an, und umgekehrt.
//
// Fail-closed: jede Abweichung beendet den Lauf mit Exit-Code 1. Ohne
// --confirm-Text verweigert --freeze den Dienst.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @typedef {object} SperrKonfiguration
 * @property {string} name        Kennung in jeder Ausgabe, z. B. "start-lock"
 * @property {string} manifestPath
 * @property {string} backupRoot
 * @property {string} skriptPfad  fuer den Hinweis, wie neu eingefroren wird
 * @property {string} lockLabel   Beschriftung im Manifest
 * @property {string} rule        Regel im Klartext, wandert ins Manifest
 * @property {string} betreff     "Startseite ist 100% geschuetzt"
 * @property {string} sammelname  "Startseiten-Dateien" (fuer die OK-Meldung)
 * @property {string[]} files
 */

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function collectHashes(files) {
  const result = {};
  for (const file of files) result[file] = existsSync(file) ? sha256(file) : "FEHLT";
  return result;
}

/** Friert den aktuellen Stand ein. Verweigert ohne schriftliche Bestaetigung. */
export function freeze(konfiguration, confirmText) {
  const { name, manifestPath, backupRoot, lockLabel, rule, files } = konfiguration;
  if (!confirmText || confirmText.trim().length < 10) {
    console.error(`${name} FREEZE VERWEIGERT: --confirm "<schriftliche Bestaetigung des Nutzers>" ist Pflicht.`);
    process.exit(1);
  }
  const hashes = collectHashes(files);
  const missing = Object.entries(hashes).filter(([, hash]) => hash === "FEHLT");
  if (missing.length > 0) {
    console.error(`${name} FREEZE VERWEIGERT: geschuetzte Dateien fehlen: ${missing.map(([f]) => f).join(", ")}`);
    process.exit(1);
  }
  const manifest = {
    lock: lockLabel,
    frozenAt: new Date().toISOString(),
    confirmation: confirmText.trim(),
    rule,
    files: hashes
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const backupDir = path.join(backupRoot, manifest.frozenAt.replace(/[:.]/g, "-"));
  if (existsSync(backupDir)) {
    console.error(`${name} FREEZE VERWEIGERT: Backup-Ziel existiert bereits: ${backupDir}`);
    process.exit(1);
  }
  for (const file of files) {
    const target = path.join(backupDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  writeFileSync(path.join(backupDir, path.basename(manifestPath)), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${name} eingefroren: ${files.length} Dateien, Manifest ${manifestPath}, Backup ${backupDir}/`);
}

/** Prueft den aktuellen Stand gegen das Manifest. Exit 1 bei jeder Abweichung. */
export function check(konfiguration) {
  const { name, manifestPath, skriptPfad, betreff, sammelname, files } = konfiguration;
  if (!existsSync(manifestPath)) {
    console.error(`${name} FEHLER: Manifest ${manifestPath} fehlt. Einfrieren erfordert schriftliche Bestaetigung (--freeze --confirm).`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const current = collectHashes(files);
  const violations = [];
  for (const [file, frozenHash] of Object.entries(manifest.files)) {
    const actual = current[file] || "FEHLT";
    if (actual !== frozenHash) violations.push(`${file}: ${actual === "FEHLT" ? "GELOESCHT" : "VERAENDERT"}`);
  }
  // Eine NEU in die Liste aufgenommene Datei steht noch nicht im Manifest. Das
  // ist keine Verletzung, aber sie waere ungeschuetzt — darum sichtbar machen.
  const unfrozen = files.filter((file) => !(file in manifest.files));
  if (violations.length > 0) {
    console.error(`${name} VERLETZT (${violations.length}) — ${betreff} (eingefroren ${manifest.frozenAt}):`);
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error("Aenderungen sind NUR mit ausdruecklicher schriftlicher Bestaetigung des Nutzers erlaubt.");
    console.error("Mit vorliegender Bestaetigung: alle Checks gruen bekommen, dann");
    console.error(`  node ${skriptPfad} --freeze --confirm "<Wortlaut>"`);
    process.exit(1);
  }
  if (unfrozen.length > 0) {
    console.error(`${name} FEHLER: neu geschuetzte Dateien stehen noch nicht im Manifest: ${unfrozen.join(", ")}`);
    console.error(`Mit schriftlicher Bestaetigung einfrieren: node ${skriptPfad} --freeze --confirm "<Wortlaut>"`);
    process.exit(1);
  }
  console.log(`${name} OK — ${Object.keys(manifest.files).length} ${sammelname} byte-identisch zum eingefrorenen Stand (${manifest.frozenAt}).`);
}

/** Einstiegspunkt fuer die duennen Skripte: entscheidet zwischen freeze und check. */
export function runLockCli(konfiguration, argv = process.argv.slice(2)) {
  if (argv.includes("--freeze")) {
    const index = argv.indexOf("--confirm");
    freeze(konfiguration, index >= 0 ? argv[index + 1] : "");
    return;
  }
  check(konfiguration);
}

/**
 * Wurde dieses Modul direkt als Skript aufgerufen?
 *
 * Drei Fallen, alle am 2026-08-04 einzeln hereingefallen:
 *   1. NICHT `import.meta.url === "file://" + process.argv[1]` vergleichen.
 *      argv[1] ist der ROHE Aufrufpfad (meist relativ), import.meta.url dagegen
 *      absolut. Der Vergleich schlug still fehl: das Skript tat nichts und
 *      endete mit Exitcode 0 — ein Schutz, der niemals anschlaegt.
 *   2. Prozentkodierung: dieses Projekt liegt unter einem Pfad MIT Leerzeichen
 *      (Google Drive). pathToFileURL kodiert sie, ein selbstgebautes
 *      "file://" + Pfad nicht.
 *   3. Symlinks: macOS loest /var zu /private/var auf. import.meta.url traegt
 *      den echten Pfad, path.resolve(argv[1]) nicht. Darum realpathSync.
 *
 * @param {string} moduleUrl import.meta.url des aufrufenden Skripts
 * @returns {boolean}
 */
export function istDirektAufgerufen(moduleUrl) {
  if (!process.argv[1]) return false;
  let aufrufpfad = path.resolve(process.argv[1]);
  try {
    aufrufpfad = realpathSync(aufrufpfad);
  } catch {
    // Existiert der Pfad nicht (mag es geben), zaehlt der aufgeloeste Name.
  }
  return moduleUrl === pathToFileURL(aufrufpfad).href;
}
