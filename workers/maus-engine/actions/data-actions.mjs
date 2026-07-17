// smejj.com Maus-Engine — Beweis- und Extraktions-Aktionen.
// Single Responsibility: screenshot, savePdf, extract, extractTable.
// Ergebnisse landen als Artefakte (komprimiert -> IDrive e2) bzw. im
// Extraktions-Ergebnis der Task Capsule. Deterministisch, kein Modell.

export const dataActions = {
  async screenshot(ctx, step) {
    const page = ctx.activePage();
    const buffer = await page.screenshot({
      fullPage: step.fullPage === true,
      timeout: ctx.timeoutFor(step)
    });
    ctx.addArtifact(`screenshots/${step.name}.png`, buffer, "image/png");
    return { name: step.name, bytes: buffer.length };
  },

  async savePdf(ctx, step) {
    const page = ctx.activePage();
    if (typeof page.pdf !== "function") throw new Error("pdf_nur_chromium");
    const buffer = await page.pdf();
    ctx.addArtifact(`pdf/${step.name}.pdf`, buffer, "application/pdf");
    return { name: step.name, bytes: buffer.length };
  },

  async extract(ctx, step, { attempt }) {
    const page = ctx.activePage();
    const locator = ctx.locate(page, step.target, attempt);
    let value;
    if (step.multiple === true) {
      value = step.attribute
        ? await locator.evaluateAll((nodes, attr) => nodes.map((n) => n.getAttribute(attr)), step.attribute)
        : await locator.allTextContents();
    } else {
      value = step.attribute
        ? await locator.getAttribute(step.attribute, { timeout: ctx.timeoutFor(step) })
        : await locator.textContent({ timeout: ctx.timeoutFor(step) });
    }
    ctx.state.extracted[step.name] = value;
    return { name: step.name };
  },

  async extractTable(ctx, step, { attempt }) {
    const page = ctx.activePage();
    const locator = ctx.locate(page, step.target, attempt);
    const rows = await locator.evaluate((table) =>
      Array.from(table.querySelectorAll("tr")).map((row) =>
        Array.from(row.querySelectorAll("th,td")).map((cell) => (cell.textContent || "").trim())
      )
    );
    ctx.state.extracted[step.name] = rows;
    return { name: step.name, rows: rows.length };
  }
};
