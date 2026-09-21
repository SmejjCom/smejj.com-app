// smejj.com — Schutztests fuer die Bilder-Zeichnen-Spur (chat-bridge-bilder.js).
// Befund 2026-08-12 (Livetest im Chrome): "Zeichne ein Bild ..." ergab nur
// ASCII-Kunst. Betreiber-Vorgabe: die EIGENE KI (smejj 1.0) zeichnet — als SVG.
// Diese Tests laufen OHNE Netz und ohne Schluessel — genau der Zustand, in dem
// die Spur fail-safe komplett aus sein muss.
import assert from "node:assert/strict";
import test from "node:test";

import { BILD_TEXTE, bildAntwort, erkenneBildAuftrag, erzeugeFotoInhalt, sichereSvgAntwort, spracheAusAnfrage, spracheAusKopf, streamBilderLane } from "../public/chat-bridge-bilder.js";

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

test("erkenneBildAuftrag: 'Zeichne mir X' reicht auch OHNE das Wort 'Bild'", () => {
  // Befund 2026-08-14, live gemessen: "Zeichne mir einen roten Leuchtturm am
  // Meer bei Sonnenuntergang" landete in der Textspur, und das Modell
  // antwortete, es koenne gar keine Bilder erzeugen — eine falsche Aussage
  // ueber die eigenen Faehigkeiten. Genau dieser Satz steht hier als Wache.
  const treffer = [
    "Zeichne mir einen roten Leuchtturm am Meer bei Sonnenuntergang",
    "Male eine Katze auf einem Fensterbrett",
    "zeichne einen Drachen ueber den Bergen",
    "draw a lighthouse at sunset",
    "paint a small village in winter",
    "Skizziere einen Bauplan fuer ein Baumhaus",
    // "nach" und "ab" als Praeposition mitten im Satz duerfen den Auftrag
    // NICHT verschlucken. Die erste Fassung der Redewendungs-Sperre tat genau
    // das: sie suchte die Vorsilbe irgendwo, statt am Satzende.
    "Zeichne mir eine Katze nach dem Vorbild von Picasso",
    "Male ein Haus nach meinen Angaben"
  ];
  for (const task of treffer) {
    assert.equal(erkenneBildAuftrag(task), task, `sollte erkannt werden: ${task}`);
  }
});

