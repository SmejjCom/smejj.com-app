// smejj.com — Waechter-TUEV fuer scripts/check/github_kostenfrei.sh
//
// WARUM ES DIESE TESTS GIBT (2026-08-15): Der Waechter entschied "privates
// Repo, also blocken" anhand einer FESTEN NAMENSLISTE mit einem einzigen
// Eintrag (smejj-app-frontend). Inzwischen sind smejj.com-app, smejj-control,
// smejj-site und imild-site ebenfalls oeffentlich — die Liste wurde nie
// nachgezogen. Der Waechter blockierte damit einen Workflow, der nachweislich
// nichts kostet, und nannte als Grund "privates Repo". Die Sichtbarkeit wird
// jetzt gemessen; diese Tests halten beide Richtungen fest.
//
// Alle Proben laufen OHNE Netz: ein temporaeres Repo ohne origin-Remote kann
// nicht als oeffentlich erkannt werden, also greift zuverlaessig die volle
// Pruefung. Genau das ist auch das gewuenschte Offline-Verhalten.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PRUEFER = path.resolve("scripts/check/github_kostenfrei.sh");

/** Legt ein Wegwerf-Repo an und liefert seinen Pfad. */
function repoBauen({ remote = null, workflow = false } = {}) {
  const wurzel = mkdtempSync(path.join(tmpdir(), "smejj-kostenwaechter-"));
  execFileSync("git", ["init", "-q", wurzel]);
  if (remote) execFileSync("git", ["-C", wurzel, "remote", "add", "origin", remote]);
  if (workflow) {
    mkdirSync(path.join(wurzel, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(wurzel, ".github", "workflows", "probe.yml"), "name: Probe\non: {}\n");
  }
  return wurzel;
}

/** Fuehrt den Waechter aus; liefert Exit-Code und Ausgabe statt zu werfen. */
function pruefen(wurzel, env = {}) {
  try {
    const ausgabe = execFileSync("sh", [PRUEFER], {
      cwd: wurzel,
      env: { ...process.env, SMEJJ_CHECK_ROOT: wurzel, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, ausgabe };
  } catch (fehler) {
    return { code: fehler.status ?? -1, ausgabe: `${fehler.stdout || ""}${fehler.stderr || ""}` };
  }
}

test("kaputte Probe: Workflow ohne erkennbar oeffentliches Repo wird BLOCKIERT", () => {
  const wurzel = repoBauen({ workflow: true });
  try {
    const { code, ausgabe } = pruefen(wurzel);
    assert.equal(code, 1, "ein Actions-Workflow muss hier den Push abbrechen");
    assert.ok(/workflows/i.test(ausgabe), "der Fund muss die Datei benennen");
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("gesunde Probe: ohne Workflow und ohne Kostenweg laeuft der Push durch", () => {
  const wurzel = repoBauen();
  try {
    assert.equal(pruefen(wurzel).code, 0);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("fail-closed: unklare Herkunft zaehlt als privat, nicht als oeffentlich", () => {
  // Eine Adresse, die nicht zu github.com gehoert, darf das Tor NIEMALS oeffnen
  // — sonst genuegte ein umbenannter Remote, um den Waechter auszuhebeln.
  const wurzel = repoBauen({ remote: "git@beispiel.invalid:jemand/etwas.git", workflow: true });
  try {
    assert.equal(pruefen(wurzel).code, 1);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("fail-closed: ein privates GitHub-Repo oeffnet das Tor nicht", () => {
  // Dieser Name existiert nicht; die API antwortet 404 — behandelt wie privat.
  // Faellt das Netz aus, ist das Ergebnis dasselbe: geprueft statt durchgewinkt.
  const wurzel = repoBauen({
    remote: "git@github.com:SmejjCom/dieses-repo-gibt-es-nicht-smejj-test.git",
    workflow: true
  });
  try {
    assert.equal(pruefen(wurzel).code, 1);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("die Sichtbarkeit wird gemessen, nicht aus einer Namensliste gelesen", () => {
  // Der eigentliche Befund: eine feste Liste veraltet, ohne dass etwas
  // fehlschlaegt. Steht wieder eine da, faellt dieser Test.
  const quelltext = execFileSync("cat", [PRUEFER], { encoding: "utf8" });
  assert.ok(
    /api\.github\.com\/repos/.test(quelltext),
    "der Waechter muss die Sichtbarkeit bei GitHub erfragen"
  );
  assert.ok(
    !/\*smejj-app-frontend\*\)/.test(quelltext),
    "die alte Namensliste darf nicht zurueckkehren — sie veraltet lautlos"
  );
});
