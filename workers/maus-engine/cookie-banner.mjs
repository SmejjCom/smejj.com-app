// smejj.com Maus-Engine — Cookie-Banner-Heuristik (kein Modell).
// Single Responsibility: bekannte Consent-Banner nach Navigation
// automatisch schliessen. Reine Selektor-/Textliste, fail-open: wenn kein
// Banner gefunden wird, laeuft der Plan unveraendert weiter.

// Was als ZUSTIMMUNG gilt. Bewusst so herum entschieden: erkennbar ist die
// ABLEHNUNG (reject, deny, decline, ablehnen, nur notwendige) — alles andere
// gilt als Zustimmung und wandert damit ans Ende. Ein unbekannter Eintrag
// wird so eher zu spaet geklickt als zu frueh, und das ist die
// datenschutzfreundliche Richtung.
const ABLEHNUNG_MUSTER = /reject|deny|decline|ablehn|nur notwendige|necessary|opt-?out/i;

/**
 * Bedeutet dieser Eintrag Zustimmung? Exportiert, damit der TUEV die
 * Reihenfolge der Listen pruefen kann — die Zusage "Ablehnen vor Zustimmen"
 * muss messbar sein, nicht nur im Kommentar stehen.
 */
export function istZustimmung(eintrag) {
  return !ABLEHNUNG_MUSTER.test(String(eintrag));
}

// REIHENFOLGE IST HIER SICHERHEIT, NICHT GESCHMACK (Fund vom 2026-08-17,
// wieder aufgetreten und am 2026-09-08 erneut behoben): stand ein
// Zustimmen-Eintrag vor einem Ablehnen-Eintrag, klickte die Maus auf einem
// Banner, das beide zeigt, den ersten Treffer — und stimmte ALLEM zu.
// ERST alle Ablehnungen, DANN alle Zustimmungen. Der Test
// "jede Ablehnung steht vor jeder Zustimmung" haelt das fest.
export const BANNER_SELECTORS = [
  // --- Ablehnen ---
  "#onetrust-reject-all-handler",
  "button[data-testid='uc-deny-all-button']",
  ".cc-compliance .cc-deny",
  "#CybotCookiebotDialogBodyButtonDecline",
  "button[aria-label='Alle ablehnen']",
  "button[aria-label='Alles ablehnen']",
  "button[aria-label='Reject all']",
  // --- Zustimmen: nur, wenn keine Ablehnung angeboten wird ---
  "#onetrust-accept-btn-handler",
  "button#didomi-notice-agree-button",
  "button[data-testid='uc-accept-all-button']",
  // "dismiss" schliesst bei cookieconsent OHNE Ablehnung — zaehlt als Zustimmung.
  ".cc-btn.cc-dismiss",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"
];

export const BANNER_TEXTS = [
  // --- Ablehnen ---
  "Alle ablehnen",
  "Alles ablehnen",
  "Nur notwendige",
  "Reject all",
  "Decline all",
  // --- Zustimmen ---
  "Alle akzeptieren",
  "Accept all"
];

const CLICK_TIMEOUT_MS = 800;

// Versucht deterministisch (feste Reihenfolge, Ablehnen vor Akzeptieren),
// genau einen Banner-Button zu klicken. Rueckgabe: { closed, via }.
export async function closeCookieBanner(page) {
  // Ein Versuch: sichtbar? dann klicken. Wirft nie — fail-open.
  const versuche = async (kandidat) => {
    try {
      const locator = kandidat.art === "selector"
        ? page.locator(kandidat.wert).first()
        : page.getByRole("button", { name: kandidat.wert }).first();
      if (await locator.isVisible({ timeout: CLICK_TIMEOUT_MS })) {
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
        return { closed: true, via: `${kandidat.art}:${kandidat.wert}` };
      }
    } catch {
      // fail-open: naechsten Kandidaten pruefen
    }
    return null;
  };

  const alle = [
    ...BANNER_SELECTORS.map((wert) => ({ art: "selector", wert })),
    ...BANNER_TEXTS.map((wert) => ({ art: "text", wert }))
  ];

  // ZWEI DURCHGAENGE, nicht zwei Listen (Fund vom 2026-08-17): frueher lief
  // die GESAMTE Selektorliste vor der ersten Textsuche. Ein Zustimmen-SELEKTOR
  // schlug damit einen Ablehnen-TEXT auf derselben Seite — die Maus stimmte zu,
  // obwohl daneben "Alle ablehnen" stand. Jetzt entscheidet die BEDEUTUNG
  // ueber die Reihenfolge, nicht die Art des Treffers.
  for (const kandidat of alle.filter((k) => !istZustimmung(k.wert))) {
    const treffer = await versuche(kandidat);
    if (treffer) return treffer;
  }
  // Zustimmen bleibt der letzte Ausweg — sonst blockiert ein Banner ohne
  // Ablehnung die Seite und jede Aufgabe darauf scheitert.
  for (const kandidat of alle.filter((k) => istZustimmung(k.wert))) {
    const treffer = await versuche(kandidat);
    if (treffer) return treffer;
  }
  return { closed: false, via: null };
}
