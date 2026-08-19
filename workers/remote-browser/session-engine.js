// smejj.com Remote-Browser Session-Engine.
// Interaktive Browser-Sessions fuer den Live-Browser: eine Playwright-Seite
// bleibt pro Session offen, Aktionen (Klick, Tippen, Scrollen, Navigation)
// werden deterministisch ausgefuehrt und liefern jeweils einen frischen
// Viewport-Screenshot zurueck. Fail-closed: unbekannte Aktionen, unbekannte
// Sessions und blockierte Ziele werden abgelehnt. Sessions enden automatisch
// (Idle-Timeout + Hard-Limit) — keine laufenden Fixkosten.
// Sicherheits-Helfer (SSRF-Schutz) kommen per Dependency Injection aus
// worker.js, damit exakt dieselben Pruefungen gelten wie beim Einmal-Rendern.
import { resolveLocator } from "../maus-engine/selector.mjs";
import { buildObservation } from "../maus-engine/observer.mjs";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";

export const SESSION_DEFAULTS = {
  maxSessions: 2,
  idleTimeoutMs: 90_000,
  hardLimitMs: 600_000,
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
      if (!SESSION_ALLOWED_KEYS.has(key)) return { ok: false, error: "key_not_allowed" };
      return { ok: true, action: { type: "key", key } };
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

  async function snapshot(session) {
    const page = session.page;
    const screenshot = await page.screenshot({ type: "jpeg", quality: cfg.jpegQuality });
    const title = await page.title().catch(() => "");
    return {
      ok: true,
      sessionId: session.id,
      screenshot: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
      finalUrl: page.url(),
      title,
      viewport: session.viewport,
      expiresInMs: expiresInMs(session)
    };
  }

  async function open({ url, viewport = {} } = {}) {
    if (sessions.size >= cfg.maxSessions) return fail(429, "session_limit_reached");
    const parsed = isAllowedTarget(url);
    if (!parsed.ok) return fail(400, parsed.error);
    try {
      await assertPublicHostname(parsed.url.hostname, dnsLookup);
    } catch {
      return fail(400, "Ziel-Host ist blockiert.");
    }
    const playwright = await playwrightLoader();
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"]
    });
    try {
      const pageOptions = buildPageOptions(viewport);
      const page = await browser.newPage(pageOptions);
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
      const session = {
        id: randomId(),
        browser,
        page,
        viewport: pageOptions.viewport,
        createdAt: now(),
        idleTimer: null,
        busy: false
      };
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
        const locator = resolveLocator(page, def).first();
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
