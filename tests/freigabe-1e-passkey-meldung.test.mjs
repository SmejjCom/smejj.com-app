// Betreiber-Freigabe 1e (15.09.2026): Passkey-Fehler verstaendlich auf Deutsch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// passkey-ui.js verdrahtet beim Import das DOM; die Uebersetzung ist rein und wird
// hier aus der Quelle geladen (gleicher Weg wie andere reine Helfer in Tests).
const quelle = readFileSync(new URL("../public/auth/passkey-ui.js", import.meta.url), "utf8");
const start = quelle.indexOf("export function passkeyFehlerText");
const ende = quelle.indexOf("\nfunction writeOutput");
const passkeyFehlerText = new Function(`${quelle.slice(start, ende).replace("export function", "function")}; return passkeyFehlerText;`)();

test("NotAllowedError (kein Passkey/abgebrochen/abgelaufen) → deutscher Hinweis mit Ausweg", () => {
  const e = Object.assign(new Error("The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client."), { name: "NotAllowedError" });
  const t = passkeyFehlerText(e, "anmelden");
  assert.match(t, /^Kein Passkey gefunden oder Vorgang abgebrochen/);
  assert.match(t, /Google, GitHub oder E-Mail/);
  assert.doesNotMatch(t, /w3\.org|operation/);
  assert.match(passkeyFehlerText(e, "einrichten"), /nicht eingerichtet/);
});

test("weitere WebAuthn-Namen und rohe englische Texte werden deutsch, Servertexte bleiben", () => {
  assert.match(passkeyFehlerText({ name: "InvalidStateError" }), /schon ein Passkey eingerichtet/);
  assert.match(passkeyFehlerText({ name: "NotSupportedError" }), /unterstützt keine Passkeys/);
  assert.match(passkeyFehlerText({ name: "SecurityError" }), /sichere Verbindung/);
  assert.equal(passkeyFehlerText(new TypeError("Failed to fetch")), "Anmeldung mit Passkey hat nicht geklappt. Bitte versuche es noch einmal.");
  assert.equal(passkeyFehlerText(new Error("Kein Konto zu diesem Passkey gefunden.")), "Passkey-Anmeldung fehlgeschlagen: Kein Konto zu diesem Passkey gefunden.");
});

test("beide Knoepfe nutzen die Uebersetzung", () => {
  assert.match(quelle, /writeOutput\(passkeyFehlerText\(error, "einrichten"\)\)/);
  assert.match(quelle, /writeOutput\(passkeyFehlerText\(error, "anmelden"\)\)/);
  assert.doesNotMatch(quelle, /fehlgeschlagen: \$\{error\?\.message \|\| error\}/);
});
