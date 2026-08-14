// smejj.com — Foto-Geduld der Bilder-Spur (Befund 2026-08-13).
//
// Seit der Bild-Maler sein 429 EHRLICH sofort schickt (Threadpool-Fix statt
// blockierter Event-Loop), muss die Bruecke warten koennen — sonst wuerde
// jedes "besetzt" sofort zur SVG-Reserve, obwohl der Maler eine Minute
// spaeter frei ist. Hier steht ein echter Mini-HTTP-Maler: zweimal 429,
// dann ein Foto — die Geduld muss das Foto liefern und den Stand melden.
//
// Der Maler-URL muss VOR dem Import gesetzt werden (das Modul liest die
// Umgebung beim Laden) — dieselbe Falle wie in chat-bridge-video-e2e.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

test("Foto-Geduld: 429 heisst warten, nicht SVG — und der Stand wird gemeldet", async () => {
  let anfragen = 0;
  const maler = createServer((req, res) => {
    anfragen += 1;
    if (anfragen <= 2) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, fehler: "beschaeftigt" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, format: "png", b64: PNG_B64 }));
  });
  await new Promise((weiter) => maler.listen(0, "127.0.0.1", weiter));
  process.env.SMEJJ_BILDER_WORKER_URL = `http://127.0.0.1:${maler.address().port}`;
  process.env.SMEJJ_BILDER_WARTE_TAKT_MS = "20"; // Test wartet Millisekunden, nicht Sekunden
  try {
    const { erzeugeFotoMitGeduld } = await import("../public/chat-bridge-bilder.js");
    const phasen = [];
    const inhalt = await erzeugeFotoMitGeduld("a red fox", 2000, (neu) => phasen.push(neu));
    assert.match(inhalt, /^Hier ist dein Bild:/, "nach dem Warten muss das Foto kommen");
    assert.ok(inhalt.includes(`data:image/png;base64,${PNG_B64}`), "das Foto muss das gemalte PNG sein");
    assert.equal(anfragen, 3, "genau zwei 429-Runden, dann der Erfolg");
    assert.ok(phasen.includes("wartet auf freien Platz"), "der Nutzer muss den Wartestand sehen");
    assert.equal(phasen[phasen.length - 1], "läuft", "nach dem Warten meldet die Spur wieder 'läuft'");
  } finally {
    maler.close();
  }
});

test("Foto-Geduld: nach Ablauf des Geduldsbudgets kommt '' (SVG-Reserve uebernimmt)", async () => {
  const maler = createServer((req, res) => {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, fehler: "beschaeftigt" }));
  });
  await new Promise((weiter) => maler.listen(0, "127.0.0.1", weiter));
  process.env.SMEJJ_BILDER_WORKER_URL = `http://127.0.0.1:${maler.address().port}`;
  process.env.SMEJJ_BILDER_WARTE_MAX_MS = "60";
  process.env.SMEJJ_BILDER_WARTE_TAKT_MS = "20";
  try {
    // Frischer Import je Testdatei reicht nicht — beide Tests teilen den
    // Prozess. Der Cache-Buster erzwingt ein zweites Modul mit neuer Umgebung.
    const { erzeugeFotoMitGeduld } = await import(`../public/chat-bridge-bilder.js?geduld=${Date.now()}`);
    const inhalt = await erzeugeFotoMitGeduld("a red fox", 2000, () => {});
    assert.equal(inhalt, "", "dauerbesetzt muss ehrlich leer enden, damit die SVG-Reserve zieht");
  } finally {
    maler.close();
  }
});
