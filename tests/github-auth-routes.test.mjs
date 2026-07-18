// smejj.com — Unit-Tests fuer den GitHub-Login-Flow (OAuth Authorization-Code).
// Deckt fail-closed, Start-Redirect, Open-Redirect-Schutz, kompletten Callback
// mit gemocktem fetch, Handoff-Rueckkehr, unverifizierte E-Mail und State-Manipulation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeGithubCode, fetchGithubUser, githubAuthorizeUrl,
  signGithubAuthState, verifyGithubAuthState
} from "../src/auth/githubAuth.js";
import { createGithubAuthHandlers } from "../src/auth/githubAuthRoutes.js";

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers || {}; };
  res.end = (body) => { res.body = String(body || ""); };
  return res;
}
const json = (res, code, payload) => { res.statusCode = code; res.body = JSON.stringify(payload); };

function githubFetch({ email = "smejjcom@gmail.com", verified = true } = {}) {
  return async (url) => {
    if (url === "https://github.com/login/oauth/access_token") {
      return { ok: true, json: async () => ({ access_token: "gho_test" }) };
    }
    if (url === "https://api.github.com/user") {
      return { ok: true, json: async () => ({ id: 42, login: "wof", name: "Wof", email: null, avatar_url: "https://a/x.png" }) };
    }
    if (url === "https://api.github.com/user/emails") {
      return { ok: true, json: async () => [{ email, primary: true, verified }] };
    }
    throw new Error(`unmocked ${url}`);
  };
}

const baseDeps = {
  json,
  SECURITY_HEADERS: { "x-test": "1" },
  serializeSessionCookie: (u) => `smejj_session=tok-${u.email}`,
  serializeSessionToken: (u) => `token-${u.email}`,
  sessionHandoffStore: { complete: () => ({ ok: true }) },
  allowedOriginsFromEnv: () => ["https://smejj.com"],
  signGithubAuthState,
  verifyGithubAuthState,
  githubAuthorizeUrl,
  exchangeGithubCode,
  fetchGithubUser,
  ROUTES: { api: { authGithub: "/api/auth/github", authGithubCallback: "/api/auth/github/callback" } },
  env: {}
};

test("State-Helfer: Round-Trip gueltig, Manipulation und Ablauf werfen", () => {
  const secret = "geheim";
  const signed = signGithubAuthState({ nonce: "n", exp: Date.now() + 60000 }, secret);
  assert.equal(verifyGithubAuthState(signed, secret).nonce, "n");
  assert.throws(() => verifyGithubAuthState(signed + "x", secret));
  const expired = signGithubAuthState({ exp: Date.now() - 1 }, secret);
  assert.throws(() => verifyGithubAuthState(expired, secret));
});

test("fail-closed: 503 ohne Client-ID/Secret", async () => {
  const h = createGithubAuthHandlers({ ...baseDeps, config: { githubLoginClientId: "", githubLoginClientSecret: "", sessionSecret: "s" } });
  const res = mockRes();
  await h.handleGithubAuthStart({ headers: {} }, res, new URL("https://c.test/api/auth/github"));
  assert.equal(res.statusCode, 503);
});

test("Start: 303 zu github.com mit redirect_uri, scope und state", async () => {
  const h = createGithubAuthHandlers({ ...baseDeps, config: { githubLoginClientId: "cid", githubLoginClientSecret: "sec", sessionSecret: "s" } });
  const res = mockRes();
  await h.handleGithubAuthStart({ headers: { host: "control.example", "x-forwarded-proto": "https" } }, res, new URL("https://control.example/api/auth/github"));
  assert.equal(res.statusCode, 303);
  const ziel = new URL(res.headers.Location);
  assert.equal(ziel.hostname, "github.com");
  assert.equal(ziel.searchParams.get("client_id"), "cid");
  assert.equal(ziel.searchParams.get("redirect_uri"), "https://control.example/api/auth/github/callback");
  assert.match(ziel.searchParams.get("scope"), /user:email/);
  assert.ok(ziel.searchParams.get("state").length > 10);
});

test("Open-Redirect-Schutz", () => {
  const h = createGithubAuthHandlers({ ...baseDeps, config: { githubLoginClientId: "c", githubLoginClientSecret: "s", sessionSecret: "s" } });
  assert.equal(h.safeReturnOrigin("https://boese.example"), null);
  assert.equal(h.safeReturnOrigin("https://smejj.com/"), "https://smejj.com");
});

test("Callback: kompletter Flow -> Cookie + 303 zu /profile", async () => {
  const config = { githubLoginClientId: "cid", githubLoginClientSecret: "sec", githubLoginAllowedEmail: "", sessionSecret: "s" };
  const h = createGithubAuthHandlers({ ...baseDeps, config, fetchImpl: githubFetch() });
  const state = signGithubAuthState({ nonce: "n", returnTo: "/profile?github=ok", exp: Date.now() + 60000 }, "s");
  const res = mockRes();
  await h.handleGithubCallback(
    { headers: { host: "control.example", "x-forwarded-proto": "https" } },
    res,
    new URL(`https://control.example/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`)
  );
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "/profile?github=ok");
  assert.match(res.headers["Set-Cookie"], /smejj_session=tok-smejjcom@gmail\.com/);
});

test("Callback: Handoff-Rueckkehr zur App mit hinterlegtem Token", async () => {
  let deposited = null;
  const config = { githubLoginClientId: "cid", githubLoginClientSecret: "sec", sessionSecret: "s" };
  const h = createGithubAuthHandlers({
    ...baseDeps, config, fetchImpl: githubFetch(),
    sessionHandoffStore: { complete: (id, data) => { deposited = { id, data }; return { ok: true }; } }
  });
  const state = signGithubAuthState({ handoff: "H1", handoffReturn: "https://smejj.com", exp: Date.now() + 60000 }, "s");
  const res = mockRes();
  await h.handleGithubCallback(
    { headers: { host: "control.example", "x-forwarded-proto": "https" } },
    res,
    new URL(`https://control.example/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`)
  );
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.Location, "https://smejj.com/auth/login?handoff=H1");
  assert.equal(deposited.id, "H1");
  assert.equal(deposited.data.user.method, "github");
});

test("Callback: unverifizierte GitHub-E-Mail wird abgelehnt", async () => {
  const config = { githubLoginClientId: "cid", githubLoginClientSecret: "sec", sessionSecret: "s" };
  const h = createGithubAuthHandlers({ ...baseDeps, config, fetchImpl: githubFetch({ verified: false }) });
  const state = signGithubAuthState({ exp: Date.now() + 60000 }, "s");
  const res = mockRes();
  await assert.rejects(() => h.handleGithubCallback(
    { headers: { host: "c.example" } },
    res,
    new URL(`https://c.example/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`)
  ), /nicht verifiziert/);
});

test("Callback: manipulierter State wird abgelehnt", async () => {
  const config = { githubLoginClientId: "cid", githubLoginClientSecret: "sec", sessionSecret: "s" };
  const h = createGithubAuthHandlers({ ...baseDeps, config, fetchImpl: githubFetch() });
  const res = mockRes();
  await assert.rejects(() => h.handleGithubCallback(
    { headers: { host: "c.example" } },
    res,
    new URL("https://c.example/api/auth/github/callback?code=abc&state=gefaelscht.xxx")
  ), /ungueltig/);
});
