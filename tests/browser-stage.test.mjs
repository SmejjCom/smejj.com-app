// smejj.com — die eingebetteten Ansichten sind BEDIENBAR (browser-stage.js).
//
// Der Fehler dahinter (Betreiber, 2026-08-19: "ich kann im Browser keine
// Amazon bedienen"): srcdoc-Rahmen erben die CSP des Einbetters
// (script-src 'self', KEIN unsafe-inline). Die Bedienlogik der Ansichten
// steckte als Inline-<script> in den Vorlagen und wurde stumm blockiert —
// Bild da, klicken/tippen/scrollen/Erneut-laden tot. Alle bisherigen Tests
// lasen nur den Quelltext der Vorlagen; keiner liess einen Rahmen laufen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const render = fs.readFileSync("public/browser-pane-render.js", "utf8");
const stage = fs.readFileSync("public/browser-stage.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("KEIN Inline-Script in den srcdoc-Vorlagen — CSP blockiert es stumm", () => {
  // <script src=...> ist erlaubt ('self'), <script> ohne src ist der Fehler.
  assert.doesNotMatch(render, /<script>(?!<)/, "Inline-<script> in einer Vorlage — wird von script-src 'self' stumm blockiert");
  assert.match(render, /<script src="\/assets\/browser-stage\.js\?v=\d+"><\/script>/);
});

test("browser-stage.js traegt alle drei Rollen und ist rahmentauglich", () => {
  assert.match(stage, /getElementById\("nochmal"\)/);           // Fehlerseite
  assert.match(stage, /getElementById\("bpScroll"\)/);          // Worker-Ansicht
  assert.match(stage, /getElementById\("bpStage"\)/);           // Live-Buehne
  assert.match(stage, /smejj\.browser\.sessionAct/);            // Klick/Tipp-Weg
  assert.doesNotMatch(stage, /^import /m, "importfrei — sandboxed Rahmen laden keine Module");
});

test("browser-stage.js liegt im Precache — offline darf die Buehne nicht sterben", () => {
  assert.match(sw, /"\/assets\/browser-stage\.js"/);
});

test("die Buehnen-Logik ist vollstaendig umgezogen, nichts doppelt", () => {
  // Kernstuecke der Live-Buehne existieren GENAU EINMAL — in der Stage-Datei.
  for (const stueck of ["toPct", "flushText", "flushWheel"]) {
    assert.equal((stage.match(new RegExp(stueck, "g")) || []).length > 0, true, stueck + " fehlt in browser-stage.js");
    assert.equal(render.includes(stueck), false, stueck + " steht noch in der Vorlage");
  }
});

// --- Anmeldeseiten gehoeren in den Live-Browser (2026-08-20) -----------------
//
// Betreiber: "Google Mail kann ich nicht einloggen, Alibaba nicht." Live
// nachgestellt: die Google-Anmeldung landete im PROXY (totes Abbild) — das
// getippte Zeichen erschien nicht einmal im Feld. Anmelden ist dort
// grundsaetzlich unmoeglich, und nichts sagt es dem Nutzer.
test("eine Seite mit Passwortfeld geht in den echten Browser, nie in den Proxy", async () => {
  const { hatAnmeldeFeld, shouldOpenInRealBrowser } = await import("../public/browser-pane-adressen.js");
  // Erkennung inhaltlich, nicht per Hostliste — jede Anmeldeseite hat eines.
  assert.equal(hatAnmeldeFeld('<input type="password" name="pw">'), true);
  assert.equal(hatAnmeldeFeld("<input type='password'>"), true);
  assert.equal(hatAnmeldeFeld('<input type="PASSWORD">'), true, "Schreibweise egal");
  assert.equal(hatAnmeldeFeld('<input type="text" name="suche">'), false);
  assert.equal(hatAnmeldeFeld(""), false);
  // ... und die Weiche zieht daraus die Folge:
  assert.equal(shouldOpenInRealBrowser('<form><input type="password"></form>', "https://accounts.google.com/"), true);
  assert.equal(shouldOpenInRealBrowser("<p>nur text</p>", "https://beispiel.de/"), false);

  // DER FALL, DER DEN ERSTEN ANLAUF SCHEITERN LIESS (live gemessen
  // 2026-08-20): Die Google-Anmeldung ist 990 412 Zeichen gross und traegt
  // ihr Passwortfeld an Position 918 843. shouldOpenInRealBrowser() suchte
  // nur in den ersten 120 000 Zeichen — die Weiche griff nicht, die Seite
  // blieb im Proxy, und der Betreiber konnte sich weiterhin nicht anmelden.
  const wieGoogle = "x".repeat(900000) + '<input type="password" name="pw">';
  assert.equal(shouldOpenInRealBrowser(wieGoogle, "https://accounts.google.com/"), true,
    "Anmeldefeld muss auch am Ende einer 990-KB-Seite gefunden werden");
  assert.equal(shouldOpenInRealBrowser("y".repeat(900000), "https://beispiel.de/"), false,
    "grosse Seite ohne Anmeldefeld bleibt im schnellen Weg");
});
