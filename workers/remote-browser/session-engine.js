// smejj.com Remote-Browser Session-Engine.
// Interaktive Browser-Sessions fuer den Live-Browser: eine Playwright-Seite
// bleibt pro Session offen, Aktionen (Klick, Tippen, Scrollen, Navigation)
// werden deterministisch ausgefuehrt und liefern jeweils einen frischen
// Viewport-Screenshot zurueck. Fail-closed: unbekannte Aktionen, unbekannte
// Sessions und blockierte Ziele werden abgelehnt. Sessions enden automatisch
// (Idle-Timeout + Hard-Limit) — keine laufenden Fixkosten.
// Sicherheits-Helfer (SSRF-Schutz) kommen per Dependency Injection aus
// worker.js, damit exakt dieselben Pruefungen gelten wie beim Einmal-Rendern.
import { resolveLocator, resolveEindeutig } from "../maus-engine/selector.mjs";
import { buildObservation } from "../maus-engine/observer.mjs";
import { buildAriaObservation } from "../maus-engine/aria-baum.mjs";
import { randomBytes } from "node:crypto";
import { starteBildschirm } from "./bildschirm.mjs";
import { lookup } from "node:dns/promises";

// Wo Konto-Profile liegen. /tmp, weil der Container ohnehin kein dauerhaftes
// Laufwerk hat — der Pfad macht das ehrlich sichtbar, statt Dauerhaftigkeit
// vorzutaeuschen.
const PROFIL_WURZEL = process.env.SMEJJ_BROWSER_PROFIL_WURZEL || "/tmp/smejj-browser-profile";

export const SESSION_DEFAULTS = {
  maxSessions: 4,
  // BETREIBER-ANSAGE 2026-08-20 ("mach 1 zu 1 wie Chrome"): Ein Browser wirft
  // dich nicht nach anderthalb Minuten hinaus. Die alten 90 s Untaetigkeit
  // waren der wahrscheinlichste Grund, dass Anmeldungen abbrachen — wer eine
  // Adresse eintippt, sein Passwort sucht und auf einen Bestaetigungscode
  // wartet, ist muehelos laenger still. Mit dem harten Deckel von 10 Minuten
  // war selbst eine zuegige Anmeldung ein Wettlauf.
  //
  // Die Grenzen bleiben ENDLICH, weil jede Sitzung einen echten Chrome auf
  // dem Server offen haelt (Arbeitsspeicher, und maxSessions ist 2): eine
  // vergessene Sitzung darf den Platz nicht fuer immer blockieren.
  idleTimeoutMs: 1_800_000,
  hardLimitMs: 14_400_000,
  actionTimeoutMs: 15_000,
  navTimeoutMs: 25_000,
  settleTimeoutMs: 4_000,
  jpegQuality: 70,
  typeMaxChars: 2_000,
  scrollMaxPx: 4_000
};

export const SESSION_ALLOWED_KEYS = new Set([
  "Enter", "Tab", "Escape", "Backspace", "Delete",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End"
]);

// Bearbeiten-Kuerzel, die eine Anmeldung ueberhaupt erst bequem machen:
// ohne Einfuegen muss man jedes Passwort aus dem Manager ABTIPPEN (Betreiber
// 2026-08-20). Bewusst eine kurze Liste statt "alle Kombinationen": was hier
// nicht steht, kommt nicht durch — etwa Kuerzel, die Fenster oeffnen oder
// Entwicklerwerkzeuge starten.
//
// "Control" steht fuer die Modifikatortaste des Systems; Playwright bildet
// "ControlOrMeta" auf Cmd (macOS) bzw. Strg ab. Der Fern-Browser laeuft unter
// Linux, der Betreiber sitzt am Mac — deshalb NICHT fest verdrahten.
export const SESSION_ALLOWED_COMBOS = new Set([
  "ControlOrMeta+v",  // Einfuegen — der eigentliche Grund fuer diese Liste
  "ControlOrMeta+c",  // Kopieren
  "ControlOrMeta+x",  // Ausschneiden
  "ControlOrMeta+a",  // Alles markieren
  "ControlOrMeta+z"   // Rueckgaengig
]);

