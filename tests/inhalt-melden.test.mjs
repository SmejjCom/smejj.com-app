// smejj.com — "Inhalt melden": die Funktion, ohne die Google Play das Update am 20.09.2026
// abgelehnt hat ("Your app lacks in-app features for users to report or flag offensive content").
//
// Geprueft wird das, was die Richtlinie verlangt UND was beim letzten Mal still kaputtgehen
// koennte: der Menuepunkt existiert, das Modul wird nachgeladen, es steht im Precache (sonst
// offline tot — Lehre aus dem Precache-Vorfall), die Marke stimmt (sonst zweite Modulinstanz),
// und der Server nimmt die Meldung nur angemeldet und PII-bereinigt an.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menue = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../public/chat-actions.js", import.meta.url), "utf8");
const modul = readFileSync(new URL("../public/inhalt-melden.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/design-v13-kompakt.css", import.meta.url), "utf8");
const buendel = readFileSync(new URL("../public/start-styles.css", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

// Wie in chat-menue-mehr.test.mjs: das Modul laedt ueber /assets/-Pfade (eine Modulinstanz im
// Browser) und ist in node nicht direkt importierbar — die Importe werden durch Attrappen ersetzt.
const ohneImporte = modul.replace(/^import .*$/gm, "").split("\nif (typeof document")[0];
const attrappen = "const metaOf = () => null; const rawOf = () => ''; const showToast = () => {};"
  + "const toPlainText = (t) => String(t).replace(/\\*\\*([^*]+)\\*\\*/g, '$1');";
const m = await import("data:text/javascript;base64," + Buffer.from(attrappen + ohneImporte).toString("base64"));

test("Menuepunkt 'Inhalt melden' steht bei Antworten, nicht bei eigenen Fragen", async () => {
  const { menuItemsFor } = await import("../public/chat-actions-menu.js");
  const antwort = menuItemsFor("assistant").map((i) => i.act);
  const frage = menuItemsFor("user").map((i) => i.act);
  assert.ok(antwort.includes("report"), "ohne diesen Punkt lehnt Google Play das Update ab");
  assert.ok(!frage.includes("report"), "die eigene Frage hat keine KI erzeugt");
});

test("Verdrahtung: nachgeladen, im Precache, gleiche Marke, Stil im Buendel", () => {
  assert.match(menue, /import\("\/assets\/inhalt-melden\.js"\)\.catch\(\(\) => \{\}\)/);
  assert.ok(sw.includes('"/assets/inhalt-melden.js"'), "fehlt im Precache — offline tot");
  const marke = /chat-actions-menu\.js\?v=(\d+)/.exec(actions)?.[1];
  assert.ok(modul.includes(`/assets/chat-actions-menu.js?v=${marke}`), "gleiche Marke, sonst zweite Modulinstanz");
  assert.ok(css.includes(".melden-kasten"), "Stil fehlt");
  assert.ok(buendel.includes(".melden-kasten"), "Stil nicht im gebuendelten start-styles.css — live unsichtbar");
});

test("Nutzlast: Grund geprueft, Text ohne Markdown, Laengen begrenzt", () => {
  const n = m.meldungsNutzlast({ inhalt: "**Fett** und mehr", frage: "Frage", art: "erfunden", grund: "erfunden", notiz: "x".repeat(900) });
  assert.equal(n.grund, "sonstiges", "unbekannter Grund darf nicht durchgereicht werden");
  assert.equal(n.art, "text", "unbekannte Art darf nicht durchgereicht werden");
  assert.equal(n.inhalt, "Fett und mehr", "Markdown gehoert nicht in die Meldung");
  assert.equal(n.notiz.length, 500, "Notiz begrenzt");
  assert.ok(m.GRUENDE.some((g) => g.wert === "anstoessig"));
  const lang = m.meldungsNutzlast({ inhalt: "a".repeat(5000), grund: "hass" });
  assert.equal(lang.inhalt.length, 2000, "Inhalt begrenzt");
  assert.equal(lang.grund, "hass");
});

test("Server: Route eingehaengt, nur angemeldet, Gruende fest", async () => {
  assert.match(server, /handleInhaltMeldungRoute\(req, url, res\)/, "Route nicht eingehaengt — Melden liefe ins Leere");
  const { GRUENDE } = await import("../control-server/src/routes/inhaltMeldungRoutes.js");
  assert.ok(GRUENDE.includes("anstoessig") && GRUENDE.includes("sonstiges"));
  const quelle = readFileSync(new URL("../control-server/src/routes/inhaltMeldungRoutes.js", import.meta.url), "utf8");
  assert.match(quelle, /authentication_required/, "ohne Anmeldung darf nichts abgelegt werden");
  assert.match(quelle, /scrubPiiData/, "Meldungen muessen PII-bereinigt abgelegt werden");
  assert.ok(!/processUserFeedbackSignal/.test(quelle), "eine Meldung darf NIE ins Training fliessen");
});

test("Server nimmt eine Meldung an und legt sie ab", async () => {
  const { handleInhaltMeldungRoute, __meldungenLeeren } = await import("../control-server/src/routes/inhaltMeldungRoutes.js");
  __meldungenLeeren();
  const env = { SMEJJ_ADMIN_OWNER_EMAILS: "chef@smejj.com" };
  const antwort = () => {
    const r = { code: 0, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.writeHead = (c) => { r.code = c; return r; };
    r.end = (t) => { r.body = t ? JSON.parse(t) : null; };
    return r;
  };

  const ohne = antwort();
  await handleInhaltMeldungRoute({ method: "POST", authUser: null }, new URL("https://x/api/inhalt-meldung"), ohne, { env });
  assert.equal(ohne.code, 401, "ohne Anmeldung keine Meldung");

  const req = {
    method: "POST",
    authUser: { email: "nutzer@example.com" },
    on(ereignis, fn) {
      if (ereignis === "data") fn(Buffer.from(JSON.stringify({ grund: "hass", inhalt: "Schreib an mail@example.com", frage: "Hallo" })));
      if (ereignis === "end") fn();
      return this;
    }
  };
  const res = antwort();
  const behandelt = await handleInhaltMeldungRoute(req, new URL("https://x/api/inhalt-meldung"), res, { env });
  assert.equal(behandelt, true);
  assert.equal(res.code, 200, `unerwartet: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);

  const leseReq = { method: "GET", authUser: { email: "chef@smejj.com" } };
  const leseRes = antwort();
  await handleInhaltMeldungRoute(leseReq, new URL("https://x/api/inhalt-meldung/alle"), leseRes, { env });
  assert.equal(leseRes.code, 200);
  assert.equal(leseRes.body.total, 1);
  const m = leseRes.body.meldungen[0];
  assert.equal(m.grund, "hass");
  assert.equal(m.status, "offen");
  assert.ok(!m.inhalt.includes("mail@example.com"), "E-Mail im Inhalt muss maskiert sein");
  assert.ok(!JSON.stringify(m).includes("nutzer@example.com"), "die meldende Person darf nicht im Klartext stehen");

  const fremdRes = antwort();
  await handleInhaltMeldungRoute({ method: "GET", authUser: { email: "wer@anders.de" } }, new URL("https://x/api/inhalt-meldung/alle"), fremdRes, { env });
  assert.equal(fremdRes.code, 403, "nur der Betreiber sieht die Meldungen");
});
