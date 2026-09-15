// smejj.com — Modul P: Betrieb und Deploy (Single Responsibility: Betriebssicht).
//
// Das Modul beantwortet die eine Frage, an der hier zweimal etwas
// auseinandergelaufen ist: WELCHER STAND LAEUFT GERADE WIRKLICH?
//
// Es vergleicht drei Angaben, die auseinanderfallen koennen:
//   1. Worauf der Container zeigen SOLL   — SMEJJ_CONTROL_ARTIFACT_KEY/_SHA256
//      aus der Umgebung, gesetzt beim Aktivieren eines Release.
//   2. Was tatsaechlich AUSGEPACKT wurde  — release-artifact-manifest.json,
//      das im Artefakt selbst liegt und beim Bauen geschrieben wurde.
//   3. Seit wann der Prozess laeuft       — Startzeit.
//
// Zeigen 1 und 2 auf verschiedene Release-Kennungen, laeuft ein anderer Stand
// als angenommen: typischerweise, weil der Rollout noch nicht durch ist. Genau
// das war bisher nur durch Raten zu erkennen.
//
// NACHTRAG 15.09. (Live-Audit): Der Control-Server laeuft auf Zeabur direkt
// aus Git. Es gibt dort KEIN Release-Artefakt, also weder Soll-Zeiger noch
// Manifest — die Seite zeigte nur Striche. Der laufende Stand ist dort der
// Commit, den Zeabur je Bau setzt (ZEABUR_GIT_COMMIT_SHA, siehe
// bauWacheAutopilot.js). Er wird jetzt als eigene Angabe gezeigt, und die
// Bewertung heisst "zeabur-git" statt "lokal".
//
// Keine Geheimnisse: aus der Umgebung werden ausschliesslich die zwei
// Release-Zeiger und der Bau-Commit gelesen, nie ein Schluessel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = "release-artifact-manifest.json";
// Der Laufzeit-Wurzelpfad: vier Ebenen ueber dieser Datei
// (control-server/src/admin/opsDeploy.js).
const WURZEL = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export function deployUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  startzeitMs = null,
  wurzel = WURZEL,
  leseDatei = fs.readFileSync
} = {}) {
  const sollSchluessel = String(env.SMEJJ_CONTROL_ARTIFACT_KEY || "").trim();
  const sollSha = String(env.SMEJJ_CONTROL_ARTIFACT_SHA256 || "").trim().toLowerCase();
  const manifest = liesManifest(wurzel, leseDatei);

  const sollRelease = releaseAusSchluessel(sollSchluessel);
  const istRelease = manifest.ok ? String(manifest.daten.releaseId || "") : "";
  // Nur vergleichen, wenn beide Seiten etwas sagen. Fehlt eine, ist der Zustand
  // "unbekannt" — nicht "abweichend". Ein falscher Alarm hier kostet Vertrauen.
  const vergleichbar = Boolean(sollRelease && istRelease);
  const stimmtUeberein = vergleichbar ? sollRelease === istRelease : null;

  const laufzeitMs = Number.isFinite(startzeitMs) ? Math.max(0, jetztMs - startzeitMs) : null;
  const git = gitStand(env);

  return {
    ok: true,
    soll: {
      artefaktSchluessel: sollSchluessel || null,
      releaseId: sollRelease || null,
      // Nur der Anfang: der volle Wert steht ohnehin im Artefaktnamen, und ein
      // gekuerzter Hash reicht fuer den Abgleich mit dem Auge.
      sha256Kurz: sollSha ? sollSha.slice(0, 12) : null
    },
    ist: manifest.ok
      ? {
        releaseId: istRelease || null,
        gebautAm: manifest.daten.createdAt || null,
        dateien: Number(manifest.daten.fileCount || 0),
        inhaltsHashKurz: String(manifest.daten.contentRootSha256 || "").slice(0, 12) || null
      }
      : { releaseId: null, fehler: manifest.fehler },
    stimmtUeberein,
    git,
    laufzeitMs,
    gestartetAm: Number.isFinite(startzeitMs) ? new Date(startzeitMs).toISOString() : null,
    knoten: process.version,
    bewertung: bewerte({ stimmtUeberein, manifestOk: manifest.ok, sollRelease, git }),
    hinweis: !manifest.ok && !sollRelease && git
      ? "Zeabur baut den Control-Server direkt aus Git. Dabei entsteht kein separates "
        + "Release-Artefakt — Release, Bauzeit und Pruefsummen gibt es deshalb nicht. "
        + "Massgeblich ist der laufende Commit."
      : "Ein Rollout dauert rund zehn Minuten. Weichen Soll und Ist ab, ist er "
        + "meist noch unterwegs — bleibt es so, zeigt der Container auf ein anderes Artefakt."
  };
}

/**
 * Der Bau-Commit, den Zeabur beim Git-Bau setzt. Nur eine Hex-Kennung wird
 * uebernommen — was anderes in der Variable steht, wird nicht angezeigt.
 */
function gitStand(env) {
  const commit = String(env.ZEABUR_GIT_COMMIT_SHA || "").trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(commit)) return null;
  return { commit, commitKurz: commit.slice(0, 8), quelle: "ZEABUR_GIT_COMMIT_SHA" };
}

function liesManifest(wurzel, leseDatei) {
  try {
    const inhalt = leseDatei(path.join(wurzel, MANIFEST), "utf8");
    return { ok: true, daten: JSON.parse(inhalt) };
  } catch {
    // Kein Manifest heisst in aller Regel: nicht aus einem Release-Artefakt
    // gestartet, sondern direkt aus dem Arbeitsverzeichnis.
    return { ok: false, fehler: "manifest_nicht_lesbar" };
  }
}

function releaseAusSchluessel(schluessel) {
  const name = String(schluessel || "").split("/").pop() || "";
  return name.replace(/\.tar\.gz$/i, "");
}

function bewerte({ stimmtUeberein, manifestOk, sollRelease, git = null }) {
  if (!manifestOk && !sollRelease) return git ? "zeabur-git" : "lokal";
  if (!manifestOk) return "unbekannt";
  if (stimmtUeberein === true) return "deckungsgleich";
  if (stimmtUeberein === false) return "abweichend";
  return "unbekannt";
}
