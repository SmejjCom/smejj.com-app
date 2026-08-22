// smejj.com Maus-Engine — JS-Dialoge (alert/confirm/prompt/beforeunload).
//
// Single Responsibility: einen offenen Seiten-Dialog merken und beantworten.
// EIN Modul fuer beide Browser — die Maus-Engine und den Fern-Browser. Zwei
// Fassungen waeren zwei Verhalten, und das schwaechere faellt erst live auf
// (dieselbe Regel wie beim Selektor-Aufloeser).
//
// WARUM ES DAS BRAUCHT: Ohne Handler verwirft Playwright jeden Dialog
// automatisch. Eine Seite fragt "Wirklich loeschen?", und der Browser
// antwortet IMMER "Abbrechen" — ohne dass Nutzer oder Maus je erfahren, dass
// gefragt wurde. Was danach nicht passiert, sieht aus wie ein Fehler ganz
// woanders.
//
// DIE FOLGE, die man kennen MUSS: Solange ein Dialog offen ist, blockiert
// Chromium jede weitere Arbeit an der Seite — `screenshot()` und `title()`
// eingeschlossen. Gemessen 2026-08-21: page.screenshot() lief in den Timeout
// (2500 ms, kein Bild). Wer bei offenem Dialog ein Bild holen will, haengt.

const TEXT_GRENZE = 1000;
const VORGABE_GRENZE = 500;

/**
 * Haengt die Wache an eine Seite und liefert den Zugriff darauf.
 *
 * `zustand.offen` traegt den aktuellen Dialog (oder null). Der Playwright-
 * Griff bleibt INNEN — nach aussen gehen nur Text und Art, nie das Objekt,
 * mit dem man die Seite steuern koennte.
 */
export function haengeDialogWacheAn(page) {
  const zustand = { offen: null };
  if (typeof page?.on === "function") {
    page.on("dialog", (dialog) => {
      zustand.offen = {
        art: String(dialog.type?.() ?? "dialog"),
        // Der Text kommt aus einer untrusted Seite: gekappt, nie ausgefuehrt.
        nachricht: String(dialog.message?.() ?? "").slice(0, TEXT_GRENZE),
        vorgabe: String(dialog.defaultValue?.() ?? "").slice(0, VORGABE_GRENZE),
        griff: dialog
      };
    });
  }
  return zustand;
}

/** Was ein Aufrufer ueber den offenen Dialog erfahren darf (ohne den Griff). */
export function dialogNachAussen(zustand) {
  if (!zustand?.offen) return undefined;
  const { art, nachricht, vorgabe } = zustand.offen;
  return { art, nachricht, vorgabe: vorgabe || undefined };
}

/**
 * Beantwortet den offenen Dialog. `text` gilt nur fuer prompt().
 *
 * ERST vergessen, DANN beantworten: wirft accept()/dismiss(), waere die
 * Sitzung sonst dauerhaft auf einen Dialog festgenagelt, den es nicht mehr
 * gibt — und jede weitere Aktion liefe ins Leere.
 */
export async function beantworteDialog(zustand, { bestaetigen, text } = {}) {
  const offen = zustand?.offen;
  if (!offen) throw new Error("kein_dialog_offen");
  zustand.offen = null;
  if (bestaetigen) await offen.griff.accept(text ?? undefined);
  else await offen.griff.dismiss();
  return { art: offen.art, wie: bestaetigen ? "bestaetigt" : "abgelehnt" };
}

/**
 * Bewacht eine Seite und legt die Wachen-Ablage bei Bedarf selbst an.
 *
 * WARUM DEFENSIV: Der Zustand der Maus-Engine kommt nicht immer aus dem
 * Interpreter. Bei laufenden Sitzungen (session-registry) reicht ein
 * Aufrufer seinen EIGENEN Zustand herein, und der kannte die Wachen-Ablage
 * nicht — gemessen 2026-08-21: drei Sitzungstests brachen mit "Cannot read
 * properties of undefined (reading 'set')". Wer eine neue Ablage einfuehrt,
 * darf nicht voraussetzen, dass jeder Zustandsbauer sie kennt.
 */
export function bewacheSeite(state, tabId, page) {
  if (!state) return null;
  if (!(state.dialogWachen instanceof Map)) state.dialogWachen = new Map();
  const wache = haengeDialogWacheAn(page);
  state.dialogWachen.set(tabId, wache);
  return wache;
}

/** Die Wache des aktiven Tabs — oder null, wenn es keine gibt. */
export function wacheFuerAktivenTab(state) {
  if (!(state?.dialogWachen instanceof Map)) return null;
  return state.dialogWachen.get(state.activeTabId) || null;
}
