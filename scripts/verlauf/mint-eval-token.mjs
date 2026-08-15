#!/usr/bin/env node
// smejj.com — kurzlebigen Anmelde-Nachweis fuer den Qualitaets-Messlauf erzeugen.
//
// WARUM ES DAS GIBT: Seit dem 2026-08-05 (Bridge v121) weist `/api/chat` jede
// Anfrage ohne gueltiges Token mit HTTP 401 ab. Der Messlauf misst absichtlich
// den ECHTEN Nutzerweg (ueber die Bridge, nicht am Control Server vorbei) — also
// braucht er einen Nachweis wie ein angemeldeter Nutzer.
//
// EIGENSCHAFTEN, alle drei notwendig:
//   1. Der Sitzungsschluessel kommt aus ~/.config/smejj.com/env.local — er muss
//      derselbe sein, mit dem der LAUFENDE Control-Server seine Sitzungen
//      unterschreibt.
//
//      GEAENDERT 2026-08-14: Bis heute las dieses Skript den Schluessel aus der
//      Salad-Gruppe, und der Kommentar hier behauptete ausdruecklich, env.local
//      sei "ein anderer und ergibt 401". Das stimmte zu Salad-Zeiten. Salad ist
//      abgeschaltet, Control laeuft auf Zeabur mit genau dem Wert aus env.local
//      — die Lage hat sich also umgekehrt. Die Salad-API antwortete weiterhin
//      mit der eingefrorenen alten Definition, das Skript meldete froehlich
//      "Anmelde-Nachweis erzeugt", und JEDE Livemessung lief still in 401.
//      Ein Werkzeug, das im Fehlerfall Erfolg meldet, ist schlimmer als keines.
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

const secret = String(process.env.SMEJJ_SESSION_SECRET || "");
if (!secret) {
  abbruch("SMEJJ_SESSION_SECRET fehlt in ~/.config/smejj.com/env.local — kein Token erzeugt."
    + " Es muss derselbe Wert sein, den der Dienst smejj-control bei Zeabur traegt.");
}

const token = issueSessionToken({
  secret,
  user: { userId: "eval-harness", email: ADRESSE, method: "local-e2e" },
  ttlMs: LAUFZEIT_MS
});

process.stderr.write(`Anmelde-Nachweis erzeugt (${Math.round(LAUFZEIT_MS / 60000)} Minuten gueltig).\n`);
process.stdout.write(token);
