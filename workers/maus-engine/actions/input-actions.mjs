// smejj.com Maus-Engine — Eingabe-Aktionen.
// Single Responsibility: type, hotkey, fillForm. Sensible Werte kommen
// ausschliesslich als secretRef aus dem Vault (fail-closed) und tauchen
// nie in Logs oder Artefakten auf (Maskierung im Interpreter).

function valueFor(ctx, field) {
  if (field.secretRef !== undefined) return ctx.vault.resolve(field.secretRef);
  return field.value ?? field.text ?? "";
}

async function fillField(ctx, step, field, attempt) {
  const page = ctx.activePage();
  const locator = ctx.locate(page, field.target, attempt);
  const timeout = ctx.timeoutFor(step);
  const kind = field.kind || "text";
  if (kind === "checkbox" || kind === "radio") {
    if (field.checked === false) await locator.uncheck({ timeout });
    else await locator.check({ timeout });
    return;
  }
  if (kind === "select") {
    await locator.selectOption(valueFor(ctx, field), { timeout });
    return;
  }
  await locator.fill(valueFor(ctx, field), { timeout });
}

export const inputActions = {
  async type(ctx, step, { attempt }) {
    const page = ctx.activePage();
    const locator = ctx.locate(page, step.target, attempt);
    const timeout = ctx.timeoutFor(step);
    const text = step.secretRef !== undefined ? ctx.vault.resolve(step.secretRef) : step.text;
    if (step.clearFirst !== false) await locator.fill(text, { timeout });
    else await locator.type(text, { timeout });
    if (step.pressEnter === true) await locator.press("Enter", { timeout });
    return { secret: step.secretRef !== undefined };
  },

  async hotkey(ctx, step) {
    const page = ctx.activePage();
    await page.keyboard.press(step.keys.join("+"));
    return { keys: step.keys.join("+") };
  },

  async fillForm(ctx, step, { attempt }) {
    for (const field of step.fields) {
      await fillField(ctx, step, field, attempt);
    }
    if (step.submit) {
      const page = ctx.activePage();
      const locator = ctx.locate(page, step.submit, attempt);
      await locator.click({ timeout: ctx.timeoutFor(step) });
      await ctx.enforcePageAllowed(page);
    }
    return { fields: step.fields.length, submitted: Boolean(step.submit) };
  }
};
