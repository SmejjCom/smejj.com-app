// smejj.com Maus-Engine — Cookie-Banner-Heuristik (kein Modell).
// Single Responsibility: bekannte Consent-Banner nach Navigation
// automatisch schliessen. Reine Selektor-/Textliste, fail-open: wenn kein
// Banner gefunden wird, laeuft der Plan unveraendert weiter.

// ZWEI GETRENNTE LISTEN, nicht eine sortierte.
//
// Vorher stand hier EINE Liste mit dem Kommentar "Ablehnen vor Akzeptieren" —
// und sie hielt sich nicht daran: `uc-accept-all-button` stand VOR
// `uc-deny-all-button`. Auf einem Usercentrics-Banner sind beide sichtbar,
// geklickt wurde der erste Treffer. Ergebnis: die Maus stimmte ALLEN Cookies
// zu, obwohl direkt darueber das Gegenteil versprochen war.
//
// Eine Reihenfolge, die nur durch Sortierung stimmt, geht beim naechsten
// Eintrag wieder kaputt — jemand haengt einen Selektor unten an, und niemand
// sieht es. Zwei Listen koennen nicht falsch sortiert werden.
//
// Regel: Nicht-Notwendiges wird abgelehnt. Zustimmen ist die LETZTE Wahl und
// nur dafuer da, einen Banner wegzubekommen, der keine Ablehnung anbietet —
// sonst blockiert er die Seite und die Aufgabe scheitert.
const ABLEHNEN_SELECTORS = [
  "#onetrust-reject-all-handler",
  "button[data-testid='uc-deny-all-button']",
  "#CybotCookiebotDialogBodyButtonDecline",
  ".cc-compliance .cc-deny",
  ".cc-btn.cc-dismiss",
  "button[aria-label='Alle ablehnen']",
  "button[aria-label='Alles ablehnen']",
  "button[aria-label='Reject all']"
];

// Nur wenn keine Ablehnung angeboten wird.
const ZUSTIMMEN_SELECTORS = [
  "button#didomi-notice-agree-button",
  "button[data-testid='uc-accept-all-button']",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"
];

const ABLEHNEN_TEXTS = [
  "Alle ablehnen",
  "Alles ablehnen",
  "Nur notwendige",
  "Reject all",
  "Decline all"
];

const ZUSTIMMEN_TEXTS = [
  "Alle akzeptieren",
  "Accept all"
];

// Beide Reihenfolgen bleiben nach aussen sichtbar — Ablehnen zuerst, immer.
export const BANNER_SELECTORS = [...ABLEHNEN_SELECTORS, ...ZUSTIMMEN_SELECTORS];
export const BANNER_TEXTS = [...ABLEHNEN_TEXTS, ...ZUSTIMMEN_TEXTS];

// Fuer den Test: welcher Eintrag bedeutet Zustimmung?
export function istZustimmung(eintrag) {
  return ZUSTIMMEN_SELECTORS.includes(eintrag) || ZUSTIMMEN_TEXTS.includes(eintrag);
}

const CLICK_TIMEOUT_MS = 800;

// Versucht deterministisch (feste Reihenfolge, Ablehnen vor Akzeptieren),
// genau einen Banner-Button zu klicken. Rueckgabe: { closed, via }.
// ZWEI DURCHGAENGE, nicht eine Liste.
//
// Der erste Durchgang probiert JEDE Ablehnung — Selektor wie Text. Erst wenn
// keine greift, probiert der zweite die Zustimmung. Vorher lief erst die
// GESAMTE Selektorliste und danach erst die Texte: ein Zustimmen-Selektor
// schlug damit einen Ablehnen-TEXT auf derselben Seite. Zwei Listen allein
// haetten das nicht verhindert, die Reihenfolge der Mechanismen auch nicht.
async function klicke(page, eintraege, art) {
  for (const eintrag of eintraege) {
    try {
      const locator = art === "selector"
        ? page.locator(eintrag).first()
        : page.getByRole("button", { name: eintrag }).first();
      if (await locator.isVisible({ timeout: CLICK_TIMEOUT_MS })) {
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
        return { closed: true, via: `${art}:${eintrag}` };
      }
    } catch {
      // fail-open: naechsten Kandidaten pruefen
    }
  }
  return null;
}

export async function closeCookieBanner(page) {
  const ablehnen = await klicke(page, ABLEHNEN_SELECTORS, "selector")
    || await klicke(page, ABLEHNEN_TEXTS, "text");
  if (ablehnen) return ablehnen;
  const zustimmen = await klicke(page, ZUSTIMMEN_SELECTORS, "selector")
    || await klicke(page, ZUSTIMMEN_TEXTS, "text");
  return zustimmen || { closed: false, via: null };
}
