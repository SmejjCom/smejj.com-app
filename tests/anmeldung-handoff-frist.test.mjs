// Pruefer fuer die Frist des Anmelde-Tickets (session handoff).
//
// DER BEFUND (2026-08-22, Betreiber): "Google Login hat nicht geklappt" —
// Kontoauswahl kam, Konto gewaehlt, dann Fehler. Gemessen am Live-Dienst:
//
//   Anmelde-Ticket (handoff): 120 Sekunden
//   state, den Google zurueckschickt: 600 Sekunden
//
// Zwei Uhren bewachen dasselbe Fenster, und die kuerzere entscheidet still.
// Wer bei Google laenger als zwei Minuten brauchte — Kontoauswahl bei sechs
// Konten, Passwort, Bestaetigung per Handy — war dort ERFOLGREICH angemeldet
// und kam trotzdem ohne Token zurueck. Der Fehler traf also gerade die
// sorgfaeltigen Anmeldungen, und im Log stand nichts.
//
// Verschaerfend: der Rueckgabewert von `complete()` wurde nirgends geprueft.
// Bei verfallenem Ticket lief die Weiterleitung trotzdem in die App, die dann
// einen Token abholen wollte, den es nie gab.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSessionHandoffStore } from "../control-server/src/auth/sessionHandoff.js";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

// Die Frist des `state` steht in der Auth-Zustandsverwaltung. Beide muessen
// gleich gehen — deshalb misst dieser Pruefer sie GEGENEINANDER, statt eine
// Zahl festzuschreiben, die beim naechsten Umbau still auseinanderlaeuft.
function stateFristMs() {
  // Steht dort, wo der state gebaut wird: exp: Date.now() + N * 60 * 1000
  const quelle = readFileSync(join(WURZEL, "src", "auth", "googleAuthRoutes.js"), "utf8");
  const treffer = quelle.match(/exp:\s*Date\.now\(\)\s*\+\s*(\d+)\s*\*\s*60\s*\*\s*1000/);
  return treffer ? Number(treffer[1]) * 60 * 1000 : null;
}

test("das Anmelde-Ticket gilt mindestens so lange wie der state", () => {
  const uhr = () => 1_000_000;
  const store = createSessionHandoffStore({ now: uhr });
  const start = store.start("https://smejj.com");
  const ticketMs = start.expiresAt - uhr();
  const stateMs = stateFristMs();
  assert.ok(stateMs, "die state-Frist ist nicht mehr auffindbar — Pruefer misst ins Leere");
  assert.ok(
    ticketMs >= stateMs,
    `Ticket ${ticketMs / 1000}s < state ${stateMs / 1000}s — wer bei Google laenger braucht, kommt ohne Token zurueck (der Befund vom 2026-08-22)`
  );
});

test("die Kappung darf die Frist nicht heimlich halbieren", () => {
  // Vorher stand hier ein Deckel von 5 Minuten, waehrend die Frist auf 10
  // gesetzt war: die Aenderung waere wirkungslos geblieben.
  const uhr = () => 0;
  const store = createSessionHandoffStore({ now: uhr, ttlMs: 10 * 60 * 1000 });
  const start = store.start("https://smejj.com");
  assert.equal(start.expiresAt - uhr(), 10 * 60 * 1000, "ein Deckel kuerzt die gewuenschte Frist");
});

test("eine unsinnig lange Frist wird weiterhin begrenzt", () => {
  const uhr = () => 0;
  const store = createSessionHandoffStore({ now: uhr, ttlMs: 24 * 60 * 60 * 1000 });
  const start = store.start("https://smejj.com");
  assert.ok(start.expiresAt - uhr() <= 10 * 60 * 1000, "ein Ticket darf nicht stundenlang gelten");
});

test("ein verfallenes Ticket meldet sich — es tut nicht so, als waere alles gut", () => {
  let jetzt = 0;
  const store = createSessionHandoffStore({ now: () => jetzt });
  const start = store.start("https://smejj.com");
  jetzt = start.expiresAt + 1;
  const ergebnis = store.complete(start.id, { token: "t", user: { email: "a@b.de" } });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 404);
});

test("BEIDE Anmeldewege pruefen den Fehlschlag, statt ihn zu verschlucken", () => {
  // Ohne diese Pruefung leitet der Server in die App weiter, die dort einen
  // Token abholen will, den es nie gab — und der Nutzer sieht eine kaputte
  // Seite statt eines Grundes.
  for (const datei of ["googleAuthRoutes.js", "githubAuthRoutes.js"]) {
    const quelle = readFileSync(join(WURZEL, "src", "auth", datei), "utf8");
    assert.match(quelle, /const hinterlegt = sessionHandoffStore\.complete\(/, `${datei} verwirft das Ergebnis von complete()`);
    assert.match(quelle, /if \(!hinterlegt\?\.ok\)/, `${datei} prueft den Fehlschlag nicht`);
    assert.match(quelle, /fehler=anmeldung_abgelaufen/, `${datei} nennt dem Nutzer keinen Grund`);
  }
});
