// smejj.com — Schutztests fuer die Bilder-Zeichnen-Spur (chat-bridge-bilder.js).
// Befund 2026-08-12 (Livetest im Chrome): "Zeichne ein Bild ..." ergab nur
// ASCII-Kunst. Betreiber-Vorgabe: die EIGENE KI (smejj 1.0) zeichnet — als SVG.
// Diese Tests laufen OHNE Netz und ohne Schluessel — genau der Zustand, in dem
// die Spur fail-safe komplett aus sein muss.
import assert from "node:assert/strict";
import test from "node:test";

import { erkenneBildAuftrag, sichereSvgAntwort, streamBilderLane } from "../public/chat-bridge-bilder.js";

test("erkenneBildAuftrag: Mal-Verb UND Motivwort noetig (deutsch/englisch)", () => {
  const treffer = [
    "Zeichne mir bitte ein Bild von einem roten Fuchs im Wald.",
    "Male ein Gemälde im Stil von Monet",
    "erstelle ein logo fuer meine baeckerei",
    "Generiere eine Illustration einer Stadt bei Nacht",
    "Please draw a picture of a blue cat",
    "create an image of a sunset over the alps"
  ];
  for (const task of treffer) {
    assert.equal(erkenneBildAuftrag(task), task, `sollte erkannt werden: ${task}`);
  }
});

test("erkenneBildAuftrag: normale Fragen nehmen NIE die Bild-Spur", () => {
  const kein = [
    "Was ist die Hauptstadt von Portugal?",
    "Erstelle mir einen Trainingsplan", // Verb ohne Motivwort
    "Wie gross ist das Bild auf dem Mars-Foto?", // Motivwort ohne Mal-Verb
    "Erklaere den Unterschied zwischen JPEG und PNG",
    "",
    null
  ];
  for (const task of kein) {
    assert.equal(erkenneBildAuftrag(task), "", `darf NICHT erkannt werden: ${task}`);
  }
  // Ueberlange Eingaben (Prompt-Stuffing) fallen auf den Text-Weg.
  assert.equal(erkenneBildAuftrag(`Zeichne ein Bild ${"x".repeat(700)}`), "");
});

test("sichereSvgAntwort: ohne xmlns wird es ergaenzt (Browser lehnen data:-SVGs sonst ab)", () => {
  // Live gemessen 2026-08-12: naturalWidth 0, kaputtes Bild-Icon.
  const ohne = '<svg viewBox="0 0 512 512"><rect width="512" height="512" fill="#234"/></svg>';
  assert.match(sichereSvgAntwort(ohne), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox/);
});

test("sichereSvgAntwort: zieht das SVG auch aus Geschwaetz drumherum", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#234"/><circle cx="256" cy="256" r="80" fill="#e63"/></svg>';
  assert.equal(sichereSvgAntwort(svg), svg);
  assert.equal(sichereSvgAntwort(`Hier ist dein Bild:\n\`\`\`svg\n${svg}\n\`\`\`\nViel Freude!`), svg);
  // Farbverlaeufe verweisen per url(#id) auf ihre Definition — das ist erlaubt.
  const verlauf = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g"><stop offset="0" stop-color="#123"/><stop offset="1" stop-color="#89a"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>';
  assert.equal(sichereSvgAntwort(verlauf), verlauf);
});

test("sichereSvgAntwort: alles Ausfuehrbare/Nachladende wird hart abgewiesen", () => {
  const faelle = [
    '<svg viewBox="0 0 512 512"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 512 512"><rect onload="alert(1)"/></svg>',
    '<svg viewBox="0 0 512 512"><foreignObject></foreignObject></svg>',
    '<svg viewBox="0 0 512 512"><image href="https://boese.example/x.png"/></svg>',
    '<svg viewBox="0 0 512 512"><use href="#x"/></svg>',
    '<svg viewBox="0 0 512 512"><rect style="fill:url(https://boese.example)"/></svg>',
    "<svg><rect/></svg>", // ohne viewBox skaliert die Anzeige nicht sauber
    "kein svg enthalten",
    `<svg viewBox="0 0 512 512">${"x".repeat(70_000)}</svg>` // Groessen-Deckel
  ];
  for (const fall of faelle) {
    assert.equal(sichereSvgAntwort(fall), "", `muss abgewiesen werden: ${fall.slice(0, 60)}`);
  }
});

test("streamBilderLane: ohne Schluessel false, ohne ein einziges gesendetes Byte", async () => {
  // In der Testumgebung ist der Groq-Schluessel nicht gesetzt (er lebt nur in
  // den Salad-Containern) — die Spur darf dann nichts anfassen.
  assert.equal(process.env.SMEJJ_LLM_GROQ_API_KEY || "", "", "Test setzt unbelegten Schluessel voraus");
  let geschrieben = false;
  const res = { writeHead: () => { geschrieben = true; }, write: () => { geschrieben = true; }, end: () => { geschrieben = true; } };
  const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 1000 };
  assert.equal(await streamBilderLane(res, {}, "Zeichne ein Bild von einem Fuchs", deps), false);
  assert.equal(geschrieben, false, "bei false darf kein Byte gesendet sein — der Text-Weg uebernimmt");
});
