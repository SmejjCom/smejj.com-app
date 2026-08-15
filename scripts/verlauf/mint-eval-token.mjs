#!/usr/bin/env node
// smejj.com — kurzlebigen Anmelde-Nachweis fuer den Qualitaets-Messlauf erzeugen.
//
// WARUM ES DAS GIBT: Seit dem 2026-08-05 (Bridge v121) weist `/api/chat` jede
// Anfrage ohne gueltiges Token mit HTTP 401 ab. Der Messlauf misst absichtlich
// den ECHTEN Nutzerweg (ueber die Bridge, nicht am Control Server vorbei) — also
// braucht er einen Nachweis wie ein angemeldeter Nutzer.
//
// EIGENSCHAFTEN, alle drei notwendig:
//   1. Der Sitzungsschluessel wird aus der LAUFENDEN Salad-Gruppe gelesen. Der
//      Wert in ~/.config/smejj.com/env.local ist ein anderer und ergibt 401.
//   2. `method: "local-e2e"` — NICHT "email". `emailSessionStillValid()` prueft
//      nur bei method === "email" gegen den Sitzungsspeicher; ein gemintetes
//      Token haette dort keine Sitzung und fiele fail-closed durch.
//   3. Kurze Laufzeit (Standard 15 Minuten). Das Token wird nur ueber die
//      Umgebung weitergereicht, nie in eine Datei geschrieben, nie protokolliert.
//
// Aufruf:
//   SMEJJ_EVAL_SESSION_TOKEN=$(node scripts/verlauf/mint-eval-token.mjs) npm run eval:models
//
// Ausgabe: ausschliesslich das Token auf stdout (fuer die Kommandoersetzung).
// Alle Meldungen gehen auf stderr, damit sie die Ausgabe nicht verunreinigen.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { issueSessionToken } from "../../control-server/src/auth/sessionToken.js";

const GRUPPE = process.env.SMEJJ_CONTROL_GROUP || "smejj-control";
const LAUFZEIT_MS = Number(process.env.SMEJJ_EVAL_TOKEN_TTL_MS || 15 * 60 * 1000);
// Manche Pruefungen haengen an der ADRESSE, nicht am Messlauf: der Abo-Status
// wird ueber sha256(E-Mail) aufgeloest — nur ein Nachweis mit der zahlenden
// Adresse beweist, dass ein Kunde sein Abo wirklich sieht (Befund 2026-08-14:
// bezahlt wurde mit einer anderen Adresse als der vermuteten).
const ADRESSE = process.env.SMEJJ_EVAL_EMAIL || "smejjcom@gmail.com";

function abbruch(nachricht) {
  process.stderr.write(`${nachricht}\n`);
  process.exit(1);
}

loadSecureLocalEnv();

// WOHER DAS GEHEIMNIS KOMMT — und warum sich das am 2026-08-14 geaendert hat.
//
// Bis heute las dieses Skript SMEJJ_SESSION_SECRET aus der laufenden
// SALAD-Containergruppe. Salad ist seit dem 13.08.2026 abgeschaltet. Die
// Salad-API lieferte die alte Gruppendefinition aber weiterhin aus — das
// Skript zog also ein VERALTETES Geheimnis, unterschrieb damit froehlich
// ein Token, und der Control-Server auf Zeabur wies es mit
// "authentication_required" ab. Kein Fehler, keine Warnung: ein Token, das
// aussah wie eines und keines war. Das ist die schlimmste Sorte Defekt.
//
// Zeabur gibt die Variablen eines Dienstes ueber seine GraphQL-API NICHT
// heraus (nachgesehen 2026-08-14: es gibt nur `environments`/`environment`,
// keine Abfrage fuer Werte). Es bleibt also der lokale Weg: der Betreiber
// legt den Wert EINMAL in ~/.config/smejj.com/env.local ab, so wie jedes
// andere Geheimnis dieses Werkzeugkastens auch.
//
// Fail-loud statt fail-silent: fehlt er, sagt das Skript genau, was zu tun
// ist — statt ein wertloses Token auszugeben.
const secret = process.env.SMEJJ_SESSION_SECRET;
if (!secret) {
  abbruch([
    "SMEJJ_SESSION_SECRET fehlt — kein Token erzeugt.",
    "",
    "So einmalig einrichten:",
    "  1. Im Zeabur-Portal beim Dienst smejj-control die Variable",
    "     SMEJJ_SESSION_SECRET oeffnen und den Wert kopieren.",
    "  2. In ~/.config/smejj.com/env.local eintragen:",
    "     SMEJJ_SESSION_SECRET=<der Wert>",
    "",
    "Hinweis: der Wert MUSS mit dem des laufenden Dienstes uebereinstimmen.",
    "Aendert der Betreiber ihn dort, wird jedes hier erzeugte Token abgewiesen.",
    "(Bis 2026-08-14 kam der Wert aus der Salad-Gruppe. Salad ist abgeschaltet;",
    " die API lieferte weiterhin die alte Definition und damit ein totes Token.)"
  ].join("\n"));
}

