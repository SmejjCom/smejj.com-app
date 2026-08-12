// smejj.com — ECHTER Qualitätsmessungs-Lauf für den Zeabur-Dienst smejj-autopilot-jobs.
//
// Bis zum 2026-08-12 sendete der Qualitäts-Job nur ein Lebenszeichen (davor
// sogar ein erfundenes "Suite pass"). Dieser Lauf misst wirklich: er fährt
// die Prüfsuite evals/suites/smejj-chat-core-v1.json über den ECHTEN
// Nutzerweg (--live) und meldet die gemessene Note an die Ampel.
//
// BAUSTEINE, alle bewährt:
//   1. Arbeitskopie wie beim Spiegel-Job (git clone/fetch mit Deploy-Key) —
//      die Suite und der Messläufer leben im Repo, nicht im Container-Abbild.
//   2. Anmelde-Nachweis wie scripts/verlauf/mint-eval-token.mjs: kurzlebiges
//      Token aus SMEJJ_SESSION_SECRET (muss im Dienst-Env stehen, derselbe
//      Wert wie beim Control-Server), method "local-e2e".
//   3. Bewertung wie scripts/verlauf/messlauf.mjs: EIN GESCHEITERTER
//      TRANSPORT IST KEINE SCHLECHTE NOTE — dann meldet der Lauf "fehler"
//      mit dem Grund, nie eine erfundene Zahl.
//
// FAIL-SOFT OHNE KONFIGURATION: Fehlt SMEJJ_SESSION_SECRET, bleibt der Job
// ein ehrlich beschriftetes Lebenszeichen (ok) — ein fehlender Env-Wert ist
// ein Einrichtungszustand, kein Ausfall, und soll die Ampel nicht rot färben.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { schluesselAblegen } from "./spiegelJob.mjs";

const HERKUNFT = "git@github.com:SmejjCom/smejj.com-app.git";
const ZWEIG = "feature/auth-redesign-github-magiclink";
const SUITE = "evals/suites/smejj-chat-core-v1.json";
// Wie messlauf.mjs: 14 Fälle x 3 Läufe bei 5,5 s Abstand bleibt unter der
// 12/min-Drossel der Brücke. Gesamtdeckel großzügig darüber.
const WIEDERHOLUNGEN = 3;
const ABSTAND_MS = 5500;
const LAUF_DECKEL_MS = 25 * 60 * 1000;

/**
 * Bewertet den Bericht aus run_model_eval.mjs für die Ampel. Rein & testbar.
 * Regel aus messlauf.mjs: Transportfehler => kein Qualitätsurteil.
 *
 * @returns {{ok: boolean, gemessen: boolean, meldung: string}}
 */
export function bewerteBericht(bericht) {
  const s = bericht?.summary;
  if (!s || typeof s !== "object") return { ok: false, gemessen: false, meldung: "Messlauf ohne summary — kein Urteil" };
  if (!Number.isFinite(s.cases) || s.cases < 1) return { ok: false, gemessen: false, meldung: "Messlauf ohne Fälle — kein Urteil" };
  if (Number(s.errors) > 0) return { ok: false, gemessen: false, meldung: `Messlauf: ${s.errors} Fälle mit Transportfehler — kein Qualitätsurteil` };
  if (!Number.isFinite(s.weightedScore) || s.weightedScore < 0 || s.weightedScore > 1) {
    return { ok: false, gemessen: false, meldung: "Messlauf ohne gültige Punktzahl — kein Urteil" };
  }
  const note = (s.weightedScore * 100).toFixed(1).replace(".", ",");
  const urteil = String(bericht.verdict || "unbekannt");
  return {
    ok: true,
    gemessen: true,
    meldung: `Echte Messung: Note ${note} % (${s.cases} Fälle, ${s.passed} bestanden, Urteil ${urteil})`
  };
}

