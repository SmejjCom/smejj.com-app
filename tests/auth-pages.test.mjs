import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("auth pages expose honest professional sign-in paths", async () => {
  const [login, register, css, js] = await Promise.all([
    text("public/auth/login/index.html"),
    text("public/auth/register/index.html"),
    text("public/auth/auth.css"),
    text("public/auth/auth-page.js")
  ]);
  for (const page of [login, register]) {
    assert.match(page, /smejj\.com/);
    assert.match(page, /googleLogin/);
    assert.match(page, /appleLogin/);
    assert.match(page, /githubLogin/);
    assert.match(page, /magicLinkLogin/);
    assert.match(page, /passkey/);
    assert.match(page, /noindex, nofollow/);
    assert.match(page, /href="\/(assets\/)?auth\/auth\.css(\?v=[^"]*)?"/);
    assert.match(page, /src="\/(assets\/)?auth\/auth-page\.js(\?v=[^"]*)?"/);
  }
  // Vier-Zeilen-Fassung (Mockup V11 Bildschirm 4, Betreiber-Freigabe
  // 2026-08-15 im Chat): EINE Seite fuer Anmelden UND Registrieren, der
  // E-Mail-Weg ist die vierte Zeile und klappt auf (vier-zeilen.js).
  assert.match(login, /Anmelden oder registrieren/);
  assert.match(login, /Mit E-Mail fortfahren/);
  assert.match(login, /id="emailWegBlock"/);
  assert.match(login, /src="\/auth\/vier-zeilen\.js(\?v=[^"]*)?"/);
  assert.match(register, /Konto erstellen/);
  assert.match(css, /auth-card/);
  assert.match(css, /prefers-color-scheme: light/);
  assert.match(css, /--auth-accent/);
  assert.match(css, /\.auth-button \{[\s\S]*width: 100%/);
  assert.doesNotMatch(css, /#657cff|#8056df|#6d4cff/);
  assert.match(js, /authConfig/);
  assert.match(js, /Apple-OAuth-Konfiguration/);
  assert.doesNotMatch(login, /<script[^>]+src="\/app\.js"/);
  assert.doesNotMatch(register, /<script[^>]+src="\/app\.js"/);
});

// ---------------------------------------------------------------------------
// 2026-08-04 — A-Z-Pruefung der Live-Seite, zwei Befunde.
// ---------------------------------------------------------------------------

test("kein Passwort laeuft je durch einen Browser-Dialog", async () => {
  // Befund 2026-08-04: der Passwort-Reset fragte das NEUE Passwort mit
  // window.prompt() ab. Ein prompt()-Feld maskiert nicht — das Passwort stand
  // im Klartext auf dem Schirm; Passwortverwaltungen kennen den Dialog nicht;
  // Chrome kann wiederholte Dialoge dauerhaft unterdruecken. Und ohne zweites
  // Feld sperrt ein unsichtbarer Tippfehler den Nutzer aus dem eigenen Konto.
  const js = await text("public/auth/auth-page.js");
  const code = js.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/window\.prompt\s*\(/.test(code),
    "kein window.prompt im ausgefuehrten Code der Anmeldeseite");
  assert.match(js, /startPasswordReset/, "der Reset laeuft ueber das Seitenformular");
  assert.match(js, /emailPasswordRepeat/, "es gibt ein Bestaetigungsfeld");
  assert.match(js, /autocomplete = "new-password"/,
    "das Feld muss der Passwortverwaltung sagen, dass ein NEUES Passwort gesetzt wird");
  assert.match(js, /history\.replaceState/,
    "der verbrauchte Reset-Token gehoert nicht in Adresszeile und Verlauf");
});

test("das Bestaetigungsfeld verhindert den unsichtbaren Tippfehler", async () => {
  const js = await text("public/auth/auth-page.js");
  const funktion = js.match(/function startPasswordReset[\s\S]*?\n\}/)[0];
  assert.match(funktion, /neu !== bestaetigung\.value/,
    "ungleiche Eingaben duerfen den Token NICHT verbrauchen");
  assert.ok(
    funktion.indexOf("neu !== bestaetigung.value") < funktion.indexOf("resetConfirm"),
    "der Vergleich muss VOR dem Serveraufruf stehen — sonst ist der Token weg"
  );
});

test("die Anmeldeseiten tragen dieselbe Schutzrichtlinie wie die Startseite", async () => {
  // Befund 2026-08-04: index.html hatte CSP und Referrer-Regel, die Auth-Seiten
  // nicht — ausgerechnet dort, wo E-Mail, Passwort, OAuth-Rueckkehr und der
  // Passkey-Ablauf durchlaufen.
  for (const pfad of ["public/auth/login/index.html", "public/auth/register/index.html"]) {
    const seite = await text(pfad);
    const csp = seite.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(csp, `${pfad}: CSP fehlt`);
    for (const regel of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "script-src 'self'"]) {
      assert.ok(csp[1].includes(regel), `${pfad}: CSP ohne ${regel}`);
    }
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp[1]),
      `${pfad}: script-src darf kein unsafe-inline erlauben`);
    assert.match(seite, /name="referrer" content="strict-origin-when-cross-origin"/,
      `${pfad}: Referrer-Regel fehlt — sonst kann ein Reset-Token die Seite verlassen`);
  }
});

test("die CSP laesst den Control-Server durch — sonst ist die Anmeldung tot", async () => {
  // Eine zu strenge CSP waere schlimmer als keine: die Seite holt Sitzung,
  // Login und Reset per fetch vom Control-Server.
  const [login, config] = await Promise.all([
    text("public/auth/login/index.html"),
    text("public/config.js")
  ]);
  const origin = config.match(/DEFAULT_API_ORIGIN = "([^"]+)"/)[1];
  const csp = login.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const connect = csp.match(/connect-src ([^;]+)/)[1];
  assert.ok(connect.includes(origin),
    `connect-src muss ${origin} enthalten, sonst schlaegt jeder Anmeldeversuch fehl`);
});

test("frame-guard bleibt eingebunden — meta-CSP kann frame-ancestors nicht", async () => {
  for (const pfad of ["public/auth/login/index.html", "public/auth/register/index.html"]) {
    assert.match(await text(pfad), /frame-guard\.js/, `${pfad}: Klickjacking-Schutz fehlt`);
  }
});
