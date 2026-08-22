// smejj.com Maus-Engine — Kontroll-Aktionen.
// Single Responsibility: waitFor, assert, httpRequest (Stufe 1), runMacro.
// runMacro ist Phase 2 und bleibt bis zu deren Freigabe fail-closed
// gesperrt. assert-Fehler sind normale Schritt-Fehler (onFailure greift).

function matchesPattern(value, pattern) {
  return new RegExp(pattern).test(String(value ?? ""));
}

export const controlActions = {
  async waitFor(ctx, step, { attempt }) {
    const timeout = ctx.timeoutFor(step);
    if (step.condition === "delay") {
      await ctx.sleep(step.ms);
      return { waited: step.ms };
    }
    const page = ctx.activePage();
    if (step.condition === "selectorVisible" || step.condition === "selectorHidden") {
      const locator = ctx.locate(page, step.target, attempt);
      await locator.waitFor({
        state: step.condition === "selectorVisible" ? "visible" : "hidden",
        timeout
      });
      return { condition: step.condition };
    }
    if (step.condition === "urlMatches") {
      await page.waitForURL(new RegExp(step.urlPattern), { timeout });
      return { condition: step.condition };
    }
    if (step.condition === "networkIdle") {
      await page.waitForLoadState("networkidle", { timeout });
      return { condition: step.condition };
    }
    throw new Error(`waitFor_unbekannt: ${step.condition}`);
  },

  async assert(ctx, step, { attempt }) {
    if (step.condition === "downloadExists") {
      const found = ctx.state.downloads.some((d) => d.suggestedFilename === step.fileName);
      if (!found) throw new Error(`assert_fehlgeschlagen: download ${step.fileName} fehlt`);
      return { condition: step.condition };
    }
    const page = ctx.activePage();
    if (step.condition === "urlMatches") {
      const url = typeof page.url === "function" ? page.url() : "";
      if (!matchesPattern(url, step.urlPattern)) throw new Error(`assert_fehlgeschlagen: url ${url}`);
      return { condition: step.condition };
    }
    if (step.condition === "titleContains") {
      const title = await page.title();
      if (!String(title).includes(step.text ?? "")) throw new Error(`assert_fehlgeschlagen: title ${title}`);
      return { condition: step.condition };
    }
    const locator = ctx.locate(page, step.target, attempt);
    if (step.condition === "selectorExists") {
      const count = await locator.count();
      if (count < 1) throw new Error("assert_fehlgeschlagen: selector fehlt");
      return { condition: step.condition, count };
    }
    const text = await locator.textContent({ timeout: ctx.timeoutFor(step) });
    if (step.condition === "selectorTextEquals" && String(text ?? "").trim() !== step.text) {
      throw new Error(`assert_fehlgeschlagen: text ${String(text).slice(0, 100)}`);
    }
    if (step.condition === "selectorTextContains" && !String(text ?? "").includes(step.text)) {
      throw new Error(`assert_fehlgeschlagen: text ${String(text).slice(0, 100)}`);
    }
    return { condition: step.condition };
  },

  async httpRequest(ctx, step) {
    ctx.ensureUrlAllowed(step.url);
    const response = await ctx.fetchImpl(step.url, {
      method: step.method,
      headers: step.headers,
      body: ["GET", "HEAD"].includes(step.method) ? undefined : step.body,
      redirect: "manual"
    });
    if (step.expectStatus !== undefined && response.status !== step.expectStatus) {
      throw new Error(`http_status_${response.status}_erwartet_${step.expectStatus}`);
    }
    let bytes = 0;
    if (step.saveAs) {
      const buffer = Buffer.from(await response.arrayBuffer());
      bytes = buffer.length;
      ctx.addArtifact(`http/${step.saveAs}`, buffer, response.headers?.get?.("content-type") || "application/octet-stream");
    }
    return { status: response.status, bytes };
  },

  // Phase 2: gespeicherte Makros ohne Planer-Modell wiederverwenden.
  // Schritte werden gegen die Policy des AKTIVEN Tasks validiert
  // (Allowlist, Budget, Dateiregeln); Verschachtelung ist verboten.
  async runMacro(ctx, step) {
    if (!ctx.macroStore) throw new Error("macro_store_nicht_konfiguriert");
    const macro = await ctx.macroStore.load(step.macroRef);
    if (!macro) throw new Error(`macro_nicht_gefunden: ${step.macroRef}`);
    const { substituteMacroParams } = await import("../macro-store.mjs");
    const steps = substituteMacroParams(macro.steps, step.params || {});
    return ctx.runMacroSteps(steps, step.macroRef);
  },

  // JS-Dialoge der Seite beantworten (2026-08-21). Bis hierher verwarf
  // Playwright jede Frage stillschweigend — die Maus antwortete auf
  // "Wirklich loeschen?" IMMER mit Abbrechen und erfuhr nie davon.
  //
  // Zwei Aktionen statt einer mit Schalter: eine Bestaetigung ist nicht
  // umkehrbar und verdient im Protokoll ein eigenes Wort.
  async dialogAccept(ctx, step) {
    return beantworteOffenenDialog(ctx, { bestaetigen: true, text: step.text });
  },

  async dialogDismiss(ctx) {
    return beantworteOffenenDialog(ctx, { bestaetigen: false });
  }
};

// Gemeinsamer Kern beider Dialog-Aktionen. Die Wache haengt am TAB, nicht am
// Browser: zwei Tabs koennen gleichzeitig fragen.
async function beantworteOffenenDialog(ctx, { bestaetigen, text }) {
  const { wacheFuerAktivenTab, beantworteDialog } = await import("../dialog-wache.mjs");
  const wache = wacheFuerAktivenTab(ctx.state);
  if (!wache?.offen) throw new Error("kein_dialog_offen");
  return beantworteDialog(wache, { bestaetigen, text });
}
