// smejj.com Maus-Engine — ZWEITER Adapter: der echte Chrome des Betreibers.
//
// Der entscheidende Entwurfsschritt steht hier ganz oben, weil alles daran
// haengt: dieser Adapter setzt an derselben Naht an wie Playwright, naemlich
// an der browserFactory. Der Interpreter, seine Domain-Allowlist, sein
// Schritt- und Zeitbudget, die Datei-Grenzen und der Secret-Vault bleiben
// UNVERAENDERT und gelten damit bauartbedingt fuer beide Adapter. Es gibt
// keinen zweiten Weg an ihnen vorbei, weil es keinen zweiten Interpreter gibt.
//
// SICHERHEIT — verbindlich, nicht verhandelbar:
// Chrome wird NIEMALS mit --remote-debugging-port ferngesteuert. Dieser Port
// spricht ohne Herkunftspruefung mit jedem lokalen Programm und mit jeder
// Seite, die ihn erreicht; wer ihn oeffnet, gibt saemtliche angemeldeten
// Konten des Betreibers frei — Mail, Bank, Code-Hosting, alles zugleich.
// Stattdessen laeuft alles ueber eine Erweiterung, die je Herkunft eine
// sichtbare Erlaubnis des Betreibers braucht (extensions/smejj-maus-bruecke/).
//
// Zusaetzliche Einengungen gegenueber dem eigenen Browser im Serverraum:
//   * nur die fuenf Aktionen navigate/click/type/assert/screenshot
//     (chrome-befehl.mjs) — alles andere fail-closed abgelehnt
//   * nur https
//   * KEINE Secrets: der Vault gibt nichts an eine fremde Umgebung heraus
//   * je Herkunft eine ausdrueckliche Freigabe ZUSAETZLICH zur Allowlist
// Der eigene Browser bleibt der Normalweg; dieser Adapter ist die Ausnahme
// fuer Seiten, die nur im Chrome des Betreibers angemeldet sind.
import { baueBefehl, deuteAntwort, herkunftFreigegeben } from "./chrome-befehl.mjs";

const NICHT_UNTERSTUETZT = (was) => {
  throw new Error(`chrome_adapter_kann_nicht: ${was} (nur der eigene Browser beherrscht das)`);
};

/**
 * Baut eine browserFactory, die den echten Chrome ueber die Erweiterung
 * bedient. Der Transport ist injizierbar — ohne ihn entsteht gar nichts.
 * @param {{
 *   transport: {senden: (befehl:object) => Promise<object>},
 *   freigegebeneHerkuenfte: string[],
 *   einwilligungBestaetigt?: boolean
 * }} optionen
 * @returns {Function} browserFactory wie in worker.mjs
 */
