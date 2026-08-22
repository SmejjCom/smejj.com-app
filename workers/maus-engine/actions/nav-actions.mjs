// smejj.com Maus-Engine — Browser-/Navigations-/Tab-Aktionen.
// Single Responsibility: openBrowser, closeBrowser, navigate, openLink,
// newTab, switchTab, closeTab. Jede Navigation laeuft durch die
// Allowlist-Pruefung (fail-closed); Cookie-Banner werden heuristisch
// geschlossen (kein Modell).
import { closeCookieBanner } from "../cookie-banner.mjs";
// Jede neue Seite bekommt eine Dialog-Wache. Ohne sie verwirft Playwright
// alert/confirm/prompt stillschweigend, und die Maus antwortet auf jede Frage
// "Abbrechen" — ohne es zu merken. Die Wache ist dieselbe wie im
// Fern-Browser, damit beide gleich reagieren.
import { bewacheSeite } from "../dialog-wache.mjs";

export const navActions = {
  async openBrowser(ctx, step) {
    // Sitzungs-Modus (2026-07-31): Laeuft die Sitzung schon, wird der offene
    // Browser samt aktueller Seite WEITERBENUTZT statt neu gestartet. Ohne
    // Sitzung bleibt es beim bisherigen fail-closed Fehler — ein zweites
    // openBrowser waere dort ein Planungsfehler.
    if (ctx.state.browser) {
      if (!ctx.keepAlive) throw new Error("browser_bereits_offen");
      const tabId = ctx.state.activeTabId || "main";
      if (!ctx.state.pages.has(tabId)) {
        const page = await ctx.state.context.newPage();
        bewacheSeite(ctx.state, tabId, page);
        ctx.state.pages.set(tabId, page);
      }
      ctx.state.activeTabId = tabId;
      return { tabId, wiederverwendet: true };
    }
    const { browser, context } = await ctx.browserFactory({ viewport: step.viewport });
    ctx.state.browser = browser;
    ctx.state.context = context;
    if (typeof context.on === "function") {
      context.on("download", (download) => {
        ctx.state.downloads.push({ suggestedFilename: download.suggestedFilename?.() || "download", download });
      });
    }
    const page = await context.newPage();
    bewacheSeite(ctx.state, "main", page);
    ctx.state.pages.set("main", page);
    ctx.state.activeTabId = "main";
    return { tabId: "main" };
  },

  async closeBrowser(ctx) {
    if (ctx.state.browser) await ctx.state.browser.close();
    ctx.state.browser = null;
    ctx.state.context = null;
    ctx.state.pages.clear();
    ctx.state.activeTabId = null;
    return {};
  },

  async navigate(ctx, step) {
    ctx.ensureUrlAllowed(step.url);
    const page = ctx.activePage();
    const response = await page.goto(step.url, {
      waitUntil: step.waitUntil || "domcontentloaded",
      timeout: ctx.timeoutFor(step)
    });
    await ctx.enforcePageAllowed(page);
    const banner = await closeCookieBanner(page).catch(() => ({ closed: false }));
    return { status: response?.status?.() ?? null, bannerClosed: banner.closed };
  },

  async openLink(ctx, step, { attempt }) {
    const page = ctx.activePage();
    const locator = ctx.locate(page, step.target, attempt);
    if (step.newTab === true) {
      const [newPage] = await Promise.all([
        ctx.state.context.waitForEvent("page", { timeout: ctx.timeoutFor(step) }),
        locator.click({ timeout: ctx.timeoutFor(step) })
      ]);
      await ctx.enforcePageAllowed(newPage);
      ctx.state.pages.set(step.tabId, newPage);
      ctx.state.activeTabId = step.tabId;
      return { tabId: step.tabId };
    }
    await locator.click({ timeout: ctx.timeoutFor(step) });
    await ctx.enforcePageAllowed(page);
    return {};
  },

  async newTab(ctx, step) {
    if (ctx.state.pages.has(step.tabId)) throw new Error(`tab_id_belegt: ${step.tabId}`);
    const page = await ctx.state.context.newPage();
    bewacheSeite(ctx.state, step.tabId, page);
    ctx.state.pages.set(step.tabId, page);
    ctx.state.activeTabId = step.tabId;
    if (step.url) {
      ctx.ensureUrlAllowed(step.url);
      await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: ctx.timeoutFor(step) });
      await ctx.enforcePageAllowed(page);
    }
    return { tabId: step.tabId };
  },

  async switchTab(ctx, step) {
    if (!ctx.state.pages.has(step.tabId)) throw new Error(`tab_unbekannt: ${step.tabId}`);
    ctx.state.activeTabId = step.tabId;
    const page = ctx.state.pages.get(step.tabId);
    if (typeof page.bringToFront === "function") await page.bringToFront();
    return { tabId: step.tabId };
  },

  async closeTab(ctx, step) {
    const page = ctx.state.pages.get(step.tabId);
    if (!page) throw new Error(`tab_unbekannt: ${step.tabId}`);
    await page.close();
    ctx.state.pages.delete(step.tabId);
    if (ctx.state.activeTabId === step.tabId) {
      ctx.state.activeTabId = ctx.state.pages.keys().next().value ?? null;
    }
    return {};
  }
};
