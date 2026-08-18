// Cookie-Banner der Maus-Engine: die Reihenfolge ist eine Datenschutz-Zusage,
// keine Kosmetik. Nicht-Notwendiges wird abgelehnt; zugestimmt wird nur, um
// einen Banner wegzubekommen, der keine Ablehnung anbietet.
import test from "node:test";
import assert from "node:assert/strict";
import { closeCookieBanner, BANNER_SELECTORS, BANNER_TEXTS, istZustimmung } from "../workers/maus-engine/cookie-banner.mjs";

function seite({ sichtbareSelektoren = [], sichtbareTexte = [] } = {}) {
  return {
    locator: (s) => ({ first: () => ({
      isVisible: async () => sichtbareSelektoren.includes(s),
      click: async () => {}
    }) }),
    getByRole: (_rolle, opts) => ({ first: () => ({
      isVisible: async () => sichtbareTexte.includes(opts?.name),
      click: async () => {}
    }) })
  };
}

// DER FUND vom 2026-08-17: Die Liste trug den Kommentar "Ablehnen vor
// Akzeptieren" und hielt sich nicht daran — `uc-accept-all-button` stand VOR
// `uc-deny-all-button`. Auf einem Usercentrics-Banner sind beide sichtbar,
// geklickt wurde der erste Treffer: die Maus stimmte ALLEM zu.
test("Usercentrics: es wird abgelehnt, nicht zugestimmt", async () => {
  const r = await closeCookieBanner(seite({ sichtbareSelektoren: [
    "button[data-testid='uc-accept-all-button']",
    "button[data-testid='uc-deny-all-button']"
  ] }));
  assert.equal(r.closed, true);
  assert.match(r.via, /uc-deny-all-button/);
});

// Zwei Listen allein haetten nicht gereicht: vorher lief die GESAMTE
// Selektorliste vor der ersten Textsuche, also schlug ein Zustimmen-Selektor
// einen Ablehnen-TEXT auf derselben Seite.
test("Ablehnen-Text schlaegt Zustimmen-Selektor", async () => {
  const r = await closeCookieBanner(seite({
    sichtbareSelektoren: ["button#didomi-notice-agree-button"],
    sichtbareTexte: ["Alle ablehnen"]
  }));
  assert.equal(r.via, "text:Alle ablehnen");
});

// Zustimmen bleibt moeglich — sonst blockiert ein Banner ohne Ablehnung die
// Seite und jede Aufgabe darauf scheitert.
test("ohne jede Ablehnung wird zugestimmt, damit die Seite frei wird", async () => {
  const r = await closeCookieBanner(seite({
    sichtbareSelektoren: ["button#didomi-notice-agree-button"]
  }));
  assert.equal(r.via, "selector:button#didomi-notice-agree-button");
});

test("kein Banner: fail-open, der Plan laeuft unveraendert weiter", async () => {
  const r = await closeCookieBanner(seite());
  assert.deepEqual(r, { closed: false, via: null });
});

// Haelt die Zusage fest, auch wenn jemand spaeter Eintraege anhaengt.
test("jede Ablehnung steht vor jeder Zustimmung", () => {
  for (const liste of [BANNER_SELECTORS, BANNER_TEXTS]) {
    const ersteZustimmung = liste.findIndex(istZustimmung);
    if (ersteZustimmung === -1) continue;
    const danach = liste.slice(ersteZustimmung);
    assert.ok(danach.every(istZustimmung), `ab Platz ${ersteZustimmung + 1} darf keine Ablehnung mehr folgen: ${danach.filter((e) => !istZustimmung(e)).join(", ")}`);
  }
});
