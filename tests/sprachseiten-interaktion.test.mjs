// smejj.com — Sprachseiten: Inhalt oeffentlich, Interaktion angemeldet.
//
// Hintergrund (Befund 2026-08-04, live gemessen): Seit sw v213 laesst
// auth-gate.js die 15 Sprach-Landeseiten durch — richtig, denn sie tragen
// "index,follow", stehen mit hreflang in der Sitemap und sind der Einstieg aus
// der Suche. Der Sprachmodus dahinter ruft aber /api/agent, /api/chat,
// /api/voice/transcribe und /api/voice/tts. Ohne Sperre haette damit jeder
// anonyme Besucher und jeder Bot kostenpflichtige Modell- und
// Transkriptionsaufrufe ausloesen koennen.
//
// Diese Suite haelt beide Haelften fest: die Seite bleibt lesbar, die
// Bedienung nicht.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { darfSprechen } from "../public/voice-landing-signin.js";

const publicDir = path.resolve("public");
const signin = fs.readFileSync(path.join(publicDir, "voice-landing-signin.js"), "utf8");
const landing = fs.readFileSync(path.join(publicDir, "voice-landing.js"), "utf8");

const speicher = (werte) => ({ localStorage: { getItem: (k) => werte[k] ?? null } });

test("ohne Sitzung darf nicht gesprochen werden", () => {
  assert.equal(darfSprechen(speicher({})), false);
});

test("Server-Token und lokale Sitzung lassen sprechen", () => {
  assert.equal(darfSprechen(speicher({ "smejj.auth.accessToken.v1": "tok" })), true);
  assert.equal(darfSprechen(speicher({ "smejj.session.v1": JSON.stringify({ authenticated: true }) })), true);
});

test("fail-closed: kaputter Storage und fehlendes window gelten als abgemeldet", () => {
  assert.equal(darfSprechen({ get localStorage() { throw new Error("gesperrt"); } }), false);
  assert.equal(darfSprechen(null), false);
  // Ein halbes Sitzungsobjekt ist keine Sitzung.
  assert.equal(darfSprechen(speicher({ "smejj.session.v1": JSON.stringify({ authenticated: false }) })), false);
  assert.equal(darfSprechen(speicher({ "smejj.session.v1": "kein json" })), false);
});

test("Abgemeldete bekommen NUR den Anmelde-Knopf, kein Overlay", () => {
  // Die Reihenfolge ist der Kern: erst pruefen, dann bauen — und im
  // Abgemeldet-Fall wird buildUi() nie erreicht.
  assert.match(landing, /if \(!darfSprechen\(\)\) \{ buildLoginCta\(T\); return; \}/);
  const pruefungAt = landing.indexOf("if (!darfSprechen())");
  const buildUiAt = landing.indexOf("buildUi();", pruefungAt);
  assert.ok(pruefungAt > -1 && buildUiAt > pruefungAt, "buildUi() muss NACH der Pruefung stehen");
});

// Kommentare erklaeren die bezahlten Routen — geprueft wird der CODE.
const ohneKommentare = (quelle) => quelle
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((z) => !z.trimStart().startsWith("//")).join("\n");

test("der Anmelde-Knopf loest keinen einzigen bezahlten Aufruf aus", () => {
  // Im Signin-Modul darf kein Code stehen, der den Modell-Router oder die
  // Sprach-Server anspricht — sonst waere die Sperre nur Fassade.
  const code = ohneKommentare(signin);
  for (const verboten of ["api.agent", "api/chat", "voiceTranscribe", "voiceTts", "fetch(", "warmUp"]) {
    assert.equal(code.includes(verboten), false, `Signin-Modul darf ${verboten} nicht im Code haben`);
  }
  assert.match(signin, /href = LOGIN_URL/);
  assert.match(signin, /const LOGIN_URL = "\/auth\/login\/"/);
});

test("die Beschriftung kommt als Textknoten, nicht als HTML", () => {
  // Sprachtexte sind Daten. Ueber innerHTML eingesetzt waeren sie eine
  // Einfallstelle, sobald sie einmal aus einer Quelle ausserhalb des Repos kaemen.
  assert.match(signin, /querySelector\("span"\)\.textContent = texte\.signIn/);
});

test("alle 15 Sprachen haben eine Beschriftung fuer den Anmelde-Knopf", () => {
  const codes = ["de", "en", "zh", "es", "ar", "fr", "pt", "ru", "tr", "ja", "ko", "it", "hi", "id", "bn"];
  for (const code of codes) {
    const zeile = landing.split("\n").find((l) => l.trimStart().startsWith(`${code}: {`));
    assert.ok(zeile, `Sprachzeile ${code} fehlt`);
    assert.match(zeile, /signIn: "[^"]+"/, `signIn fehlt in ${code}`);
    assert.match(zeile, /signInHint: "[^"]+"/, `signInHint fehlt in ${code}`);
  }
});

test("voice-landing.js bleibt unter der 800-Zeilen-Grenze", () => {
  assert.ok(landing.split("\n").length <= 800, "sonst muss weiter ausgelagert werden");
});