// Pure Validierung des Aktions-Objekts (ohne Playwright testbar).
// Liefert fail-closed { ok:false, error } oder { ok:true, action } mit
// normalisierten Werten.
// Dieselben Strategien, die die Maus kennt — css/xpath bleiben moeglich, aber
// role/testId/label sind die stabilen: sie ueberleben ein Umgestalten der Seite.
const ERLAUBTE_STRATEGIEN = new Set(["role", "testId", "label", "text", "placeholder", "altText", "title", "css", "xpath"]);

export function validateSessionAction(action, limits = SESSION_DEFAULTS) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return { ok: false, error: "action_missing" };
  }
  switch (action.type) {
    case "click": {
      const xPct = Number(action.xPct);
      const yPct = Number(action.yPct);
      if (!Number.isFinite(xPct) || !Number.isFinite(yPct) || xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) {
        return { ok: false, error: "click_coordinates_invalid" };
      }
      const button = action.button === "right" ? "right" : "left";
      const clicks = action.clicks === 2 ? 2 : 1;
      return { ok: true, action: { type: "click", xPct, yPct, button, clicks } };
    }
    case "type": {
      const text = typeof action.text === "string" ? action.text : "";
      if (!text || text.length > limits.typeMaxChars) return { ok: false, error: "type_text_invalid" };
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, error: "type_text_invalid" };
      return { ok: true, action: { type: "type", text } };
    }
    case "key": {
      const key = String(action.key || "");
      if (SESSION_ALLOWED_KEYS.has(key)) return { ok: true, action: { type: "key", key } };
      // Kombination? Nur die ausdruecklich erlaubten, in genau dieser
      // Schreibweise — sonst waere die Liste durch Varianten umgehbar.
      if (SESSION_ALLOWED_COMBOS.has(key)) return { ok: true, action: { type: "key", key } };
      return { ok: false, error: "key_not_allowed" };
    }
    case "scroll": {
      const deltaY = Number(action.deltaY);
      if (!Number.isFinite(deltaY) || deltaY === 0) return { ok: false, error: "scroll_delta_invalid" };
      const clamped = Math.max(-limits.scrollMaxPx, Math.min(limits.scrollMaxPx, Math.round(deltaY)));
      return { ok: true, action: { type: "scroll", deltaY: clamped } };
    }
    case "navigate": {
      const url = String(action.url || "");
      if (!/^https?:\/\//i.test(url) || url.length > 2_000) return { ok: false, error: "navigate_url_invalid" };
      return { ok: true, action: { type: "navigate", url } };
    }
    // Aktionen, die auf ELEMENTE zielen statt auf Pixel. Sie sind der Weg,
    // auf dem die Maus spaeter DIESEN Browser bedient: ein Plan nennt
    // Rolle/Beschriftung, keine Koordinaten. Ein Klick auf Prozentwerte
    // waere bei jeder Fensterbreite ein anderer.
    case "selectorClick":
    case "selectorType":
    case "selectorText": {
      const strategy = String(action.strategy || "");
      const value = String(action.value || "");
      if (!ERLAUBTE_STRATEGIEN.has(strategy)) return { ok: false, error: "selector_strategy_not_allowed" };
      if (!value || value.length > 300) return { ok: false, error: "selector_value_invalid" };
      const gebaut = { type: action.type, strategy, value };
      if (action.name !== undefined) gebaut.name = String(action.name).slice(0, 200);
      if (action.type === "selectorType") {
        const text = String(action.text ?? "");
        if (!text || text.length > limits.typeMaxChars) return { ok: false, error: "type_text_invalid" };
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, error: "type_text_invalid" };
        gebaut.text = text;
      }
      return { ok: true, action: gebaut };
    }
    // HINSEHEN. Der Baustein, mit dem die Maus im Panel wie Claudes Maus
    // arbeiten kann: erst schauen, was da ist, dann entscheiden. Ohne ihn
    // muss sie alles vorab planen und scheitert an jeder Ueberraschung.
    case "observe":
      return { ok: true, action: { type: "observe" } };
    // HINSEHEN MIT DEM ARIA-BAUM. Dasselbe Ziel wie "observe", aber die
    // Quelle ist Chromiums eigener Bedienbaum statt einer Selektorliste —
    // das Vorbild ist ZCodes domSnapshot. Bewusst eine EIGENE Aktion und
    // kein Umbau von "observe": der alte Weg bleibt unveraendert gueltig,
    // solange der neue nicht an echten Seiten bewiesen ist.
    case "ariaObserve":
      return { ok: true, action: { type: "ariaObserve" } };
    // JS-DIALOGE beantworten. Zwei Aktionen statt einer mit Schalter: was
    // eine Seite bestaetigt, ist nicht umkehrbar ("Wirklich loeschen?"),
    // und dafuer soll im Protokoll ein eigenes Wort stehen.
    case "dialogAccept": {
      // Nur ein prompt() nimmt Text entgegen; bei alert/confirm wird er
      // ignoriert (Playwright tut das ohnehin) — hier nur gekappt.
      const text = action.text === undefined ? undefined : String(action.text).slice(0, limits.typeMaxChars);
      if (text !== undefined && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
        return { ok: false, error: "type_text_invalid" };
      }
      const gebaut = { type: "dialogAccept" };
      if (text !== undefined) gebaut.text = text;
      return { ok: true, action: gebaut };
    }
    case "dialogDismiss":
      return { ok: true, action: { type: "dialogDismiss" } };
    case "find": {
      // Suche in der Seite. Der Text ist Nutzereingabe und wird NICHT als
      // Code ausgefuehrt — er geht als Argument in page.evaluate, nie in
      // eine zusammengebaute Zeichenkette.
      const text = String(action.text ?? "");
      if (text.length > 200) return { ok: false, error: "find_text_too_long" };
      const index = Number.isFinite(Number(action.index)) ? Math.max(0, Math.floor(Number(action.index))) : 0;
      return { ok: true, action: { type: "find", text, index } };
    }
    case "back":
    case "forward":
    case "reload":
      return { ok: true, action: { type: action.type } };
    default:
      return { ok: false, error: "action_unknown" };
  }
}