test("erkenneBildAuftrag: Redewendungen mit denselben Verben malen NICHT", () => {
  // Die Lockerung darf sich nicht raechen: dieselben Verben heissen in
  // festen Wendungen etwas voellig anderes. Ein faelschlich gemaltes Bild
  // waere hier teurer als eine verpasste Absicht — Malen dauert Minuten.
  const kein = [
    "Male dir das mal aus, wie das enden wuerde",
    "Kannst du dir das ausmalen?",
    "Bitte zeichne den Vertrag ab",
    "Zeichne die Route nach, die ich gefahren bin",
    "Es zeichnet sich ab, dass wir mehr Speicher brauchen",
    "male"
  ];
  for (const task of kein) {
    assert.equal(erkenneBildAuftrag(task), "", `darf NICHT malen: ${task}`);
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

// --- Der Grund eines misslungenen Bildes darf nicht verschwinden ------------
//
// Befund 2026-08-14, live: Der Maler schrieb "3/3 [01:47]" in sein Log — also
// Erfolg — und der Chat sagte trotzdem "Das Malen ist gerade fehlgeschlagen".
// Nirgends stand warum: jeder Fehlerweg endete in `return ""`. Genau dieselbe
// Stille wie beim verschluckten 400 der Verlauf-Sicherung.

const echtesBild = "iVBORw0KGgoAAAANSUhEUg==";
const alsAntwort = (koerper, ok = true, status = 200) => ({
  ok, status, json: async () => koerper
});

test("gelingt es, steht das Bild drin — und die Dauer in der Notiz", async () => {
  const notiz = {};
  const inhalt = await erzeugeFotoInhalt("fuchs", 5000, notiz,
    async () => alsAntwort({ ok: true, b64: echtesBild }));
  assert.match(inhalt, /!\[Erstelltes Bild\]\(data:image\/png;base64,/);
  assert.equal(notiz.grund, undefined, "ohne Fehler darf kein Grund gesetzt sein");
  assert.equal(typeof notiz.sekunden, "number");
});

test("JEDER Fehlweg nennt seinen Grund — keiner endet mehr stumm", async () => {
  const faelle = [
    ["HTTP-Fehler des Malers", async () => alsAntwort({}, false, 503), /^maler_http_503$/],
    ["Antwort ist kein JSON", async () => ({ ok: true, status: 200, json: async () => { throw new Error("kaputt"); } }), /^maler_antwort_kein_json$/],
    ["Maler sagt selbst nein", async () => alsAntwort({ ok: false, error: "modell_nicht_geladen" }), /^maler_sagt_nein:modell_nicht_geladen$/],
    ["Erfolg ohne Bilddaten", async () => alsAntwort({ ok: true, b64: "" }), /^maler_ohne_bilddaten$/],
    ["Bilddaten sind kein base64", async () => alsAntwort({ ok: true, b64: "!!!kein base64!!!" }), /^bilddaten_kaputt$/],
    ["Netz weg", async () => { throw new Error("ECONNREFUSED"); }, /^netzfehler:ECONNREFUSED$/]
  ];
  for (const [name, netz, erwartet] of faelle) {
    const notiz = {};
    const inhalt = await erzeugeFotoInhalt("fuchs", 5000, notiz, netz);
    assert.equal(inhalt, "", `${name}: darf keinen Inhalt liefern`);
    assert.match(notiz.grund || "", erwartet, name);
    assert.equal(typeof notiz.sekunden, "number", `${name}: Dauer fehlt`);
  }
});

test("die eigene Zeitgrenze heisst Zeitgrenze, nicht 'Netzfehler'", async () => {
  // Der haeufigste Fall — und der einzige, der wie ein Netzfehler AUSSIEHT:
  // abgebrochen wird durch den eigenen AbortController.
  const notiz = {};
  const inhalt = await erzeugeFotoInhalt("fuchs", 60, notiz, async (_url, opt) =>
    new Promise((_f, ab) => opt.signal.addEventListener("abort", () => ab(new Error("The operation was aborted")))));
  assert.equal(inhalt, "");
  assert.equal(notiz.grund, "zeitgrenze_0s_erreicht");
});

test("ein zu grosses Bild nennt seine Groesse — sonst raet man ewig", async () => {
  const notiz = {};
  const riesig = "A".repeat(4_000_001);
  await erzeugeFotoInhalt("fuchs", 5000, notiz, async () => alsAntwort({ ok: true, b64: riesig }));
  assert.equal(notiz.grund, "bild_zu_gross_4000001");
});

// --- Aufwaermen darf nicht als "kann ich nicht" beim Nutzer ankommen --------
//
// Befund 2026-08-14, zweimal live gemessen: Nach einem Neustart laedt der
// Maler sein Modell (Minuten). Solange meldet /health bereit:false, die
// SVG-Reserve scheiterte ebenfalls, und die Spur gab `false` zurueck — der
// Text-Weg uebernahm und smejj antwortete "Ich kann leider keine Bilder
// malen". Sachlich falsch: die Faehigkeit ist da, sie waermt nur auf.

test("waermt der Maler auf, sagt die Spur das ehrlich statt zu verneinen", async () => {
  const gesendet = [];
  const res = {
    writeHead: () => {}, setHeader: () => {},
    write: (s) => gesendet.push(String(s)), end: () => {}
  };
  const deps = {
    corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 500,
    // /health antwortet: laedt noch seit 42 s
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, bereit: false, ladezeitSek: 42 }) })
  };
  const ergebnis = await streamBilderLane(res, {}, "Male ein Bild von einem Fuchs", deps);
  const text = gesendet.join("");
  assert.equal(ergebnis, true, "die Spur muss selbst antworten, nicht an den Text-Weg abgeben");
  assert.match(text, /startet gerade/, "der Grund muss dastehen");
  assert.match(text, /42 s/, "die gemessene Ladezeit gehoert dazu");
  assert.doesNotMatch(text, /kann .{0,20}keine Bilder/i, "die Faehigkeit darf NIE verneint werden");
});

test("ohne eingerichteten Maler bleibt es beim stillen Rueckfall", async () => {
  // Fremder Standort oder Testumgebung: kein Byte senden, Text-Weg uebernimmt.
  let geschrieben = false;
  const res = { writeHead: () => { geschrieben = true; }, write: () => { geschrieben = true; }, end: () => { geschrieben = true; } };
  const deps = {
    corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 500,
    fetchImpl: async () => { throw new Error("nicht erreichbar"); }
  };
  assert.equal(await streamBilderLane(res, {}, "Male ein Bild von einem Fuchs", deps), false);
  assert.equal(geschrieben, false, "hier darf weiterhin kein Byte raus");
});

