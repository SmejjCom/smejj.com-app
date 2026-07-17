// smejj.com Maus-Engine — Sitzungs-Aktionen.
// Single Responsibility: cookies (get/set/clear), saveSession,
// restoreSession. Sessions werden ausschliesslich als Capsule-Objekte auf
// IDrive e2 abgelegt (session-store), nie persistent auf dem Worker.

export const sessionActions = {
  async cookies(ctx, step) {
    const context = ctx.state.context;
    if (!context) throw new Error("browser_nicht_offen");
    if (step.op === "get") {
      const cookies = await context.cookies();
      ctx.state.extracted[`cookies:${step.id}`] = cookies.map((c) => ({
        name: c.name, domain: c.domain, path: c.path
      }));
      return { count: cookies.length };
    }
    if (step.op === "set") {
      await context.addCookies(step.cookies.map((c) => ({
        name: c.name, value: c.value, domain: c.domain,
        path: c.path || "/", secure: c.secure !== false, httpOnly: c.httpOnly === true
      })));
      return { count: step.cookies.length };
    }
    await context.clearCookies();
    return { cleared: true };
  },

  async saveSession(ctx, step) {
    const context = ctx.state.context;
    if (!context) throw new Error("browser_nicht_offen");
    const state = await context.storageState();
    await ctx.sessionStore.save(step.name, state);
    return { name: step.name, cookies: state.cookies?.length ?? 0 };
  },

  async restoreSession(ctx, step) {
    const context = ctx.state.context;
    if (!context) throw new Error("browser_nicht_offen");
    const state = await ctx.sessionStore.load(step.name);
    if (!state) throw new Error(`session_nicht_gefunden: ${step.name}`);
    if (Array.isArray(state.cookies) && state.cookies.length > 0) {
      await context.addCookies(state.cookies);
    }
    return { name: step.name, cookies: state.cookies?.length ?? 0 };
  }
};
