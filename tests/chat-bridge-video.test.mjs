import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { erkenneBildAuftrag, erkenneVideoAuftrag, sichereVideoAntwort } from "../public/chat-bridge-bilder.js";

describe("chat-bridge-video prompt detection", () => {
  it("erkennt Video-Erstellungs-Aufträge korrekt", () => {
    assert.equal(erkenneVideoAuftrag("Erstelle ein Video von einem fliegenden Adler"), "Erstelle ein Video von einem fliegenden Adler");
    assert.equal(erkenneVideoAuftrag("Kannst du mir ein video zeichnen."), "Kannst du mir ein video zeichnen.");
    assert.equal(erkenneVideoAuftrag("generiere ein kurzes Video über den Ozean"), "generiere ein kurzes Video über den Ozean");
    assert.equal(erkenneVideoAuftrag("make a video of a cat playing"), "make a video of a cat playing");
    assert.equal(erkenneVideoAuftrag("erzeuge einen Film"), "erzeuge einen Film");
  });

  it("unterscheidet Video-Aufträge von normalen Fragen und Bild-Aufträgen", () => {
    assert.equal(erkenneVideoAuftrag("Wie wird das Wetter heute?"), "");
    assert.equal(erkenneVideoAuftrag("Zeichne ein Bild von einem Hund"), "");
    assert.equal(erkenneBildAuftrag("Zeichne ein Bild von einem Hund"), "Zeichne ein Bild von einem Hund");
    assert.equal(erkenneVideoAuftrag("Erstelle ein Video von"), "Erstelle ein Video von");
    assert.equal(erkenneBildAuftrag("Zeichene eine Bild von Paris Hilton."), "Zeichene eine Bild von Paris Hilton.");
  });
});

describe("chat-bridge-video Antwort-Absicherung (sichereVideoAntwort)", () => {
  it("nimmt nur gueltige base64-MP4/WebM-Antworten an", () => {
    assert.equal(sichereVideoAntwort({ ok: true, format: "mp4", b64: "AAAA" }), "data:video/mp4;base64,AAAA");
    assert.equal(sichereVideoAntwort({ ok: true, format: "webm", b64: "QUJD" }), "data:video/webm;base64,QUJD");
  });

  it("lehnt alles Unbrauchbare ab (fail-closed)", () => {
    assert.equal(sichereVideoAntwort(null), "");
    assert.equal(sichereVideoAntwort({ ok: false, format: "mp4", b64: "AAAA" }), "");
    assert.equal(sichereVideoAntwort({ ok: true, format: "mp4", b64: "" }), "");
    // Fremdformate und URL-Schmuggel: nie durchreichen.
    assert.equal(sichereVideoAntwort({ ok: true, format: "avi", b64: "AAAA" }), "");
    assert.equal(sichereVideoAntwort({ ok: true, format: "mp4", b64: "AA);![x](https://boese.example" }), "");
    // Groessendeckel: mehr als 8 MB base64 wird nicht durchgereicht.
    assert.equal(sichereVideoAntwort({ ok: true, format: "mp4", b64: "A".repeat(8_000_001) }), "");
  });

  it("liefert nie eine http(s)-Adresse aus der Worker-Antwort weiter", () => {
    assert.equal(sichereVideoAntwort({ ok: true, video_url: "https://boese.example/x.mp4" }), "");
  });
});
