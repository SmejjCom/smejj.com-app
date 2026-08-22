// Der Pruefer fuer fehlende Umgebungswerte braucht Zeabur-Zugang und kann
// darum nicht in check:frontend laufen. Diese Tests halten fest, was ohne Netz
// pruefbar ist — und vor allem die Luecke, an der er sieben Tage lang
// vorbeigesehen hat.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { erwarteteSchluessel, PFLICHT } from "../scripts/diagnose/control-umgebung-luecken.mjs";

function mitProbe(inhalt, pruefung) {
  const ordner = mkdtempSync(join(tmpdir(), "smejj-envtest-"));
  try {
    writeFileSync(join(ordner, "probe.js"), inhalt);
    pruefung(erwarteteSchluessel([ordner]));
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

test("das Fragezeichen darf keinen Schluessel verstecken", () => {
  // DIE Luecke: opsAutopiloten.js liest `env?.SMEJJ_AUTOPILOT_KEYS`. Das alte
  // Muster verlangte einen Punkt direkt hinter `env` und nannte den Schluessel
  // deshalb nie — waehrend sein Fehlen die ganze Ampel blind machte.
  mitProbe('const roh = String(env?.SMEJJ_AUTOPILOT_KEYS || "");', (namen) => {
    assert.ok(namen.includes("SMEJJ_AUTOPILOT_KEYS"), `gefunden: ${namen.join(", ")}`);
  });
});

test("auch Klammer-Zugriffe zaehlen", () => {
  // Ueblich in Schleifen ueber Namenslisten — und genauso unsichtbar fuer ein
  // Muster, das nur den Punkt kennt.
  mitProbe('const wert = process.env["SMEJJ_SESSION_SECRET"];', (namen) => {
    assert.ok(namen.includes("SMEJJ_SESSION_SECRET"), `gefunden: ${namen.join(", ")}`);
  });
});

test("die geraden Schreibweisen bleiben erkannt", () => {
  mitProbe('a(env.SMEJJ_SMTP_HOST); b(process.env.STRIPE_SECRET_KEY);', (namen) => {
    assert.ok(namen.includes("SMEJJ_SMTP_HOST"));
    assert.ok(namen.includes("STRIPE_SECRET_KEY"));
  });
});

test("gesunde Probe: was keine Serverkonfiguration ist, wird nicht gemeldet", () => {
  // Ohne diese Einschraenkung faengt der Scan NODE_ENV, PATH und jede
  // Testattrappe ein — und die Liste wird wieder zu Rauschen.
  mitProbe('if (env.NODE_ENV === "test") return process.env.PATH;', (namen) => {
    assert.deepEqual(namen, [], `unerwartet gemeldet: ${namen.join(", ")}`);
  });
});

test("jeder Pflichtwert traegt Folge UND Beleg", () => {
  // Eine Pflichtliste ohne Beleg waere eine Vermutung mit Ausrufezeichen. 177
  // ungewichtete Namen haben sieben Tage lang niemanden erreicht; die kurze
  // Liste wirkt nur, wenn jeder Eintrag nachweisbar ist.
  assert.ok(PFLICHT.length > 0, "Pflichtliste ist leer");
  for (const eintrag of PFLICHT) {
    assert.match(eintrag.name, /^[A-Z][A-Z0-9_]+$/, "Name sieht nicht nach Umgebungswert aus");
    assert.ok(eintrag.folge && eintrag.folge.length > 20, `${eintrag.name}: Folge fehlt`);
    assert.ok(eintrag.beleg && /\d{4}-\d{2}-\d{2}|\.yml|\.mjs|\.js/.test(eintrag.beleg),
      `${eintrag.name}: Beleg ohne Datum oder Fundstelle`);
  }
});

test("der Pruefer faellt bei fehlendem Pflichtwert durch, nicht nur bei Hinweisen", () => {
  // Vorher war jede Luecke gleich viel wert und der Ausgang derselbe. Wer 185
  // Hinweise sieht, liest keinen einzigen.
  const text = readFileSync(new URL("../scripts/diagnose/control-umgebung-luecken.mjs", import.meta.url), "utf8");
  assert.match(text, /kritischFehlend/);
  assert.match(text, /if \(!kritischFehlend\.length\)[\s\S]{0,120}process\.exit\(0\)/,
    "ohne fehlenden Pflichtwert muss der Pruefer gruen sein");
});