// --- Sprache des Bildsatzes (21.09.2026) --------------------------------
// Die zwei Saetze ueber dem Bild waren die letzte fest deutsche Stelle der App.
// Ein englischsprachiger Nutzer las ueber seinem Bild "Hier ist dein Bild:".
// Uebersetzen ging lange nicht, weil dieses Modul im SERVER laeuft: kein DOM,
// kein t(). Die Sprache reist jetzt mit der Anfrage.

test("Accept-Language entscheidet, wenn der Client nichts mitschickt", () => {
  assert.equal(spracheAusKopf("en-US,en;q=0.9,de;q=0.8"), "en");
  assert.equal(spracheAusKopf("de-DE,de;q=0.9"), "de");
  assert.equal(spracheAusKopf("pt-BR"), "pt");
  assert.equal(spracheAusKopf("zh-Hans-CN"), "zh");
  assert.equal(spracheAusKopf(""), "de", "ohne Kopf bleibt es bei der Quellsprache");
  assert.equal(spracheAusKopf("kl-GL"), "de", "unbekannte Sprache faellt auf Deutsch zurueck");
  assert.equal(spracheAusKopf(undefined), "de");
});

test("die Angabe des Clients schlaegt den Browser-Kopf", () => {
  // Wer die App auf Englisch gestellt hat, aber einen deutschen Browser nutzt,
  // soll Englisch lesen — nicht das, was der Browser zufaellig mitschickt.
  assert.equal(spracheAusAnfrage({ preferences: { sprache: "en" } }, "de-DE"), "en");
  assert.equal(spracheAusAnfrage({ preferences: { sprache: "EN" } }, "de-DE"), "en", "Grossschreibung darf nicht stoeren");
  assert.equal(spracheAusAnfrage({ preferences: { sprache: "klingonisch" } }, "en-US"), "en", "Unsinn faellt auf den Kopf zurueck");
  assert.equal(spracheAusAnfrage({}, "ja-JP"), "ja");
  assert.equal(spracheAusAnfrage(undefined, undefined), "de");
});

test("alle 15 Sprachen haben beide Texte, und keiner ist mehr deutsch", () => {
  const sprachen = Object.keys(BILD_TEXTE);
  assert.equal(sprachen.length, 15, "de plus die 14 Sprachen der Oberflaeche");
  for (const code of sprachen) {
    const [satz, alt] = BILD_TEXTE[code];
    assert.ok(satz && satz.length > 3, `${code}: Satz fehlt`);
    assert.ok(alt && alt.length > 3, `${code}: Alternativtext fehlt`);
    if (code !== "de") {
      assert.notEqual(satz, BILD_TEXTE.de[0], `${code} traegt noch den deutschen Satz`);
      assert.notEqual(alt, BILD_TEXTE.de[1], `${code} traegt noch den deutschen Alternativtext`);
    }
  }
});

test("die Antwort traegt Satz und Alternativtext der Sprache", () => {
  const en = bildAntwort("en", "image/png", "AAAA");
  assert.match(en, /^Here is your image:\n\n!\[Generated image\]\(data:image\/png;base64,AAAA\)$/);
  const de = bildAntwort("de", "image/svg+xml", "BBBB");
  assert.match(de, /^Hier ist dein Bild:\n\n!\[Erstelltes Bild\]\(data:image\/svg\+xml;base64,BBBB\)$/);
  assert.equal(bildAntwort("gibtsnicht", "image/png", "CC"), bildAntwort("de", "image/png", "CC"),
    "unbekannte Sprache darf nicht leer antworten, sondern faellt auf Deutsch");
});

test("BEIDE Wege sind uebersetzt — auch der SVG-Rueckfall", async () => {
  // Der Hinweis kam aus der Apple-Sitzung: Zeile 237 (SVG) und 331 (PNG)
  // trugen denselben Satz. Wer nur einen anfasst, laesst den haeufigeren
  // Fall deutsch. Deshalb prueft dieser Test die QUELLE, nicht nur die Helfer.
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("../public/chat-bridge-bilder.js", import.meta.url), "utf8");
  const reste = quelle.match(/`Hier ist dein Bild:/g) || [];
  assert.equal(reste.length, 0, "kein fest eingebauter deutscher Bildsatz mehr");
  // Nur die RUECKGABEN zaehlen — die Definition von bildAntwort passt sonst
  // auch auf das Muster und der Test zaehlt drei statt zwei.
  assert.equal((quelle.match(/return bildAntwort\(sprache,/g) || []).length, 2,
    "beide Rueckgaben — SVG und PNG — muessen ueber bildAntwort laufen");
});
