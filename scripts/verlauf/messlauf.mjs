#!/usr/bin/env node
// smejj.com — ein Messlauf gegen die Live-Kette, veroeffentlichungsreif.
//
// Betreiber-Freigabe 2026-08-04: „einen zeitgesteuerten Lauf … der die
// Qualitaetsmessung regelmaessig gegen die Live-Kette faehrt, das Ergebnis auf
// der Qualitaetsseite veroeffentlicht und hochlaedt."
//
// Bis dahin wurde von Hand gemessen — und genau deshalb stand auf der
// oeffentlichen Seite fuenf Tage lang eine veraltete schlechte Note.
//
// WAS DIESES SKRIPT MACHT
//   1. Prueflauf ueber die Suite gegen den ECHTEN Nutzerweg.
//   2. Ergebnis pruefen. Nur ein technisch gelungener Lauf wird uebernommen.
//   3. Messwert-Datei fortschreiben (zusammenfuehren, nie ersetzen).
//
// WAS ES BEWUSST NICHT MACHT: committen, pushen, deployen. Das ist Sache des
// Aufrufers (scripts/verlauf/messlauf-taeglich.sh) — ein Skript, das misst UND
// veroeffentlicht UND ausliefert, ist bei einem Fehler nicht mehr zu zerlegen.
//
// DIE WICHTIGSTE REGEL: EIN GESCHEITERTER TRANSPORT IST KEINE SCHLECHTE NOTE.
// Am 2026-08-04 ergab ein Lauf 0,0 % — nicht weil die Antworten schlecht waren,
// sondern weil der Endpunkt mit HTTP 401 antwortete. Waere das veroeffentlicht
// worden, haette die Seite der Welt eine Katastrophe gemeldet, die nie
// stattgefunden hat. Deshalb: Faelle mit Transportfehler => Abbruch ohne
// Schreiben. Lieber ein alter Stand (den die Seite als alt ausweist) als eine
// falsche Zahl.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baueDatei } from "./aktualisiere-messwerte.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HIER, "../..");

const SUITE = "evals/suites/smejj-chat-core-v1.json";
const ZIEL_DATEI = "public/verlauf-messwerte.json";
// Die Bruecke laesst 12 Anfragen je Minute und Client zu. 14 Faelle x 3 Laeufe
// sind 42 Aufrufe — ohne Taktung endet der Lauf in HTTP 429 (am 2026-08-04
// genau so passiert). 5,5 s Abstand bleiben mit Rand darunter.
const ABSTAND_MS = 5500;
const WIEDERHOLUNGEN = 3;

/**
 * Ist der Lauf technisch gelungen? Prueft NICHT die Qualitaet — nur, ob
 * ueberhaupt gemessen wurde.
 *
 * @param {object} bericht Bericht aus run_model_eval.mjs.
 * @returns {{ok: boolean, grund: string}}
 */
export function laufIstBrauchbar(bericht) {
  const s = bericht?.summary;
  if (!s || typeof s !== "object") return { ok: false, grund: "kein summary im Bericht" };
  if (!Number.isFinite(s.cases) || s.cases < 1) return { ok: false, grund: "keine Faelle gemessen" };
  // Ein einziger Transportfehler macht den ganzen Lauf unbrauchbar: die
  // Punktzahl waere dann kein Qualitaetsurteil, sondern ein Netzbefund.
  if (Number(s.errors) > 0) return { ok: false, grund: `${s.errors} Faelle mit Transportfehler` };
  if (!Number.isFinite(s.weightedScore)) return { ok: false, grund: "keine Punktzahl" };
  if (s.weightedScore < 0 || s.weightedScore > 1) return { ok: false, grund: "Punktzahl ausserhalb 0..1" };
  return { ok: true, grund: "" };
}

/**
 * Formt den Bericht in einen Verlaufseintrag. Rein und einzeln pruefbar.
 * Was nicht gemessen wurde, wird nicht erfunden.
 */