function lauf(befehl, argumente, optionen = {}) {
  return new Promise((fertig) => {
    const kind = spawn(befehl, argumente, { ...optionen, stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    kind.stdout.on("data", (stueck) => { ausgabe += stueck.toString(); });
    kind.stderr.on("data", (stueck) => { ausgabe += stueck.toString(); });
    kind.once("error", (fehler) => fertig({ code: -1, ausgabe: `${ausgabe}\nspawn: ${fehler.message}` }));
    kind.once("exit", (code) => fertig({ code, ausgabe }));
  });
}

/** Arbeitskopie holen/auffrischen — identisches Muster wie der Spiegel-Job. */
async function arbeitskopie({ env, basis, log }) {
  const schluessel = schluesselAblegen(env);
  if (!schluessel.ok) return { ok: false, grund: "Schlüssel fehlen: " + schluessel.fehlend.join(", ") };
  mkdirSync(basis, { recursive: true });
  const kopie = path.join(basis, "app");
  const githubKey = path.join(homedir(), ".ssh", "smejjcom_github_ed25519");
  const sshBasis = `ssh -i ${githubKey} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20`;
  const sshWege = [sshBasis, `${sshBasis} -o HostName=ssh.github.com -o Port=443`];
  let geholt = null;
  for (const sshWeg of sshWege) {
    const umgebung = { ...process.env, GIT_SSH_COMMAND: sshWeg };
    if (!existsSync(path.join(kopie, ".git"))) {
      geholt = await lauf("git", ["clone", "-q", "--branch", ZWEIG, HERKUNFT, kopie], { env: umgebung });
    } else {
      await lauf("git", ["-C", kopie, "remote", "set-url", "origin", HERKUNFT]);
      geholt = await lauf("git", ["-C", kopie, "fetch", "-q", "origin", ZWEIG], { env: umgebung });
      if (geholt.code === 0) geholt = await lauf("git", ["-C", kopie, "reset", "-q", "--hard", "FETCH_HEAD"]);
    }
    if (geholt.code === 0) return { ok: true, kopie };
    log("[qualitaet] GitHub-Weg fehlgeschlagen, probiere Ausweich: " + geholt.ausgabe.slice(-200));
  }
  return { ok: false, grund: "Arbeitskopie nicht aktualisierbar" };
}

/**
 * Der echte Messlauf. Liefert immer {ok, gemessen, meldung} und wirft nie —
 * der Aufrufer (jobs.mjs) macht daraus den Herzschlag.
 */
export async function echterQualitaetslauf({ env = process.env, basis = "/tmp/smejj-autopilot-jobs", log = console.log } = {}) {
  const secret = String(env.SMEJJ_SESSION_SECRET || "").trim();
  if (!secret) {
    return {
      ok: true,
      gemessen: false,
      meldung: "Lebenszeichen: Dienst läuft — echte Messung wartet auf SMEJJ_SESSION_SECRET im Dienst-Env"
    };
  }

  const repo = await arbeitskopie({ env, basis, log });
  if (!repo.ok) return { ok: false, gemessen: false, meldung: "Messlauf gescheitert: " + repo.grund };

  let token;
  try {
    const { issueSessionToken } = await import(pathToFileURL(path.join(repo.kopie, "control-server/src/auth/sessionToken.js")).href);
    token = issueSessionToken({
      secret,
      user: { userId: "autopilot-qualitaet", email: "smejjcom@gmail.com", method: "local-e2e" },
      ttlMs: 30 * 60 * 1000
    });
  } catch (fehler) {
    return { ok: false, gemessen: false, meldung: "Messlauf gescheitert: Token-Modul nicht ladbar (" + String(fehler?.message || fehler).slice(0, 80) + ")" };
  }

  const arbeitsdir = mkdtempSync(path.join(tmpdir(), "smejj-qualitaet-"));
  const berichtPfad = path.join(arbeitsdir, "bericht.json");
  try {
    log(`[qualitaet] Suite startet (${WIEDERHOLUNGEN} Wiederholungen, Takt ${ABSTAND_MS} ms)`);
    const ergebnis = await Promise.race([
      lauf(process.execPath, [
        "scripts/evaluation/run_model_eval.mjs",
        "--suite", SUITE,
        "--live",
        "--wiederholungen", String(WIEDERHOLUNGEN),
        "--delay-ms", String(ABSTAND_MS),
        "--out", berichtPfad
      ], { cwd: repo.kopie, env: { ...process.env, SMEJJ_EVAL_SESSION_TOKEN: token } }),
      new Promise((fertig) => setTimeout(() => fertig({ code: -2, ausgabe: "Zeitdeckel erreicht" }), LAUF_DECKEL_MS).unref?.())
    ]);
    if (ergebnis.code === -2) return { ok: false, gemessen: false, meldung: `Messlauf gescheitert: Zeitdeckel ${Math.round(LAUF_DECKEL_MS / 60000)} min erreicht` };

    // Exit 1 heisst nur "verdict != passed" — der Bericht zaehlt, nicht der Code.
    let bericht;
    try {
      bericht = JSON.parse(readFileSync(berichtPfad, "utf8"));
    } catch {
      return { ok: false, gemessen: false, meldung: `Messlauf gescheitert: kein Bericht (Exit ${ergebnis.code}) — ` + ergebnis.ausgabe.slice(-120) };
    }
    return bewerteBericht(bericht);
  } finally {
    rmSync(arbeitsdir, { recursive: true, force: true });
  }
}
