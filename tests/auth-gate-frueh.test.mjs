// Das fruehe Tor der Startseite (Betreiber-Freigabe 2026-08-23). Gemessen vorher:
// Anonyme sahen 3,7 s (Desktop) / 15 s (iPhone) die App-Huelle, weil das volle
// Gate erst mit profile-dock.js (Modul 24 von 34) lief.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const html = fs.readFileSync("public/index.html", "utf8");
const quelle = fs.readFileSync("public/auth-gate-frueh.js", "utf8");
const gate = fs.readFileSync("public/auth-gate.js", "utf8");

test("das fruehe Tor ist das ERSTE Skript in index.html: INLINE und kein Modul", () => {
  // Seit dem Kaltstart-Umbau (Betreiber-Freigabe 2026-08-25) steht das Tor
  // INLINE im head — der erste blockierende Request entfaellt damit ganz.
  const erstes = html.match(/<script[^>]*>/)[0];
  assert.doesNotMatch(erstes, /src=/, "das Tor braucht keinen eigenen Request mehr");
  assert.doesNotMatch(erstes, /type="module"/);
  assert.ok(html.indexOf(erstes) < html.indexOf("</head>"), "steht im <head>");
  // EINE Wahrheit: der Inline-Rumpf ist BYTE-GLEICH der Datei — wer das Tor
  // aendert, muss neu inlinen (und den CSP-Hash nachziehen), sonst rot.
  assert.ok(html.includes("<script>" + quelle + "</script>"), "Inline-Rumpf == public/auth-gate-frueh.js");
  // Und der Hash in der CSP passt zum Rumpf, sonst blockt der Browser still.
  const hash = crypto.createHash("sha256").update(quelle, "utf8").digest("base64");
  assert.ok(html.includes("'sha256-" + hash + "'"), "CSP-Hash muss zum Inline-Rumpf passen");
});

test("das Stylesheet wird per preload sofort angestossen (Kaltstart 25.08.)", () => {
  const preload = html.match(/<link rel="preload" href="\/assets\/start-styles\.css[^"]*" as="style">/);
  assert.ok(preload, "preload-Link fehlt");
  assert.ok(html.indexOf(preload[0]) < html.indexOf("<script>"), "preload steht VOR dem Tor");
});

test("kein Import, keine Abhaengigkeit — sonst waere es wieder spaet", () => {
  assert.doesNotMatch(quelle, /\bimport\b|\brequire\(/);
  assert.ok(quelle.length < 2000, "bleibt winzig");
});

test("Schluessel sind dieselben wie im vollen Gate (eine Wahrheit)", () => {
  // auth-gate.js holt den Sitzungsschluessel aus config.js (STORAGE_KEYS.session).
  const config = fs.readFileSync("public/config.js", "utf8");
  assert.ok(quelle.includes("smejj.auth.accessToken.v1") && gate.includes("smejj.auth.accessToken.v1"));
  assert.ok(quelle.includes("smejj.session.v1") && config.includes('session: "smejj.session.v1"'));
});

function laufe({ pfad, speicher }) {
  const aufrufe = [];
  const ctx = {
    location: { pathname: pfad, replace: (z) => aufrufe.push(z) },
    localStorage: { getItem: (k) => (k in speicher ? speicher[k] : null) }
  };
  vm.runInNewContext(quelle, ctx);
  return aufrufe;
}

test("ohne Sitzung auf / -> Landeseite; mit Token oder lokalem Profil bleibt die App", () => {
  assert.deepEqual(laufe({ pfad: "/", speicher: {} }), ["/willkommen.html"]);
  assert.deepEqual(laufe({ pfad: "/index.html", speicher: {} }), ["/willkommen.html"]);
  assert.deepEqual(laufe({ pfad: "/", speicher: { "smejj.auth.accessToken.v1": "tok" } }), []);
  assert.deepEqual(laufe({ pfad: "/", speicher: { "smejj.session.v1": JSON.stringify({ authenticated: true }) } }), []);
});

test("andere Pfade bleiben Sache von auth-gate.js (Rueckkehr-Ziel, Cookie-Weg)", () => {
  assert.deepEqual(laufe({ pfad: "/verlauf", speicher: {} }), []);
  assert.deepEqual(laufe({ pfad: "/auth/login/", speicher: {} }), []);
});

test("gesperrter Speicher wirft nicht und leitet nicht blind um", () => {
  const ctx = { location: { pathname: "/", replace: () => { throw new Error("nie"); } }, localStorage: { getItem: () => { throw new Error("gesperrt"); } } };
  assert.doesNotThrow(() => vm.runInNewContext(quelle, ctx));
});
