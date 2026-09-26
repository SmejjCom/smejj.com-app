// smejj.com — Bildablage der Bruecke: ein schon gemaltes Bild kommt auf Nachfrage
// (bildErneut) SOFORT zurueck, ohne neues Malen (Betreiber 23.09.2026).
// Standalone: node --test tests/chat-bridge-bildablage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bildablageSchluessel, willBildErneut, legeBildAb, holeAbgelegtesBild, bildablageGroesse
} from "../public/chat-bridge-bildablage.js";
import { streamBilderLane } from "../public/chat-bridge-bilder.js";

// Kleinstes gueltiges PNG (1x1).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const BILD = `Hier ist dein Bild:\n\n![Erstelltes Bild](data:image/png;base64,${PNG_B64})`;

test("Schluessel: gebunden an Anmeldung UND Auftrag, leer ohne eins von beiden", () => {
  const a = bildablageSchluessel("Bearer eins", "Generiere ein Bild von: Antalya");
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, bildablageSchluessel("Bearer eins", "  generiere ein Bild von:   antalya "), "Gross/Klein und Leerraum egal");
  assert.notEqual(a, bildablageSchluessel("Bearer zwei", "Generiere ein Bild von: Antalya"), "fremde Anmeldung = anderes Fach");
  assert.notEqual(a, bildablageSchluessel("Bearer eins", "Generiere ein Bild von: Istanbul"), "anderer Auftrag = anderes Fach");
  assert.equal(bildablageSchluessel("", "x"), "");
  assert.equal(bildablageSchluessel("Bearer eins", ""), "");
});

test("Ablage: nur echte Bilder, Ablauf nach 30 Minuten, Deckel 40", () => {
  const k = bildablageSchluessel("Bearer t", "Male einen Leuchtturm");
  assert.equal(legeBildAb(k, "Das Malen ist gerade fehlgeschlagen"), false, "Absagen werden nie abgelegt");
  assert.equal(legeBildAb(k, BILD, 1_000), true);
  assert.equal(holeAbgelegtesBild(k, 1_000 + 29 * 60_000), BILD);
  assert.equal(holeAbgelegtesBild(k, 1_000 + 31 * 60_000), "", "abgelaufen");
  for (let i = 0; i < 45; i += 1) legeBildAb(bildablageSchluessel("Bearer t", `Bild ${i}`), BILD);
  assert.ok(bildablageGroesse() <= 40, "nie mehr als 40 Bilder im Speicher");
  assert.equal(willBildErneut({ bildErneut: true }), true);
  assert.equal(willBildErneut({ preferences: { bildErneut: true } }), true);
  assert.equal(willBildErneut({ bildErneut: "ja" }), false, "nur echtes true");
  assert.equal(willBildErneut({}), false);
});

function sammelAntwort() {
  return {
    inhalt: "", kopf: null, beendet: false,
    writeHead(code, kopf) { this.code = code; this.kopf = kopf; },
    write(stueck) {
      for (const zeile of String(stueck).split("\n")) {
        if (!zeile.startsWith("data: ") || zeile === "data: [DONE]") continue;
        const daten = JSON.parse(zeile.slice(6));
        if (daten.choices) this.inhalt += daten.choices[0].delta.content;
      }
    },
    end() { this.beendet = true; }
  };
}

