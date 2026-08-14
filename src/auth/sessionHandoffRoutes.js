// Sitzungs-Uebergabe zwischen zwei Origins (Handoff) — aus src/server.js
// ausgelagert am 2026-08-14 wegen der 800-Zeilen-Regel, genau wie zuvor die
// Google-Anmeldung (src/auth/googleAuthRoutes.js) und die Werkstatt-Routen
// (src/routes/werkstattRoutes.js). Ausloeser: die neue Video-Spur schob
// server.js auf 806 Zeilen und blockierte damit das Nachtbau-Tor.
//
// Verhalten unveraendert, Zeile fuer Zeile uebernommen. Alle Abhaengigkeiten
// werden hereingereicht statt importiert — dadurch sind die drei Handler
// erstmals ohne Serverstart testbar, und der Server bleibt die einzige
// Stelle, die Umgebung und Sicherheits-Kopfzeilen kennt.
export function createSessionHandoffRoutes({
  sessionHandoffStore,
  isSessionHandoffId,
  allowedOriginsFromEnv,
  serializeAccessToken,
  requestOrigin,
  readJson,
  noStoreJson,
  securityHeaders,
  routes,
  env
}) {
  async function start(req, res) {
    const origin = requestOrigin(req);
    const body = await readJson(req);
    const returnOrigin = String(body.returnOrigin || "").replace(/\/$/, "");
    if (!allowedOriginsFromEnv(env).includes(origin) || returnOrigin !== origin) {
      return noStoreJson(res, 403, { ok: false, error: "session_handoff_origin_not_allowed" });
    }
    const result = sessionHandoffStore.start(returnOrigin);
    return noStoreJson(res, result.status, result);
  }

  async function complete(req, url, res) {
    const handoffId = req.method === "GET"
      ? url.searchParams.get("handoffId")
      : (await readJson(req)).handoffId;
    const result = sessionHandoffStore.complete(handoffId, {
      token: serializeAccessToken(req.authUser),
      user: req.authUser
    });
    if (req.method === "GET" && result.ok) {
      res.writeHead(303, {
        ...securityHeaders,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        Location: "/profile?session-handoff-complete=1"
      });
      return res.end();
    }
    return noStoreJson(res, result.status, result.ok
      ? { ok: true, state: "completed", expiresAt: result.expiresAt }
      : result);
  }

  function poll(req, url, res) {
    const handoffId = decodeURIComponent(url.pathname.slice(`${routes.api.authSessionHandoff}/`.length));
    if (!isSessionHandoffId(handoffId)) return noStoreJson(res, 404, { ok: false, error: "session_handoff_not_found" });
    const result = sessionHandoffStore.consume(handoffId, requestOrigin(req));
    return noStoreJson(res, result.status, result);
  }

  return { start, complete, poll };
}
