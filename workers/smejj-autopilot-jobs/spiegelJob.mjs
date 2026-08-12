// smejj.com — Codeberg-Spiegel als Zeabur-Job (Umzug vom Mac, 2026-08-11).
//
// WARUM DER UMZUG (Betreiber-Freigabe docs/approvals/2026-08-11-zeabur-
// autopilot-jobs.md): Der Mac ist kein 24-Stunden-Server — im Schlaf laesst
// cron Laeufe KOMPLETT aus (am 2026-08-11 gemessen). Dieser Dienst laeuft auf
// dem bezahlten Dauerserver und verpasst keinen Tag.
//
// WAS BEWUSST GLEICH BLIEB: Die eigentliche Spiegelung macht weiter das
// bewaehrte scripts/deploy/codeberg_spiegel_sync.sh AUS DER FRISCHEN
// ARBEITSKOPIE — dieselbe Logik, die monatelang auf dem Mac lief. Dieser Job
// besorgt nur Schluessel, Arbeitskopie und Herzschlag darum herum.
//
// SCHLUESSEL: kommen als Env-Werte (Inhalt, nicht Pfad) und werden beim Start
// nach $HOME/.ssh geschrieben (0600). Sie werden nie geloggt.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HERKUNFT = "git@github.com:SmejjCom/smejj.com-app.git";
const ZWEIG = "feature/auth-redesign-github-magiclink";

/** Schluessel fuer eine Autopilot-Kennung aus SMEJJ_AUTOPILOT_KEYS ziehen. */
export function schluesselFuer(id, env = process.env) {
  const roh = String(env.SMEJJ_AUTOPILOT_KEYS || "");
  for (const paar of roh.split(",")) {
    const trenner = paar.indexOf(":");
    if (trenner > 0 && paar.slice(0, trenner).trim() === id) return paar.slice(trenner + 1).trim();
  }
  const einzel = String(env.SMEJJ_AUTOPILOT_KEY || "").trim();
  if (einzel) return einzel;
  return "";
}

/**
 * Ist der taegliche Lauf faellig? Faellig ab `uhrzeitUtc` (HH:MM), hoechstens
 * einmal je UTC-Kalendertag. Ein Neustart NACH der Uhrzeit holt den Lauf des
 * Tages nach — genau das, was cron auf dem schlafenden Mac nie konnte.
 */
export function istFaellig({ jetztMs, uhrzeitUtc, letzterTag }) {
  const jetzt = new Date(jetztMs);
  const tag = jetzt.toISOString().slice(0, 10);
  if (tag === letzterTag) return false;
  const [h, m] = String(uhrzeitUtc || "11:20").split(":").map(Number);
  const faelligAb = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate(), h || 0, m || 0);
  return jetztMs >= faelligAb;
}

/** SSH-Schluessel aus der Umgebung nach $HOME/.ssh schreiben (einmalig). */
export function schluesselAblegen(env = process.env, basis = homedir()) {
  const sshDir = path.join(basis, ".ssh");
  mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  const paare = [
    ["SMEJJ_GITHUB_DEPLOY_KEY", "smejjcom_github_ed25519"],
    ["SMEJJ_CODEBERG_SSH_KEY", "codeberg_smejj_ed25519"]
  ];
  const fehlend = [];
  for (const [envName, datei] of paare) {
    const inhalt = String(env[envName] || "").trim();
    if (!inhalt) { fehlend.push(envName); continue; }
    // Env-Dialoge verlieren gern die Zeilenumbrueche; ein PEM ohne Umbrueche
    // wird hier repariert statt still zu scheitern.
    const pem = inhalt.includes("\n") ? inhalt : inhalt
      .replace(/-----BEGIN ([A-Z ]+)-----\s*/,'-----BEGIN $1-----\n')
      .replace(/\s*-----END ([A-Z ]+)-----/,'\n-----END $1-----')
      .replace(/(BEGIN [A-Z ]+-----\n)(.*)(\n-----END)/s, (_, a, mitte, z) => a + mitte.replace(/ /g, "\n") + z);
    writeFileSync(path.join(sshDir, datei), pem + "\n", { mode: 0o600 });
  }
  return { ok: fehlend.length === 0, fehlend };
}

function lauf(befehl, argumente, optionen = {}) {
  return new Promise((fertig) => {
    const kind = spawn(befehl, argumente, { ...optionen, stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    const sammle = (stueck) => { ausgabe += String(stueck); if (ausgabe.length > 40_000) ausgabe = ausgabe.slice(-40_000); };
    kind.stdout.on("data", sammle);
    kind.stderr.on("data", sammle);
    kind.on("error", (fehler) => fertig({ code: 127, ausgabe: ausgabe + "\n" + String(fehler) }));
    kind.on("close", (code) => fertig({ code: code ?? 1, ausgabe }));
  });
}

/**
 * Der komplette Spiegel-Lauf. Liefert { ok, meldung, dauerMs, protokoll }.
 * Wirft nie — der Aufrufer meldet das Ergebnis als Herzschlag.
 */
export async function spiegelLauf({ env = process.env, basis = "/tmp/smejj-autopilot-jobs", log = console.log } = {}) {
  const start = Date.now();
  const ende = (ok, meldung, protokoll = "") => ({ ok, meldung, dauerMs: Date.now() - start, protokoll });
  try {
    const schluessel = schluesselAblegen(env);
    if (!schluessel.ok) return ende(false, "Schluessel fehlen: " + schluessel.fehlend.join(", "));

    mkdirSync(basis, { recursive: true });
    const kopie = path.join(basis, "app");
    const githubKey = path.join(homedir(), ".ssh", "smejjcom_github_ed25519");
    const sshBasis = `ssh -i ${githubKey} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20`;
    // Port-22-Ausweich wie auf dem Mac: erst normal, dann ssh.github.com:443.
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
      if (geholt.code === 0) break;
      log("[spiegel] GitHub-Weg fehlgeschlagen, probiere Ausweich: " + geholt.ausgabe.slice(-200));
    }
    if (!geholt || geholt.code !== 0) return ende(false, "Arbeitskopie nicht aktualisierbar", geholt?.ausgabe || "");

    // Die eigentliche Spiegelung — unveraendert das bewaehrte Skript.
    const sync = await lauf("bash", ["scripts/deploy/codeberg_spiegel_sync.sh", "alles"], {
      cwd: kopie,
      env: { ...process.env, CODEBERG_PROTOKOLL: process.env.CODEBERG_PROTOKOLL || "ssh" }
    });
    if (sync.code !== 0) return ende(false, `Spiegelung Exit ${sync.code}`, sync.ausgabe);
    return ende(true, "Exit 0", sync.ausgabe);
  } catch (fehler) {
    return ende(false, "Unerwartet: " + String(fehler?.message || fehler).slice(0, 120));
  }
}

/** Herzschlag an die Ampel. Liefert den HTTP-Status (0 = Netz). Wirft nie. */
export async function herzschlagSenden({ id, ok, meldung, dauerMs, env = process.env, fetchImpl = fetch }) {
  const schluessel = schluesselFuer(id, env);
  if (!schluessel) return 0;
  const url = env.SMEJJ_AUTOPILOT_HEARTBEAT_URL || "https://smejj-control.zeabur.app/api/autopilot/heartbeat";
  try {
    const antwort = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id, key: schluessel,
        status: ok ? "ok" : "fehler",
        meldung: String(meldung || "").slice(0, 200),
        dauerMs: Math.max(0, Math.trunc(dauerMs || 0)),
        am: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(20_000)
    });
    return antwort.status;
  } catch {
    return 0;
  }
}