test("streamBilderLane: erster Auftrag malt, Nachfrage mit bildErneut liefert DASSELBE Bild ohne neues Malen", async () => {
  let gemalt = 0;
  const fetchImpl = async (adresse) => {
    const pfad = String(adresse);
    if (pfad.endsWith("/health")) return new Response(JSON.stringify({ ok: true, bereit: true }), { status: 200 });
    if (pfad.endsWith("/erzeuge")) {
      gemalt += 1;
      return new Response(JSON.stringify({ ok: true, b64: PNG_B64 }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const deps = {
    corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 5000,
    acceptLanguage: "de-DE", anmeldung: "Bearer nutzer-a", fetchImpl
  };
  const auftrag = "Generiere ein Bild von: Antalya Test Ablage";
  const erst = sammelAntwort();
  assert.equal(await streamBilderLane(erst, {}, auftrag, deps), true);
  assert.equal(gemalt, 1);
  assert.match(erst.inhalt, /data:image\/png;base64,/);

  const nochmal = sammelAntwort();
  assert.equal(await streamBilderLane(nochmal, { bildErneut: true }, auftrag, deps), true);
  assert.equal(gemalt, 1, "KEIN zweites Malen");
  assert.equal(nochmal.inhalt, erst.inhalt, "byte-gleiches Bild");
  assert.equal(nochmal.kopf?.["x-smejj-profile"], "bilder-ablage");
  assert.equal(nochmal.beendet, true);

  // Ohne bildErneut (bewusst neuer Auftrag) wird neu gemalt.
  await streamBilderLane(sammelAntwort(), {}, auftrag, deps);
  assert.equal(gemalt, 2);
  // Andere Anmeldung bekommt das Bild NICHT aus der Ablage.
  await streamBilderLane(sammelAntwort(), { bildErneut: true }, auftrag, { ...deps, anmeldung: "Bearer nutzer-b" });
  assert.equal(gemalt, 3, "fremde Anmeldung: kein Zugriff auf die Ablage");
});

test("chat-bridge.js reicht den Anmelde-Kopf an beide Bildspuren weiter", () => {
  const q = fs.readFileSync("public/chat-bridge.js", "utf8");
  assert.equal((q.match(/anmeldung: req\.headers\?\.authorization, kontrolle: CONTROL_ORIGIN \}\)\) return;/g) || []).length, 2);
});

test("bildNurAblage (v172, Rettung nach App-Neustart): Treffer liefert das Bild, ohne Treffer NIE neu malen", async () => {
  let gemalt = 0;
  const fetchImpl = async (adresse) => {
    const pfad = String(adresse);
    if (pfad.endsWith("/health")) return new Response(JSON.stringify({ ok: true, bereit: true }), { status: 200 });
    if (pfad.endsWith("/erzeuge")) { gemalt += 1; return new Response(JSON.stringify({ ok: true, b64: PNG_B64 }), { status: 200 }); }
    return new Response("{}", { status: 404 });
  };
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 5000, acceptLanguage: "de-DE", anmeldung: "Bearer rettung", fetchImpl };
  const leer = sammelAntwort();
  assert.equal(await streamBilderLane(leer, { bildErneut: true, bildNurAblage: true }, "Male ein Bild von einem Heissluftballon", deps), true);
  assert.equal(gemalt, 0, "ohne Ablage-Treffer wird NICHT gemalt");
  assert.equal(leer.inhalt, "");
  assert.equal(leer.kopf?.["x-smejj-profile"], "bilder-ablage-leer");
  await streamBilderLane(sammelAntwort(), {}, "Male ein Bild von einem Heissluftballon", deps);
  assert.equal(gemalt, 1);
  const treffer = sammelAntwort();
  await streamBilderLane(treffer, { bildErneut: true, bildNurAblage: true }, "Male ein Bild von einem Heissluftballon", deps);
  assert.equal(gemalt, 1, "Treffer aus der Ablage, kein zweites Malen");
  assert.match(treffer.inhalt, /data:image\/png;base64,/);
});

