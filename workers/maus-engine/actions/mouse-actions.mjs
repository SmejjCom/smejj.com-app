// smejj.com Maus-Engine — Maus-Aktionen.
// Single Responsibility: click, doubleClick, rightClick, hover,
// dragAndDrop, scroll. Koordinaten-Varianten sind Stufe 3 (Vision) und
// nur bei policy.visionAllowed=true gueltig (bereits im Plan-Validator
// erzwungen; hier zusaetzlich fail-closed geprueft).

function assertCoordinatesAllowed(ctx) {
  if (ctx.policy.visionAllowed !== true) {
    throw new Error("koordinaten_ohne_vision_freigabe");
  }
}

async function clickLike(ctx, step, attempt, options) {
  const page = ctx.activePage();
  if (step.target.coordinates) {
    assertCoordinatesAllowed(ctx);
    const { x, y } = step.target.coordinates;
    await page.mouse.click(x, y, options);
    return { via: "coordinates" };
  }
  const locator = ctx.locate(page, step.target.selector, attempt);
  await locator.click({ ...options, timeout: ctx.timeoutFor(step) });
  return { via: "selector" };
}

export const mouseActions = {
  async click(ctx, step, { attempt }) {
    return clickLike(ctx, step, attempt, {});
  },

  async doubleClick(ctx, step, { attempt }) {
    return clickLike(ctx, step, attempt, { clickCount: 2 });
  },

  async rightClick(ctx, step, { attempt }) {
    return clickLike(ctx, step, attempt, { button: "right" });
  },

  async hover(ctx, step, { attempt }) {
    const page = ctx.activePage();
    if (step.target.coordinates) {
      assertCoordinatesAllowed(ctx);
      const { x, y } = step.target.coordinates;
      await page.mouse.move(x, y);
      return { via: "coordinates" };
    }
    const locator = ctx.locate(page, step.target.selector, attempt);
    await locator.hover({ timeout: ctx.timeoutFor(step) });
    return { via: "selector" };
  },

  async dragAndDrop(ctx, step, { attempt }) {
    const page = ctx.activePage();
    const source = ctx.locate(page, step.source, attempt);
    const target = ctx.locate(page, step.target, attempt);
    await source.dragTo(target, { timeout: ctx.timeoutFor(step) });
    return {};
  },

  async scroll(ctx, step, { attempt }) {
    const page = ctx.activePage();
    if (step.target) {
      const locator = ctx.locate(page, step.target, attempt);
      await locator.scrollIntoViewIfNeeded({ timeout: ctx.timeoutFor(step) });
      return { via: "selector" };
    }
    if (step.to === "top") {
      await page.evaluate(() => window.scrollTo(0, 0));
      return { via: "top" };
    }
    if (step.to === "end") {
      await page.evaluate(() => window.scrollTo(0, document.body?.scrollHeight || 0));
      return { via: "end" };
    }
    const deltas = {
      down: { x: 0, y: step.amountPx },
      up: { x: 0, y: -step.amountPx },
      right: { x: step.amountPx, y: 0 },
      left: { x: -step.amountPx, y: 0 }
    };
    const delta = deltas[step.direction];
    await page.mouse.wheel(delta.x, delta.y);
    return { via: "wheel" };
  }
};