export function createChromeAdapter({ transport, freigegebeneHerkuenfte = [], einwilligungBestaetigt = false } = {}) {
  if (!transport || typeof transport.senden !== "function") {
    throw new Error("chrome_adapter_transport_fehlt (fail-closed)");
  }
  // Ohne bestaetigte Einwilligung wird nicht einmal ein Adapter gebaut. Eine
  // stillschweigende Uebernahme des Betreiber-Browsers darf es nicht geben.
  if (einwilligungBestaetigt !== true) {
    throw new Error("chrome_adapter_ohne_sichtbare_einwilligung (fail-closed)");
  }

  async function schicke(befehl) {
    const antwort = await transport.senden(befehl);
    const gedeutet = deuteAntwort(antwort);
    if (!gedeutet.ok) throw new Error(gedeutet.error);
    return gedeutet.ergebnis;
  }

  function pruefeHerkunft(url) {
    if (!herkunftFreigegeben(url, freigegebeneHerkuenfte)) {
      throw new Error(`chrome_herkunft_nicht_freigegeben: ${sichereHerkunft(url)}`);
    }
  }

  // Ein Locator ist hier nur eine Beschreibung — aufgeloest wird sie erst in
  // der Erweiterung, im Seitenkontext. Nichts davon verlaesst den Rechner des
  // Betreibers ausser der Beschreibung selbst.
  function locatorFuer(beschreibung) {
    const locator = {
      beschreibung,
      async click(optionen = {}) {
        const gebaut = baueBefehl({ action: "click", target: { selector: beschreibung } });
        if (!gebaut.ok) throw new Error(gebaut.error);
        return schicke({ ...gebaut.befehl, timeoutMs: optionen.timeout ?? null });
      },
      async fill(text, optionen = {}) {
        const gebaut = baueBefehl({ action: "type", target: { selector: beschreibung }, text });
        if (!gebaut.ok) throw new Error(gebaut.error);
        return schicke({ ...gebaut.befehl, timeoutMs: optionen.timeout ?? null });
      },
      async type(text, optionen = {}) {
        return locator.fill(text, optionen);
      },
      async count() {
        const gebaut = baueBefehl({ action: "assert", condition: "selectorExists", target: { selector: beschreibung } });
        if (!gebaut.ok) throw new Error(gebaut.error);
        const ergebnis = await schicke(gebaut.befehl);
        return Number(ergebnis?.anzahl ?? 0);
      },
      async waitFor() { return locator.count(); },
      first() { return locator; },
      nth() { return locator; },
      // Alles Weitere gehoert in den eigenen Browser — hier ehrlich abgelehnt
      // statt halb nachgebaut.
      async hover() { NICHT_UNTERSTUETZT("hover"); },
      async check() { NICHT_UNTERSTUETZT("check"); },
      async uncheck() { NICHT_UNTERSTUETZT("uncheck"); },
      async selectOption() { NICHT_UNTERSTUETZT("selectOption"); },
      async dragTo() { NICHT_UNTERSTUETZT("dragAndDrop"); },
      async setInputFiles() { NICHT_UNTERSTUETZT("uploadFile"); },
      async textContent() { NICHT_UNTERSTUETZT("extract"); },
      async allTextContents() { NICHT_UNTERSTUETZT("extract"); },
      async getAttribute() { NICHT_UNTERSTUETZT("extract"); },
      async evaluate() { NICHT_UNTERSTUETZT("evaluate"); },
      async evaluateAll() { NICHT_UNTERSTUETZT("evaluate"); },
      async scrollIntoViewIfNeeded() { return {}; },
      async isVisible() { return (await locator.count()) > 0; }
    };
    return locator;
  }

  function seite() {
    let aktuelleUrl = "about:blank";
    const page = {
      url() { return aktuelleUrl; },
      async goto(url) {
        pruefeHerkunft(url);
        const gebaut = baueBefehl({ action: "navigate", url });
        if (!gebaut.ok) throw new Error(gebaut.error);
        const ergebnis = await schicke(gebaut.befehl);
        aktuelleUrl = String(ergebnis?.url || url);
        return { status: () => Number(ergebnis?.status ?? 200) };
      },
      async title() {
        const ergebnis = await schicke({ typ: "assert", bedingung: "titleContains", text: "" });
        return String(ergebnis?.titel ?? "");
      },
      async screenshot() {
        const gebaut = baueBefehl({ action: "screenshot", name: "chrome" });
        if (!gebaut.ok) throw new Error(gebaut.error);
        const ergebnis = await schicke(gebaut.befehl);
        if (!ergebnis?.pngBase64) throw new Error("chrome_screenshot_leer");
        return Buffer.from(String(ergebnis.pngBase64), "base64");
      },
      async waitForLoadState() { return undefined; },
      async waitForURL() { return undefined; },
      async bringToFront() { return undefined; },
      async close() { return undefined; },
      // Die Erweiterung fuehrt KEIN fremdes JavaScript aus. Ein evaluate waere
      // genau die Hintertuer, die dieser ganze Weg vermeiden soll.
      async evaluate() { NICHT_UNTERSTUETZT("evaluate"); },
      async content() { NICHT_UNTERSTUETZT("dom-snapshot"); },
      async pdf() { NICHT_UNTERSTUETZT("pdf"); },
      async waitForEvent() { NICHT_UNTERSTUETZT("download"); },
      keyboard: { async press() { NICHT_UNTERSTUETZT("hotkey"); } },
      mouse: {
        async click() { NICHT_UNTERSTUETZT("koordinaten-klick"); },
        async move() { NICHT_UNTERSTUETZT("koordinaten-maus"); },
        async wheel() { NICHT_UNTERSTUETZT("scroll"); }
      },
      locator(css) { return locatorFuer({ strategy: "css", value: css }); },
      getByRole(role, opts) { return locatorFuer({ strategy: "role", value: role, name: opts?.name }); },
      getByTestId(id) { return locatorFuer({ strategy: "testId", value: id }); },
      getByLabel(label) { return locatorFuer({ strategy: "label", value: label }); },
      getByText(text) { return locatorFuer({ strategy: "text", value: text }); },
      frameLocator() { NICHT_UNTERSTUETZT("frames"); }
    };
    return page;
  }

  return async function chromeBrowserFactory() {
    const context = {
      async newPage() { return seite(); },
      on() {},
      // Cookies des Betreibers werden weder gelesen noch geschrieben noch
      // gesichert. Genau darin unterscheidet sich sein Chrome vom eigenen
      // Browser: dort ist der Cookie-Krug ein Werkzeug, hier waere er ein Leck.
      async cookies() { NICHT_UNTERSTUETZT("cookies-lesen"); },
      async addCookies() { NICHT_UNTERSTUETZT("cookies-setzen"); },
      async clearCookies() { NICHT_UNTERSTUETZT("cookies-loeschen"); },
      async storageState() { NICHT_UNTERSTUETZT("storageState"); },
      async waitForEvent() { NICHT_UNTERSTUETZT("neuer-tab"); }
    };
    return {
      browser: {
        adapter: "chrome-erweiterung",
        async close() { return undefined; }
      },
      context
    };
  };
}

function sichereHerkunft(url) {
  try {
    return new URL(String(url)).origin;
  } catch {
    return "ungueltige-url";
  }
}