export function createSessionEngine({
  isAllowedTarget,
  buildPageOptions,
  assertPublicHostname,
  assertPublicRequest,
  playwrightLoader,
  dnsLookup = lookup,
  now = Date.now,
  randomId = () => randomBytes(16).toString("hex"),
  ...overrides
} = {}) {
  if (typeof isAllowedTarget !== "function" || typeof buildPageOptions !== "function"
    || typeof assertPublicHostname !== "function" || typeof assertPublicRequest !== "function"
    || typeof playwrightLoader !== "function") {
    throw new Error("session_engine_dependencies_missing");
  }
  const cfg = { ...SESSION_DEFAULTS, ...overrides };
  const sessions = new Map();

  function fail(status, error) {
    return { ok: false, status, error: String(error || "session_error").slice(0, 200) };
  }

  function expiresInMs(session) {
    const idleLeft = cfg.idleTimeoutMs;
    const hardLeft = Math.max(0, session.createdAt + cfg.hardLimitMs - now());
    return Math.min(idleLeft, hardLeft);
  }

  function touch(session) {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      destroy(session.id).catch(() => {});
    }, cfg.idleTimeoutMs);
    // Der Timer darf einen ansonsten fertigen Prozess nicht am Leben halten.
    session.idleTimer.unref?.();
  }

  async function destroy(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    sessions.delete(sessionId);
    clearTimeout(session.idleTimer);
    await session.browser.close().catch(() => {});
    return true;
  }

  /**
   * JS-Dialoge (alert/confirm/prompt/beforeunload) sichtbar machen.
   *
   * OHNE Handler verwirft Playwright jeden Dialog automatisch. Das sieht
   * harmlos aus, ist es aber nicht: eine Seite fragt "Wirklich loeschen?",
   * und der Fern-Browser antwortet IMMER "Abbrechen" — ohne dass Nutzer
   * oder Maus je erfahren, dass gefragt wurde. Wer im Panel sitzt, sieht
   * eine Seite, die auf seinen Klick scheinbar nicht reagiert.
   *
   * Mit Handler bleibt der Dialog offen, bis jemand entscheidet. Genau das
   * ist gewollt (ZCode macht es mit getJsDialog() ebenso) — aber es hat
   * eine Folge, die man kennen MUSS: solange ein Dialog offen ist,
   * blockiert Chromium jede weitere Arbeit an der Seite, screenshot() und
   * title() eingeschlossen. Deshalb liefert snapshot() dann das zuletzt
   * gemachte Bild statt zu haengen.
   */
  function merkeDialoge(session) {
    if (typeof session.page?.on !== "function") return;
    session.page.on("dialog", (dialog) => {
      session.dialog = {
        art: String(dialog.type?.() ?? "dialog"),
        // Der Text kommt aus einer untrusted Seite: gekappt, nie ausgefuehrt.
        nachricht: String(dialog.message?.() ?? "").slice(0, 1000),
        vorgabe: String(dialog.defaultValue?.() ?? "").slice(0, 500),
        griff: dialog
      };
    });
  }

  // Was der Aufrufer ueber einen offenen Dialog erfahren darf (ohne den
  // Playwright-Griff, der gehoert nur uns).
  function dialogNachAussen(session) {
    if (!session.dialog) return undefined;
    const { art, nachricht, vorgabe } = session.dialog;
    return { art, nachricht, vorgabe: vorgabe || undefined };
  }

  async function snapshot(session) {
    const page = session.page;
    // Bei offenem Dialog KEIN Screenshot: der Aufruf kaeme nie zurueck.
    if (session.dialog) {
      return {
        ok: true,
        sessionId: session.id,
        screenshot: session.letztesBild || "",
        finalUrl: page.url(),
        title: "",
        viewport: session.viewport,
        expiresInMs: expiresInMs(session),
        dialog: dialogNachAussen(session)
      };
    }
    const screenshot = await page.screenshot({ type: "jpeg", quality: cfg.jpegQuality });
    const title = await page.title().catch(() => "");
    const bild = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    session.letztesBild = bild;
    return {
      ok: true,
      sessionId: session.id,
      screenshot: bild,
      finalUrl: page.url(),
      title,
      viewport: session.viewport,
      expiresInMs: expiresInMs(session)
    };
  }

  /**
   * Verzeichnis, in dem ein Konto seine Cookies behaelt.
   *
   * BETREIBER-WUNSCH 2026-08-20 ("angemeldet bleiben"): Ohne Profil startet
   * jede Sitzung bei null — man meldet sich an, und beim naechsten Oeffnen
   * ist alles wieder weg. Mit Profil bleibt die Anmeldung, solange der
   * Dienst laeuft.
   *
   * GRENZEN, offen benannt: Der Container hat KEIN dauerhaftes Laufwerk.
   * Ein Neustart oder ein Deploy des Dienstes loescht die Profile — dann
   * muss man sich einmal neu anmelden. Fuer echte Dauerhaftigkeit muesste
   * ein Datentraeger eingehaengt werden; das ist eine eigene Entscheidung.
   *
   * TRENNUNG: Die Kennung kommt SERVERSEITIG aus der angemeldeten Identitaet
   * (gehasht, siehe profilKennung im Control-Server). Sie wird hier nochmals
   * streng geprueft — ein Wert mit Pfadanteilen wuerde sonst aus dem
   * Profilordner ausbrechen.
   */
  function profilVerzeichnis(profil) {
    const sauber = String(profil || "");
    if (!/^[a-f0-9]{16,64}$/.test(sauber)) return null;
    return `${PROFIL_WURZEL}/${sauber}`;
  }

  async function open({ url, viewport = {}, profil = "" } = {}) {
    // VOLL? Dann die AELTESTE verdraengen statt abzulehnen.
    //
    // BEFUND 2026-08-20, unmittelbar nach der Verlaengerung der Lebensdauer:
    // Der Betreiber bekam beim Anmelden kein Passwortfeld. Ursache war nicht
    // die Anmeldeseite, sondern dieses Limit — /api/browser/session
    // antwortete 429, der Client fiel auf den Standbild-Worker zurueck, und
    // in einem Standbild gibt es nichts zu tippen.
    //
    // Verursacht hatte es die eigene Verbesserung: solange Sitzungen nach
    // 90 s starben, raeumten sie sich von selbst weg. Mit 30 Minuten
    // blockierten zwei vergessene Sitzungen beide Plaetze eine halbe Stunde.
    // Eine laengere Lebensdauer VERLANGT deshalb eine Verdraengung — sonst
    // macht sie das System unbenutzbarer statt besser.
    //
    // Ein Browser sagt auch nie "zu viele Tabs": er raeumt still auf.
    while (sessions.size >= cfg.maxSessions) {
      const aelteste = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!aelteste) break;
      await destroy(aelteste.id);
    }
    const parsed = isAllowedTarget(url);
    if (!parsed.ok) return fail(400, parsed.error);
    try {
      await assertPublicHostname(parsed.url.hostname, dnsLookup);
    } catch {
      return fail(400, "Ziel-Host ist blockiert.");
    }
    const playwright = await playwrightLoader();
    // WARUM NICHT MEHR HEADLESS (recherchiert und gemessen 2026-08-20):
    // Google blockiert Anmeldungen aus automatisierten Browsern seit Januar
    // 2021 ausdruecklich — der Betreiber bekam deshalb "kein Passwortfeld".
    // Headless ist dabei das lauteste Signal, und `navigator.webdriver`
    // meldet zusaetzlich von selbst "ich bin automatisiert".
    //
    // Zwei Gegenmassnahmen, beide billig:
    //   * headful auf einem VIRTUELLEN Bildschirm (Xvfb liegt im
    //     Playwright-Image bereit, der Container startet unter xvfb-run) —
    //     kein Desktop noetig, aber ein echter Fensterbaum.
    //   * --disable-blink-features=AutomationControlled setzt
    //     navigator.webdriver auf false, und zwar in der Engine, nicht per
    //     nachgeschobenem Skript.
    //
    // EHRLICHE GRENZE: Das ist keine Tarnkappe. Google arbeitet aktiv
    // dagegen und wird Anmeldungen weiter erschweren — fuer Google-Dienste
    // ist OAuth der richtige Weg, nicht das Nachbauen einer Passworteingabe.
    // Fuer Amazon, Alibaba und die meisten Seiten reicht es.
    //
    // --single-process ist BEWUSST WEG: mit echtem Fensterbaum ist er
    // instabil (Renderer und Browser im selben Prozess), und genau dort
    // laufen die Seiten, die uns interessieren.
    const startArgs = [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1365,900"
    ];
    // HEADFUL nur, wenn wirklich ein Bildschirm steht.
    //
    // Der Bildschirm wird IM laufenden Worker gestartet (bildschirm.mjs), nicht
    // per Wrapper im CMD — der hat am 2026-08-20 den ganzen Dienst am
    // Hochkommen gehindert (live 502). Klappt der Start nicht, liefert
    // starteBildschirm() null und wir bleiben headless: schlechter getarnt,
    // aber erreichbar. Verfuegbarkeit schlaegt Tarnung.
    //
    // Der Schalter erlaubt zusaetzlich, headful OHNE neuen Bau abzuschalten —
    // eine Umgebungsvariable wirkt beim naechsten Sitzungsaufbau.
    const headfulGewuenscht = String(process.env.SMEJJ_BROWSER_HEADFUL || "").toLowerCase() === "true";
    const bildschirm = headfulGewuenscht ? await starteBildschirm().catch(() => null) : null;
    const kopflos = !bildschirm;
    const pageOptions = buildPageOptions(viewport);
    const verzeichnis = profilVerzeichnis(profil);
    // Mit Konto-Profil: dauerhafter Kontext, die Anmeldung ueberlebt die
    // Sitzung. Ohne: fluechtiges Fenster wie bisher (fail-closed).
    // NOTAUSGANG: headful braucht einen laufenden X-Server. Ist er nicht da
    // (falsch gestarteter Container, fremde Umgebung, kuenftiger Umbau),
    // scheitert der Start mit "launched a headed browser without having a
    // XServer running" — und der ganze Browser waere TOT.
    //
    // Ein Fern-Browser, der gar nicht startet, ist schlimmer als einer, den
    // Google erkennt. Deshalb wird bei einem Fehlschlag still auf headless
    // zurueckgefallen: schlechter getarnt, aber benutzbar. Lokal war headful
    // nicht pruefbar (amd64-Chrome unter Emulation auf einem ARM-Mac), und
    // ungeprueft deployen heisst hier: den Dienst aufs Spiel setzen.
    async function starte(ohneBildschirm) {
      return verzeichnis
        ? playwright.chromium.launchPersistentContext(verzeichnis, { headless: ohneBildschirm, args: startArgs, ...pageOptions })
        : playwright.chromium.launch({ headless: ohneBildschirm, args: startArgs });
    }

    // Der Notausgang deckt den GANZEN Aufbau ab, nicht nur den Start.
    //
    // Gemessen 2026-08-21: headful startete sauber und starb erst beim ERSTEN
    // Seitenaufbau ("Target page, context or browser has been closed"). Ein
    // Notausgang, der nur launch() umschliesst, greift dann NICHT — und der
    // Nutzer bekommt 502 statt eines Browsers. Deshalb gilt der Versuch erst
    // als gelungen, wenn auch eine Seite steht.
    async function baueAuf(ohneBildschirm) {
      const b = await starte(ohneBildschirm);
      try {
        // launchPersistentContext LIEFERT den Kontext, nicht den Browser: dort
        // gibt es bereits eine Seite, und newPage() wuerde eine zweite oeffnen.
        const p = verzeichnis ? (b.pages()[0] || await b.newPage()) : await b.newPage(pageOptions);
        return { browser: b, page: p };
      } catch (fehler) {
        await b.close().catch(() => {});
        throw fehler;
      }
    }

    const sitzungsId = randomId();
    let browser;
    let erstesBlatt;
    try {
      ({ browser, page: erstesBlatt } = await baueAuf(kopflos));
    } catch (fehler) {
      if (kopflos) throw fehler;
      // Headful hat nicht getragen — headless ist immer noch besser als nichts.
      ({ browser, page: erstesBlatt } = await baueAuf(true));
    }
    try {
      const page = erstesBlatt;
      const networkSafety = new Map();
      if (typeof page.route === "function") {
        await page.route("**/*", async (route) => {
          try {
            await assertPublicRequest(route.request().url(), dnsLookup, networkSafety);
            await route.continue();
          } catch {
            await route.abort("blockedbyclient");
          }
        });
      }
      page.setDefaultTimeout(cfg.actionTimeoutMs);
      await page.goto(parsed.url.toString(), { waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs });
      await page.waitForLoadState("networkidle", { timeout: cfg.settleTimeoutMs }).catch(() => {});
      // EIN STERBENDER BROWSER DARF NICHT DEN DIENST MITNEHMEN.
      //
      // Gemessen 2026-08-21: stuerzt Chrome ab (headful war der Ausloeser,
      // der Fall gilt aber immer), meldet Playwright den Fehler asynchron —
      // weit ausserhalb jedes try/catch. Der Crash-Guard des Workers macht
      // daraus pflichtgemaess einen Exit 1, und der GANZE Fern-Browser ist
      // weg, samt aller anderen Sitzungen. Der Container war danach tot.
      //
      // Ein abgestuerzter Browser ist ein normaler Betriebsfall, kein
      // Programmfehler: wir raeumen die betroffene Sitzung auf und lassen den
      // Dienst laufen. Die naechste Anfrage baut einfach neu auf.
      browser.on?.("disconnected", () => {
        const tot = sessions.get(sitzungsId);
        if (!tot) return;
        sessions.delete(sitzungsId);
        clearTimeout(tot.idleTimer);
      });

      const session = {
        id: sitzungsId,
        browser,
        page,
        viewport: pageOptions.viewport,
        createdAt: now(),
        idleTimer: null,
        busy: false,
        // Ein offener JS-Dialog (alert/confirm/prompt). Siehe merkeDialoge().
        dialog: null,
        letztesBild: null
      };
      merkeDialoge(session);
      sessions.set(session.id, session);
      touch(session);
      return await snapshot(session);
    } catch (error) {
      await browser.close().catch(() => {});
      return fail(502, error?.message || error);
    }
  }

  async function performAction(session, action) {
    const page = session.page;
    const { width, height } = session.viewport;
    switch (action.type) {
      case "click": {
        const x = Math.round((action.xPct / 100) * width);
        const y = Math.round((action.yPct / 100) * height);
        await page.mouse.click(x, y, { button: action.button, clickCount: action.clicks });
        await page.waitForLoadState("domcontentloaded", { timeout: cfg.settleTimeoutMs }).catch(() => {});
        await page.waitForTimeout?.(350)?.catch?.(() => {});
        return;
      }
      case "type":
        await page.keyboard.type(action.text, { delay: 15 });
        return;
      case "key":
        await page.keyboard.press(action.key);
        await page.waitForLoadState("domcontentloaded", { timeout: cfg.settleTimeoutMs }).catch(() => {});
        await page.waitForTimeout?.(250)?.catch?.(() => {});
        return;
      case "scroll":
        await page.mouse.wheel(0, action.deltaY);
        await page.waitForTimeout?.(150)?.catch?.(() => {});
        return undefined;
      case "selectorClick":
      case "selectorType":
      case "selectorText": {
        // DER AUFLOESER DER MAUS, nicht ein zweiter. Beide muessen Elemente
        // gleich finden — sonst tut die Maus im Panel etwas anderes als in
        // ihrem eigenen Browser, und das faellt erst live auf.
        const def = { strategy: action.strategy, value: action.value };
        if (action.name !== undefined) def.name = action.name;
        // EINDEUTIG statt .first() (Betreiber-Freigabe 2026-08-21, ZCode-Regel).
        // Vorher nahm diese Zeile bei mehreren Treffern kommentarlos den
        // ersten: auf einer Seite mit zwei "Anmelden"-Knoepfen wurde
        // stillschweigend der falsche geklickt. Lesen (selectorText) darf
        // weiterhin mehrdeutig sein — es veraendert nichts.
        const locator = await resolveEindeutig(page, def, { erlaubeMehrere: action.type === "selectorText" })
          .then((l) => (action.type === "selectorText" ? l.first() : l));
        await locator.waitFor({ state: "visible", timeout: cfg.settleTimeoutMs }).catch(() => {});
        if (action.type === "selectorText") {
          const text = await locator.innerText({ timeout: cfg.settleTimeoutMs }).catch(() => "");
          return { gelesen: String(text || "").slice(0, 2000) };
        }
        if (action.type === "selectorType") {
          await locator.fill(action.text, { timeout: cfg.settleTimeoutMs });
          return undefined;
        }
        await locator.click({ timeout: cfg.settleTimeoutMs });
        await page.waitForLoadState("domcontentloaded", { timeout: cfg.settleTimeoutMs }).catch(() => {});
        await page.waitForTimeout?.(300)?.catch?.(() => {});
        return undefined;
      }
      case "observe": {
        // DERSELBE Beobachter wie in der Maus-Engine, nicht ein zweiter:
        // sonst sieht die Maus im Panel eine andere Seite als in ihrem
        // eigenen Browser und entscheidet dort anders.
        const beobachtung = await buildObservation(page);
        return { beobachtung };
      }
      case "dialogAccept":
      case "dialogDismiss": {
        const offen = session.dialog;
        if (!offen) throw new Error("kein_dialog_offen");
        // ERST vergessen, DANN beantworten: wirft accept()/dismiss(), waere
        // die Sitzung sonst dauerhaft auf einen Dialog festgenagelt, den es
        // nicht mehr gibt — und jede weitere Aktion liefe ins Leere.
        session.dialog = null;
        if (action.type === "dialogAccept") {
          await offen.griff.accept(action.text ?? undefined);
        } else {
          await offen.griff.dismiss();
        }
        await page.waitForTimeout?.(200)?.catch?.(() => {});
        return { dialogBeantwortet: { art: offen.art, wie: action.type === "dialogAccept" ? "bestaetigt" : "abgelehnt" } };
      }
      case "ariaObserve": {
        // Chromiums Bedienbaum. Er sieht die GANZE Seite, nicht nur was in
        // eine Selektorliste passt — der Grund, warum "observe" auf
        // Anmeldeseiten leer ausging (Memory: smejj-fern-browser-blind).
        const ariaBeobachtung = await buildAriaObservation(page);
        return { ariaBeobachtung };
      }
      case "find": {
        // Gesucht wird IM echten Browser — hier liegt das Dokument wirklich
        // vor. Dieselbe Regel wie im Proxy-Skript: erst sammeln, dann
        // veraendern, sonst zieht man dem TreeWalker den Boden weg.
        const treffer = await page.evaluate(({ text, index }) => {
          const alte = document.querySelectorAll("mark[data-smejj-treffer]");
          for (const m of alte) m.replaceWith(document.createTextNode(m.textContent));
          document.body?.normalize();
          if (!text) return 0;
          const suchText = text.toLowerCase();
          const lauf = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
              if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
              const e = n.parentNode && n.parentNode.nodeName;
              if (e === "SCRIPT" || e === "STYLE" || e === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
              return n.nodeValue.toLowerCase().includes(suchText) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          });
          const knoten = [];
          let k;
          while ((k = lauf.nextNode()) && knoten.length < 500) knoten.push(k);
          const marken = [];
          for (let n of knoten) {
            let wert = n.nodeValue;
            let pos = wert.toLowerCase().indexOf(suchText);
            while (pos !== -1 && marken.length < 500) {
              const rest = n.splitText(pos);
              n = rest.splitText(suchText.length);
              const mark = document.createElement("mark");
              mark.setAttribute("data-smejj-treffer", "1");
              mark.style.cssText = "background:#ffe066;color:#111";
              rest.parentNode.replaceChild(mark, rest);
              mark.appendChild(rest);
              marken.push(mark);
              wert = n.nodeValue;
              pos = wert.toLowerCase().indexOf(suchText);
            }
          }
          const ziel = marken[Math.min(index, Math.max(0, marken.length - 1))];
          if (ziel) {
            ziel.style.background = "#ff9f1a";
            ziel.scrollIntoView({ block: "center" });
          }
          return marken.length;
        }, { text: action.text, index: action.index });
        await page.waitForTimeout?.(120)?.catch?.(() => {});
        return { treffer };
      }
      case "navigate": {
        const parsed = isAllowedTarget(action.url);
        if (!parsed.ok) throw new Error(parsed.error);
        await assertPublicHostname(parsed.url.hostname, dnsLookup);
        await page.goto(parsed.url.toString(), { waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs });
        await page.waitForLoadState("networkidle", { timeout: cfg.settleTimeoutMs }).catch(() => {});
        return;
      }
      case "back":
        await page.goBack({ waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs }).catch(() => {});
        return;
      case "forward":
        await page.goForward({ waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs }).catch(() => {});
        return;
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs }).catch(() => {});
        return;
      default:
        throw new Error("action_unknown");
    }
  }

  async function act({ sessionId, action } = {}) {
    const session = sessions.get(String(sessionId || ""));
    if (!session) return fail(404, "session_unknown");
    if (now() - session.createdAt > cfg.hardLimitMs) {
      await destroy(session.id);
      return fail(410, "session_expired");
    }
    const verdict = validateSessionAction(action, cfg);
    if (!verdict.ok) return fail(400, verdict.error);
    // Solange ein JS-Dialog offen ist, blockiert Chromium jede Arbeit an der
    // Seite. Ein Klick liefe dann bis ins Zeitlimit und kaeme als "Netz weg"
    // zurueck — der wahre Grund ("da steht eine Frage") stuende nirgends.
    // Also fail-fast mit dem Dialog IM Fehler, damit der Aufrufer weiss,
    // was zu tun ist. Hinsehen bleibt erlaubt.
    const DIALOG_ERLAUBT = new Set(["dialogAccept", "dialogDismiss", "observe", "ariaObserve"]);
    if (session.dialog && !DIALOG_ERLAUBT.has(verdict.action.type)) {
      return { ...fail(409, "dialog_offen"), dialog: dialogNachAussen(session) };
    }
    if (session.busy) return fail(409, "session_busy");
    session.busy = true;
    try {
      const zusatz = await performAction(session, verdict.action);
      touch(session);
      const bild = await snapshot(session);
      // Zusaetzliche Auskuenfte einer Aktion (z. B. die Trefferzahl der Suche)
      // reisen mit dem Schnappschuss zurueck.
      return zusatz && typeof zusatz === "object" ? { ...bild, ...zusatz } : bild;
    } catch (error) {
      return fail(502, error?.message || error);
    } finally {
      session.busy = false;
    }
  }

  async function close({ sessionId } = {}) {
    const closed = await destroy(String(sessionId || ""));
    return { ok: true, closed };
  }

  async function closeAll() {
    const ids = [...sessions.keys()];
    for (const id of ids) await destroy(id);
    return { ok: true, closed: ids.length };
  }

  return { open, act, close, closeAll, count: () => sessions.size };
}
