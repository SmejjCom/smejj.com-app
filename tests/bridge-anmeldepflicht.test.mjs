// smejj.com — Anmeldepflicht der Chat-Bruecke.
//
// Freigabe des Betreibers vom 2026-08-04: "Token-Pflicht an der Chat-Bridge
// umsetzen." Anlass war ein GEMESSENER Befund: ein `curl` mit dem Kopf
// `Origin: https://smejj.com` bekam die volle Antwort. Der Origin-Kopf wirkt
// ausschliesslich im Browser — ausserhalb setzt ihn jeder selbst. Wer die
// Bruecken-Adresse kannte, konnte den Chat mitbenutzen und das geteilte
// Groq-Kontingent aufbrauchen, bis die echten Nutzer 429 sahen.
//
// Geprueft wird das VERHALTEN gegen einen Stub-Control-Server, nicht der
// Quelltext: eine Wache, die man nur liest, hat man nicht geprueft.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allowAuthenticated, bearerToken, tokenGueltig } from "../public/chat-bridge-auth.js";

const GUELTIG = "gueltiges.token";
const UNGUELTIG = "falsches.token";

/** Stub des Control Servers: zaehlt Aufrufe, damit der Zwischenspeicher belegbar ist. */
function stubControl({ erreichbar = true } = {}) {
  const aufrufe = [];
  const fetchFn = async (url, options) => {
    aufrufe.push({ url: String(url), auth: options?.headers?.Authorization || "" });
    if (!erreichbar) throw new Error("network");
    const ok = options?.headers?.Authorization === `Bearer ${GUELTIG}`;
    return { ok: true, json: async () => ({ authenticated: ok, user: ok ? { email: "x@y.z" } : null }) };
  };
  return { fetchFn, aufrufe };
}

test("Bearer-Token wird aus dem Kopf gelesen, in jeder Schreibweise", () => {
  assert.equal(bearerToken({ authorization: "Bearer abc" }), "abc");
  assert.equal(bearerToken({ Authorization: "bearer  abc  " }), "abc");
  assert.equal(bearerToken({}), "");
  assert.equal(bearerToken({ authorization: "Basic abc" }), "");
});

test("ein gueltiges Token wird angenommen, ein falsches nicht", async () => {
  const control = stubControl();
  const basis = { fetchFn: control.fetchFn, controlOrigin: "https://control.test" };
  assert.equal(await tokenGueltig(GUELTIG, { ...basis, jetzt: 1_000 }), true);
  assert.equal(await tokenGueltig(UNGUELTIG, { ...basis, jetzt: 1_000 }), false);
});

test("ohne Token wird gar nicht erst gefragt", async () => {
  const control = stubControl();
  assert.equal(await tokenGueltig("", { fetchFn: control.fetchFn, controlOrigin: "https://control.test" }), false);
  assert.equal(control.aufrufe.length, 0, "ein leeres Token darf keinen Rundlauf ausloesen");
});

test("das Ergebnis wird gemerkt — ein Rundlauf je Fenster, nicht je Anfrage", async () => {
  const control = stubControl();
  const basis = { fetchFn: control.fetchFn, controlOrigin: "https://control.test" };
  for (let i = 0; i < 5; i += 1) await tokenGueltig(`wiederholt.${GUELTIG}`, { ...basis, jetzt: 2_000 + i });
  assert.equal(control.aufrufe.length, 1, `erwartet 1 Rundlauf, gemessen ${control.aufrufe.length}`);
});

test("FAIL-CLOSED: ist der Control Server nicht erreichbar, wird abgewiesen", async () => {
  // Bewusste Entscheidung: ein Schutz, den ein Ausfall aushebelt, ist keiner.
  // Der Zwischenspeicher traegt aktive Nutzer durch kurze Aussetzer.
  const control = stubControl({ erreichbar: false });
  assert.equal(
    await tokenGueltig("neu.unbekannt", { fetchFn: control.fetchFn, controlOrigin: "https://control.test", jetzt: 3_000 }),
    false
  );
});

test("ohne Control-Adresse wird abgewiesen statt durchgewunken", async () => {
  const control = stubControl();
  assert.equal(await tokenGueltig(GUELTIG, { fetchFn: control.fetchFn, controlOrigin: "" }), false);
});

test("die Wache antwortet selbst mit 401 und einem brauchbaren Hinweis", async () => {
  const control = stubControl();
  const antworten = [];
  const json = (res, status, koerper) => antworten.push({ status, koerper });

  const erlaubt = await allowAuthenticated(
    { headers: { authorization: `Bearer ${GUELTIG}` } },
    {},
    { json, controlOrigin: "https://control.test", fetchFn: control.fetchFn }
  );
  // Ohne durchgereichtes fetchFn nutzt die Wache das echte fetch — im Test
  // zaehlt deshalb nur der abweisende Pfad, der ohne Netz auskommt.
  const abgewiesen = await allowAuthenticated({ headers: {} }, {}, { json, controlOrigin: "https://control.test" });
  assert.equal(abgewiesen, false);
  assert.equal(antworten.at(-1).status, 401);
  assert.equal(antworten.at(-1).koerper.error, "authentication_required");
  assert.match(antworten.at(-1).koerper.hinweis, /anmelden/i, "der Hinweis muss sagen, was zu tun ist");
  assert.equal(typeof erlaubt, "boolean");
});

test("die Wache steht VOR den modellkostenden Routen — und nur dort", () => {
  const quelle = fs.readFileSync("public/chat-bridge.js", "utf8");
  const wache = quelle.indexOf("allowAuthenticated(req, res");
  for (const route of ["handleChat(req, res)", "handleAgent(req, res)", "handleVoiceTts(req, res)", "handleVoiceTranscribe(req, res)"]) {
    assert.ok(wache < quelle.indexOf(route), `die Wache muss vor ${route} stehen`);
  }
  // /health bleibt offen: ohne sie ist von aussen nicht mehr feststellbar, ob
  // der Dienst lebt — und sie kostet kein Modell.
  assert.ok(quelle.indexOf('url.pathname === "/health"') < wache, "/health bleibt ohne Anmeldung erreichbar");
  assert.match(quelle, /kostetModell && !\(await allowAuthenticated/);
});

test("das Frontend schickt den Token ueberall mit, wo es die Bruecke ruft", () => {
  const strom = fs.readFileSync("public/ai/chat-stream.js", "utf8");
  const sprache = fs.readFileSync("public/voice-landing.js", "utf8");
  assert.match(strom, /export function bridgeAuthHeaders/);
  assert.match(strom, /\.\.\.bridgeAuthHeaders\(\)/, "der getippte Chat muss den Kopf setzen");
  assert.match(sprache, /\.\.\.bridgeAuthHeaders\(\)/, "der Sprach-Modus muss den Kopf setzen");
  // Ohne Anmeldung bleibt der Kopf leer — sonst ginge ein "Bearer " ohne Wert raus.
  assert.match(strom, /token \? \{ Authorization: `Bearer \$\{token\}` \} : \{\}/);
});