test("v177: Nachfrage WAEHREND des Malens wartet auf dieses Malen — kein zweites Malen (Ashburn ~165 s)", async () => {
  let gemalt = 0;
  let loslassen;
  const fetchImpl = async (adresse) => {
    const pfad = String(adresse);
    if (pfad.endsWith("/health")) return new Response(JSON.stringify({ ok: true, bereit: true }), { status: 200 });
    if (pfad.endsWith("/erzeuge")) {
      gemalt += 1;
      await new Promise((r) => { loslassen = r; }); // der Maler braucht (hier kuenstlich) lange
      return new Response(JSON.stringify({ ok: true, b64: PNG_B64 }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 5000, acceptLanguage: "de-DE", anmeldung: "Bearer langsam", fetchImpl };
  const auftrag = "Male ein Bild von einer langsamen Schnecke";
  const erst = sammelAntwort();
  const ersterLauf = streamBilderLane(erst, {}, auftrag, deps);
  while (!loslassen) await new Promise((r) => setTimeout(r, 5));
  const nach = sammelAntwort();
  const nachfrage = streamBilderLane(nach, { bildErneut: true }, auftrag, deps);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gemalt, 1, "die Nachfrage malt NICHT neu");
  assert.equal(nach.beendet, false, "sie wartet auf das laufende Malen");
  assert.equal(nach.kopf?.["x-smejj-profile"], "bilder-ablage-warten");
  loslassen();
  await Promise.all([ersterLauf, nachfrage]);
  assert.equal(gemalt, 1);
  assert.match(nach.inhalt, /data:image\/png;base64,/, "die Nachfrage bekommt dasselbe Bild");
  assert.equal(nach.inhalt, erst.inhalt);
  const { maltGerade, bildablageSchluessel } = await import("../public/chat-bridge-bildablage.js");
  assert.equal(maltGerade(bildablageSchluessel("Bearer langsam", auftrag)), false, "danach aufgeraeumt");
});

test("v178: fertiges Foto landet im Konto + Register; neues Token findet es dort, ohne neu zu malen", async () => {
  let gemalt = 0;
  const konto = new Map(); // auftrag -> id (Attrappe des Servers, je Konto)
  const hochgeladen = [];
  const fetchImpl = async (adresse, init = {}) => {
    const pfad = String(adresse);
    if (pfad.endsWith("/health")) return new Response(JSON.stringify({ ok: true, bereit: true }), { status: 200 });
    if (pfad.endsWith("/erzeuge")) { gemalt += 1; return new Response(JSON.stringify({ ok: true, b64: PNG_B64 }), { status: 200 }); }
    if (pfad === "https://api.test/api/chat-medien") {
      hochgeladen.push({ typ: init.headers["Content-Type"], auth: init.headers.Authorization, bytes: init.body.length });
      return new Response(JSON.stringify({ ok: true, id: `${"a".repeat(40)}.png` }), { status: 200 });
    }
    if (pfad === "https://api.test/api/chat-medien/auftrag") {
      const rumpf = JSON.parse(init.body);
      if (rumpf.id) { konto.set(rumpf.auftrag.toLowerCase(), rumpf.id); return new Response(JSON.stringify({ ok: true, id: rumpf.id }), { status: 200 }); }
      const id = konto.get(rumpf.auftrag.toLowerCase());
      return new Response(JSON.stringify(id ? { ok: true, id } : { ok: false }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 5000, acceptLanguage: "en-US", anmeldung: "Bearer token-alt", kontrolle: "https://api.test", fetchImpl };
  const auftrag = "Generate an image of: a red fox in the register";
  await streamBilderLane(sammelAntwort(), {}, auftrag, deps);
  await new Promise((r) => setTimeout(r, 30)); // Ablage im Konto laeuft im Hintergrund
  assert.equal(gemalt, 1);
  assert.deepEqual(hochgeladen, [{ typ: "image/png", auth: "Bearer token-alt", bytes: Buffer.from(PNG_B64, "base64").length }], "Foto mit eigener Anmeldung im Konto abgelegt");
  // Neues Token (oder Bruecke neu gestartet): Arbeitsspeicher leer, Register traegt.
  const rettung = sammelAntwort();
  await streamBilderLane(rettung, { bildErneut: true, bildNurAblage: true }, auftrag, { ...deps, anmeldung: "Bearer token-neu" });
  assert.equal(gemalt, 1, "nicht neu gemalt");
  assert.equal(rettung.inhalt, `Here is your image:\n\n![Generated image](https://api.smejj.com/api/chat-medien?id=${"a".repeat(40)}.png)`, "oeffentliche Adresse, nie die interne Kontroll-Adresse (v179)");
  // Unbekannter Auftrag bei bildNurAblage: leer, nie malen.
  const leer = sammelAntwort();
  await streamBilderLane(leer, { bildErneut: true, bildNurAblage: true }, "Generate an image of: something never painted", { ...deps, anmeldung: "Bearer token-neu" });
  assert.equal(leer.inhalt, "");
  assert.equal(gemalt, 1);
});
