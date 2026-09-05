// smejj.com — TUEV der Start-Sicherheit (Vorfall 2026-09-04, rund eine Stunde
// Ausfall von api.smejj.com).
//
// Autopilot Nr. 82 importierte `../../../scripts/check-schutz-echtheit.mjs`
// statisch. Im Repo lag die Datei; ins Abbild wurde `scripts/` nie kopiert. Der
// Server starb beim Start, ging in Neustart-Schleifen, Zeabur setzte ihn auf
// "suspended". Chat, Anmeldung und Speicher waren tot — die Seiten liefen
// weiter, deshalb fiel es kaum auf.
//
// LOKAL WAR ALLES GRUEN. Genau das ist der Punkt: kein Test sieht den
// Unterschied zwischen Arbeitskopie und Abbild.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { imAbbild, liegtImAbbild, pruefe, statischeImporte } from "../scripts/check-server-startsicher.mjs";

test("der echte Serverbaum ist start-sicher", () => {
  const { befunde, geprueft } = pruefe();
  assert.deepEqual(befunde, [], befunde.join(" | "));
  assert.ok(geprueft > 100, `nur ${geprueft} Importe geprueft — findet die Suche den Baum?`);
});

test("die erlaubten Orte kommen aus dem Dockerfile, nicht aus einer Annahme", () => {
  const orte = imAbbild();
  for (const pflicht of ["control-server", "src", "public", "docs"]) {
    assert.ok(orte.includes(pflicht), `${pflicht} fehlt in den gelesenen COPY-Zielen`);
  }
  // Die Einzeldatei-Ausnahme, mit der der Vorfall behoben wurde.
  assert.ok(orte.includes("scripts/check-schutz-echtheit.mjs"),
    "die COPY-Zeile fuer den Pruefsatz fehlt — dann startet der Server wieder nicht");
  assert.ok(!orte.includes("scripts"), "ganz scripts/ gehoert NICHT ins Abbild: dort liegen Einmal-Kaskaden");
});

test("ein Pfad ausserhalb der COPY-Ziele faellt auf", () => {
  const orte = ["control-server", "src", "scripts/check-schutz-echtheit.mjs"];
  assert.ok(liegtImAbbild("control-server/src/server.js", orte));
  assert.ok(liegtImAbbild("scripts/check-schutz-echtheit.mjs", orte));
  assert.ok(!liegtImAbbild("scripts/check-start-lock.mjs", orte), "genau der Fall, der den Server umgeworfen hat");
  assert.ok(!liegtImAbbild("tests/irgendwas.test.mjs", orte));
  // Kein Praefix-Irrtum: "srcfremd" ist nicht "src".
  assert.ok(!liegtImAbbild("srcfremd/datei.js", orte));
});

test("dynamische Importe zaehlen NICHT — sie sind die Loesung, nicht das Problem", () => {
  // Der reparierte Autopilot laedt genau so und faellt weich.
  const datei = new URL("../control-server/src/autopilots/schutzEchtheitAutopilot.js", import.meta.url).pathname;
  const quelle = readFileSync(datei, "utf8");
  assert.match(quelle, /await import\("\.\.\/\.\.\/\.\.\/scripts\/check-schutz-echtheit\.mjs"\)/,
    "der Import muss dynamisch bleiben");
  assert.doesNotMatch(quelle, /^import .* from "\.\.\/\.\.\/\.\.\/scripts\//m,
    "ein statischer Import hier ist ein Startrisiko fuer den ganzen Server");
  assert.deepEqual(statischeImporte(datei).filter((z) => z.includes("scripts/")), []);
});

test("der Waechter meldet den Autopiloten auch dann, wenn eine COPY-Zeile ihn erlauben wuerde", () => {
  // Zweite, strengere Regel: selbst mit COPY-Zeile darf ein Autopilot nicht
  // statisch aus scripts/ importieren. Ein Waechter, der den Dienst mitreisst,
  // ist schlimmer als gar kein Waechter.
  const quelle = readFileSync(new URL("../scripts/check-server-startsicher.mjs", import.meta.url), "utf8");
  assert.match(quelle, /rel\.includes\("\/autopilots\/"\) && aufgeloest\.startsWith\("scripts\/"\)/);
});

test("der Autopilot faellt weich, wenn die Datei im Abbild fehlt", async () => {
  const m = await import("../control-server/src/autopilots/schutzEchtheitAutopilot.js");
  // Ohne Netz darf er nie rot werden und nie werfen.
  const r = await m.laufSchutzEchtheit({ mitNetz: false });
  assert.equal(r.ok, true);
  assert.ok(typeof r.meldung === "string" && r.meldung.length > 10);
});
