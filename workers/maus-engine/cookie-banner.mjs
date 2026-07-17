// smejj.com Maus-Engine — Cookie-Banner-Heuristik (kein Modell).
// Single Responsibility: bekannte Consent-Banner nach Navigation
// automatisch schliessen. Reine Selektor-/Textliste, fail-open: wenn kein
// Banner gefunden wird, laeuft der Plan unveraendert weiter.

const BANNER_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "#onetrust-reject-all-handler",
  "button#didomi-notice-agree-button",
  "button[data-testid='uc-accept-all-button']",
  "button[data-testid='uc-deny-all-button']",
  ".cc-btn.cc-dismiss",
  ".cc-compliance .cc-deny",
  "#CybotCookiebotDialogBodyButtonDecline",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "button[aria-label='Alle ablehnen']",
  "button[aria-label='Alles ablehnen']",
  "button[aria-label='Reject all']"
];

const BANNER_TEXTS = [
  "Alle ablehnen",
  "Alles ablehnen",
  "Nur notwendige",
  "Reject all",
  "Decline all",
  "Alle akzeptieren",
  "Accept all"
];

const CLICK_TIMEOUT_MS = 800;

// Versucht deterministisch (feste Reihenfolge, Ablehnen vor Akzeptieren),
// genau einen Banner-Button zu klicken. Rueckgabe: { closed, via }.
export async function closeCookieBanner(page) {
  for (const selector of BANNER_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: CLICK_TIMEOUT_MS })) {
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
        return { closed: true, via: `selector:${selector}` };
      }
    } catch {
      // fail-open: naechsten Kandidaten pruefen
    }
  }
  for (const text of BANNER_TEXTS) {
    try {
      const locator = page.getByRole("button", { name: text }).first();
      if (await locator.isVisible({ timeout: CLICK_TIMEOUT_MS })) {
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
        return { closed: true, via: `text:${text}` };
      }
    } catch {
      // fail-open
    }
  }
  return { closed: false, via: null };
}
