// smejj.com — Anmeldezustand der Kontoseite (Verhalten, nicht Quelltext).
// Ausfuehren: node --test tests/konto-anmeldezustand.test.mjs
//
// Warum dieser Test existiert (Befund 2026-08-07): "Passkey einrichten" stand
// in der Gruppe der ANMELDE-Wege und war damit nur sichtbar, solange niemand
// angemeldet war. Das Einrichten verlangt serverseitig aber eine Sitzung —
// ohne sie antwortet /api/auth/passkey/register/options mit 401. Der Knopf war
// also genau dann da, wenn er nicht funktionieren KANN, und weg, sobald er
// funktioniert haette: unerreichbar, ohne dass irgendwo ein Fehler auftauchte.
//
// Der bestehende Test in profile-dock.test.mjs prueft den QUELLTEXT und konnte
// das nicht sehen. Deshalb hier eine Buehne, die den Zustand wirklich anwendet.
import test from "node:test";
import assert from "node:assert/strict";
import { applyAuthState } from "../public/account-auth-state.js";

/** Minimale Buehne: nur was applyAuthState wirklich anfasst. */
function buehne() {
  const knoepfe = new Map();
  for (const id of ["googleSignIn", "passkeyLogin", "passkeyRegister", "loginLocal",
    "logoutLocal", "serverSessionsBlock"]) {
    knoepfe.set(`#${id}`, { hidden: false, style: {} });
  }
  return {
    dataset: {},
    querySelector: (auswahl) => knoepfe.get(auswahl) || null,
    sichtbar: (auswahl) => {
      const el = knoepfe.get(auswahl);
      return Boolean(el) && el.hidden === false && el.style.display !== "none";
    }
  };
}

test("angemeldet: 'Passkey einrichten' ist sichtbar — sonst waere es unerreichbar", () => {
  const view = buehne();
  applyAuthState(view, { email: "owner@example.de", method: "google" });
  assert.equal(view.sichtbar("#passkeyRegister"), true,
    "Einrichten braucht eine Sitzung, also muss der Knopf im angemeldeten Zustand da sein");
  assert.equal(view.sichtbar("#logoutLocal"), true);
});

test("abgemeldet: Anmelde-Wege sichtbar, 'Passkey einrichten' nicht", () => {
  const view = buehne();
  applyAuthState(view, null);
  assert.equal(view.sichtbar("#passkeyLogin"), true, "anmelden geht ohne Sitzung");
  assert.equal(view.sichtbar("#googleSignIn"), true);
  assert.equal(view.sichtbar("#passkeyRegister"), false,
    "ohne Sitzung antwortet der Server 401 — den Knopf dann anzubieten waere eine Sackgasse");
  assert.equal(view.sichtbar("#logoutLocal"), false);
});

test("Server-Sitzungsliste nur fuer E-Mail-Konten", () => {
  const email = buehne();
  applyAuthState(email, { email: "owner@example.de", method: "email" });
  assert.equal(email.sichtbar("#serverSessionsBlock"), true);

  const google = buehne();
  applyAuthState(google, { email: "owner@example.de", method: "google" });
  assert.equal(google.sichtbar("#serverSessionsBlock"), false,
    "Google-/Passkey-Sitzungen sind zustandslos und kennen keine Fern-Widerrufsliste");
});

test("der Zustand steht am Container, damit CSS daran haengen kann", () => {
  const an = buehne();
  applyAuthState(an, { email: "x@y.de" });
  assert.equal(an.dataset.authState, "authenticated");

  const aus = buehne();
  applyAuthState(aus, null);
  assert.equal(aus.dataset.authState, "anonymous");
});

test("ohne Container passiert nichts (kein Absturz)", () => {
  assert.doesNotThrow(() => applyAuthState(null, { email: "x@y.de" }));
});
