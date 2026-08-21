// Pruefer fuer die Eindeutigkeitsregel (Betreiber-Freigabe 2026-08-21).
//
// WAS SICH GEAENDERT HAT: Der Fern-Browser nahm bei mehreren Treffern
// kommentarlos `.first()`. Auf einer Seite mit zwei "Anmelden"-Knoepfen
// klickte die Maus damit STILLSCHWEIGEND den falschen — kein Fehler, kein
// Log, nur ein Ergebnis, das niemand erklaeren kann. ZCodes Regel ist
// eindeutig: Mehrdeutigkeit wird enger gefasst, nicht per Position versteckt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEindeutig, MehrdeutigError, NichtGefundenError } from "../workers/maus-engine/selector.mjs";

// Eine Seite, die sich wie Playwright verhaelt: getByRole liefert einen
// Locator, dessen count() die vorgegebene Trefferzahl meldet.
function seiteMitTreffern(anzahl) {
  // `nth` muss der Mock koennen: resolveLocator ruft es auf, wenn der
  // Selektor eine Position nennt. Ein Mock ohne nth misst sonst den Mock
  // statt die Regel.
  const locator = { count: async () => anzahl, klick: "ich bin der Locator", nth: () => locator };
  return {
    getByRole: () => locator,
    getByTestId: () => locator,
    getByLabel: () => locator,
    getByText: () => locator,
    locator: () => locator,
    frameLocator: () => ({ getByRole: () => locator })
  };
}

const ANMELDEN = { strategy: "role", value: "button", name: "Anmelden" };

test("gesunde Probe: genau EIN Treffer wird durchgelassen", async () => {
  const locator = await resolveEindeutig(seiteMitTreffern(1), ANMELDEN);
  assert.equal(locator.klick, "ich bin der Locator");
});

test("KAPUTTE Probe: zwei Treffer werden abgelehnt statt geraten", async () => {
  await assert.rejects(
    () => resolveEindeutig(seiteMitTreffern(2), ANMELDEN),
    (fehler) => {
      assert.ok(fehler instanceof MehrdeutigError);
      assert.equal(fehler.anzahl, 2);
      // Die Meldung muss dem Modell SAGEN, was zu tun ist — sonst raet es weiter.
      assert.match(fehler.message, /enger fassen/);
      assert.match(fehler.message, /Bedienbaum/);
      // Und sie muss benennen, WORUM es ging.
      assert.match(fehler.message, /name="Anmelden"/);
      return true;
    }
  );
});

test("kein Treffer: die Meldung verbietet ausdruecklich das Wiederholen", async () => {
  await assert.rejects(
    () => resolveEindeutig(seiteMitTreffern(0), ANMELDEN),
    (fehler) => {
      assert.ok(fehler instanceof NichtGefundenError);
      // ZCode: "A timeout is a signal to refresh the snapshot and rebuild the
      // locator, not to retry it unchanged."
      assert.match(fehler.message, /NICHT denselben wiederholen/);
      assert.match(fehler.message, /frischen Bedienbaum/);
      return true;
    }
  );
});

test("ausdrueckliches nth bleibt erlaubt — benannte Auswahl ist kein Zufall", async () => {
  const locator = await resolveEindeutig(seiteMitTreffern(5), { ...ANMELDEN, nth: 2 });
  assert.ok(locator, "ausdrueckliches nth wurde faelschlich abgelehnt");
});

test("Lesen darf mehrdeutig sein — es veraendert nichts", async () => {
  const locator = await resolveEindeutig(seiteMitTreffern(7), ANMELDEN, { erlaubeMehrere: true });
  assert.ok(locator);
});

test("ein Mock ohne count() bricht nicht — nicht schlechter als vorher", async () => {
  const seite = { getByRole: () => ({ ohneCount: true }) };
  const locator = await resolveEindeutig(seite, ANMELDEN);
  assert.equal(locator.ohneCount, true);
});

test("die Session-Engine reicht den Mehrdeutigkeits-Fehler durch", async () => {
  // Der Fehler muss beim AUFRUFER ankommen, sonst ist die Regel wertlos.
  const { createSessionEngine } = await import("../workers/remote-browser/session-engine.js");
  assert.equal(typeof createSessionEngine, "function");
  // Die Engine benutzt resolveEindeutig — belegt durch den Quelltext, weil ein
  // echter Lauf einen Browser braeuchte.
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("../workers/remote-browser/session-engine.js", import.meta.url), "utf8");
  assert.match(quelle, /resolveEindeutig\(page, def/, "Session-Engine nutzt die Eindeutigkeitsregel nicht");
  assert.ok(!/resolveLocator\(page, def\)\.first\(\)/.test(quelle), "das alte .first() steht noch drin");
});

test("Mehrdeutigkeit wird NICHT wiederholt — Warten macht aus zwei nie eins", async () => {
  const { withRetries } = await import("../workers/maus-engine/retry.mjs");
  let versuche = 0;
  const ergebnis = await withRetries(
    async () => { versuche += 1; throw new MehrdeutigError(2, ANMELDEN); },
    { retries: 3, delayFn: async () => {} }
  );
  assert.equal(ergebnis.ok, false);
  assert.equal(versuche, 1, `mehrdeutiger Selektor wurde ${versuche}-mal probiert statt einmal`);
});

test("andere Fehler werden weiterhin wiederholt — die Regel ist eng gefasst", async () => {
  const { withRetries } = await import("../workers/maus-engine/retry.mjs");
  let versuche = 0;
  await withRetries(
    async () => { versuche += 1; throw new Error("netz_kurz_weg"); },
    { retries: 2, delayFn: async () => {} }
  );
  assert.equal(versuche, 3, "gewoehnliche Fehler duerfen nicht plötzlich abbrechen");
});