const token = issueSessionToken({
  secret,
  user: { userId: "eval-harness", email: ADRESSE, method: "local-e2e" },
  ttlMs: LAUFZEIT_MS
});

// GEGENPROBE, und sie ist der eigentliche Punkt dieser Datei.
//
// Ein Token entsteht rein rechnerisch: nimm ein Geheimnis, unterschreibe.
// Ob der Server dieses Geheimnis TEILT, weiss man dabei nicht. Genau daran
// ist es am 2026-08-14 gescheitert — das Skript meldete "Anmelde-Nachweis
// erzeugt", und jede Messung danach lief in 401. Wer das nicht sofort
// nachprueft, misst stundenlang gegen eine verschlossene Tuer und haelt die
// leeren Ergebnisse fuer Befunde.
//
// Die Probe ruft einen billigen, rein lesenden Endpunkt. Mit --ohne-probe
// laesst sie sich abschalten (kein Netz, Notfall).
const OHNE_PROBE = process.argv.includes("--ohne-probe");
const ZIEL = process.env.SMEJJ_CONTROL_ORIGIN || "https://smejj-control.zeabur.app";

if (!OHNE_PROBE) {
  try {
    const antwort = await fetch(`${ZIEL}/api/admin/ops/kontingent`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000)
    });
    if (antwort.status === 401 || antwort.status === 403) {
      abbruch([
        `Das Token wurde abgewiesen (HTTP ${antwort.status}) — es ist wertlos, also gebe ich es nicht aus.`,
        "",
        "Das heisst: der Wert von SMEJJ_SESSION_SECRET in",
        "~/.config/smejj.com/env.local stimmt NICHT mit dem des laufenden",
        "Dienstes ueberein.",
        "",
        "So richten:",
        "  1. Zeabur-Portal -> Dienst smejj-control -> Variables",
        "  2. SMEJJ_SESSION_SECRET kopieren",
        "  3. in ~/.config/smejj.com/env.local eintragen",
        "",
        "Mit --ohne-probe laesst sich diese Pruefung ueberspringen."
      ].join("\n"));
    }
    if (!antwort.ok) {
      process.stderr.write(`Hinweis: Probe antwortete HTTP ${antwort.status} — das Token selbst wurde aber nicht abgewiesen.\n`);
    }
  } catch (fehler) {
    // Kein Netz ist kein Grund, das Token zurueckzuhalten — nur ein Grund,
    // es nicht als geprueft auszugeben.
    process.stderr.write(`Hinweis: Probe nicht moeglich (${fehler.name}) — Token UNGEPRUEFT.\n`);
  }
}

process.stderr.write(`Anmelde-Nachweis erzeugt (${Math.round(LAUFZEIT_MS / 60000)} Minuten gueltig)${OHNE_PROBE ? ", UNGEPRUEFT" : " und am Dienst geprueft"}.\n`);
process.stdout.write(token);