export function alsVerlaufEintrag(bericht) {
  const s = bericht.summary;
  const wackelige = (Array.isArray(bericht.cases) ? bericht.cases : [])
    .filter((fall) => fall?.wackelig)
    .map((fall) => ({ fall: String(fall.caseId), laeufe: Number(fall.laeufe), bestanden: Number(fall.bestanden) }));
  return {
    zeitpunkt: bericht?.run?.startedAt || bericht?.run?.finishedAt || new Date().toISOString(),
    punktzahl: s.weightedScore,
    faelle: s.cases,
    bestanden: s.passed,
    nichtBestanden: Number(s.failed || 0) + Number(s.errors || 0),
    kritischeFehler: s.criticalFailures,
    p95Ms: s.latencyMsP95,
    medianMs: s.latencyMsMedian,
    wiederholungen: s.wiederholungen,
    wackelig: s.wackelig,
    wackeligeFaelle: wackelige,
    urteil: String(bericht.verdict || "unbekannt"),
    abgelegt: false
  };
}

function starteEval(berichtPfad) {
  return new Promise((fertig) => {
    const kind = spawn(process.execPath, [
      "scripts/evaluation/run_model_eval.mjs",
      "--suite", SUITE,
      "--live",
      "--wiederholungen", String(WIEDERHOLUNGEN),
      "--delay-ms", String(ABSTAND_MS),
      "--out", berichtPfad
    ], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    const sammle = (strom) => strom.on("data", (stueck) => { ausgabe += stueck.toString(); });
    sammle(kind.stdout);
    sammle(kind.stderr);
    kind.once("error", (fehler) => fertig({ code: -1, ausgabe: `${ausgabe}\nspawn: ${fehler.message}` }));
    kind.once("exit", (code) => fertig({ code, ausgabe }));
  });
}

async function main() {
  const arbeitsordner = await mkdtemp(path.join(tmpdir(), "smejj-messlauf-"));
  const berichtPfad = path.join(arbeitsordner, "bericht.json");
  const melde = (text) => process.stdout.write(`${new Date().toISOString()} ${text}\n`);

  try {
    melde("Messlauf gestartet");
    const lauf = await starteEval(berichtPfad);
    // Der Bericht wird auch bei Exit-Code != 0 geschrieben (ein „blocked"-Urteil
    // ist ein gueltiges Ergebnis). Entscheidend ist, ob er lesbar ist.
    let bericht;
    try {
      bericht = JSON.parse(await readFile(berichtPfad, "utf8"));
    } catch {
      melde(`ABBRUCH: kein lesbarer Bericht (Exit ${lauf.code}). Nichts geschrieben.`);
      process.stdout.write(`${lauf.ausgabe.slice(-1500)}\n`);
      process.exitCode = 1;
      return;
    }

    const pruefung = laufIstBrauchbar(bericht);
    if (!pruefung.ok) {
      // GENAU HIER liegt der Schutz: ein Netzbefund darf nie als Note erscheinen.
      melde(`ABBRUCH: Lauf nicht brauchbar (${pruefung.grund}). Nichts geschrieben.`);
      process.stdout.write(`${lauf.ausgabe.slice(-1500)}\n`);
      process.exitCode = 1;
      return;
    }

    const eintrag = alsVerlaufEintrag(bericht);
    const zielPfad = path.join(REPO, ZIEL_DATEI);
    const bestand = JSON.parse(await readFile(zielPfad, "utf8"));
    const vorher = bestand.messungen.length;
    const datei = baueDatei(bestand, { verlauf: [eintrag] });
    if (datei.messungen.length === vorher) {
      melde("Nichts Neues: derselbe Zeitpunkt liegt bereits vor. Datei unveraendert.");
      return;
    }
    await writeFile(zielPfad, `${JSON.stringify(datei, null, 2)}\n`, "utf8");
    melde(
      `Veroeffentlicht: ${(eintrag.punktzahl * 100).toFixed(2)} %, `
      + `${eintrag.kritischeFehler} kritische Verstoesse, Urteil ${eintrag.urteil}, `
      + `${datei.messungen.length} Messungen in der Datei`
    );
  } finally {
    await rm(arbeitsordner, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
