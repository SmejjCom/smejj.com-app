import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

describe("smejj video worker & video player markdown integration", () => {
  it("überprüft das Vorhandensein der Video-Worker-Dateien", () => {
    assert.ok(fs.existsSync("workers/smejj-video-worker/server.py"), "server.py fehlt");
    assert.ok(fs.existsSync("workers/smejj-video-worker/requirements.txt"), "requirements.txt fehlt");
    assert.ok(fs.existsSync("Dockerfile.smejj-video-worker"), "Dockerfile.smejj-video-worker fehlt");
  });

  it("der Worker ist gueltiges Python und keine Attrappe", () => {
    execFileSync("python3", ["-m", "py_compile", "workers/smejj-video-worker/server.py"]);
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    // Echte Synthese: Frames kodieren statt eine Demo-URL zurueckzugeben.
    assert.ok(server.includes("kodiere_mp4"), "MP4-Kodierung fehlt");
    assert.ok(server.includes("kenburns_frames"), "kenburns-Engine fehlt");
    assert.ok(!server.includes("demo-video-sample"), "Attrappen-Demo-URL darf nicht zurueckkehren");
    // Antwortform, die die Bruecke (sichereVideoAntwort) versteht.
    assert.ok(server.includes('"b64"') && server.includes('"format"'), "b64/format-Antwort fehlt");
  });

  it("die parallax-Engine ist die Voreinstellung und faellt sicher zurueck", () => {
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    assert.ok(server.includes('"SMEJJ_VIDEO_ENGINE", "parallax"'), "parallax muss Voreinstellung sein");
    assert.ok(server.includes("schaetze_tiefe") && server.includes("parallax_frames"), "Parallax-Bausteine fehlen");
    // Ohne Tiefenmodell muss trotzdem ein Video herauskommen (kenburns).
    assert.ok(server.includes("if tiefe is None:"), "Rueckfall auf kenburns fehlt");
    // Der Dienst darf nicht haengen bleiben, wenn der Modell-Download scheitert.
    assert.ok(/finally:\s*\n\s*zustand\["bereit"\] = True/.test(server), "bereit muss auch nach Ladefehler kommen");
    // Teil-Download darf nie als fertiges Modell gelten.
    assert.ok(server.includes("os.replace"), "atomares Umbenennen des Modells fehlt");
  });

  it("vertont Videos mit der vorhandenen Piper-Stimme, fail-safe", () => {
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    assert.ok(server.includes("/synthesize"), "Piper-Endpunkt fehlt");
    assert.ok(server.includes("hole_erzaehlstimme") && server.includes("mische_ton"), "Vertonung fehlt");
    // Die Videolaenge muss sich nach der Sprechdauer richten, sonst bricht
    // die Erzaehlung mittendrin ab (-shortest schneidet auf das Kuerzere).
    assert.ok(server.includes("MAX_DAUER_S, stimme[1]"), "Laengenanpassung an die Stimme fehlt");
    // Fehlender Ton darf nie das ganze Video kosten.
    assert.ok(server.includes("return mp4_bytes"), "Rueckfall auf stummes Video fehlt");
    // Nur echten Ton behaupten.
    assert.ok(server.includes('"ton": bool(stimme)'), "ehrliches ton-Feld fehlt");
  });

  it("faengt die Piper-Fallen ECHT ab (Verhalten, nicht Textmuster)", () => {
    // Prueft den laufenden Worker-Code gegen HTML-Demo-Seite trotz Status 200,
    // stille WAVs, zu lange Stimmen und kaputte RIFF-Ruempfe. Laeuft mit dem
    // System-python3 (requests/fastapi werden gestubbt) — schlaegt der Aufruf
    // fehl, ist das ein Befund und kein Grund zum Ueberspringen.
    const ausgabe = execFileSync("python3", ["scripts/testing/pruefe_video_stimme.py"], { encoding: "utf8" });
    assert.match(ausgabe, /Alle \d+ Pruefungen gruen/, ausgabe);
  });

  it("die externe Engine (Weg C) ist fail-closed und SSRF-fest", () => {
    // Kein Schluessel = kein Aufruf = kein Cent; Tagesdeckel; fremde
    // video_url wird nie geladen. Verhalten, nicht Textmuster.
    const ausgabe = execFileSync("python3", ["scripts/testing/pruefe_video_extern.py"], { encoding: "utf8" });
    assert.ok(!/FEHLER/.test(ausgabe), ausgabe);
  });

  it("der Player laesst erzaehlte Videos hoerbar und einmalig laufen", () => {
    const markdown = fs.readFileSync("public/chat-markdown.js", "utf8");
    // muted/loop nur fuer stumme Szenen — sonst hoert der Nutzer nichts bzw.
    // die Erzaehlung wiederholt sich endlos.
    assert.ok(markdown.includes('startsWith("Erzähltes")'), "Ton-Erkennung im Player fehlt");
    assert.ok(!/controls loop muted/.test(markdown), "loop/muted duerfen nicht mehr fest verdrahtet sein");
  });

  it("die Szene bewegt sich selbst — und nur, was belegt ist", () => {
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    // Himmel-Zug ist gemessen (Himmelzone 1,21 -> 2,01) und bleibt.
    assert.ok(server.includes("himmel_bereich"), "Himmel-Erkennung fehlt");
    assert.ok(server.includes("HIMMEL_ZUG"), "Himmel-Zug fehlt");
    // Die Wasser-Kraeuselung war gebaut und wurde entfernt: bei 3,5/8/14 px
    // Ausschlag exakt die Werte des ausgeschalteten Zustands. Sie darf nicht
    // unbemerkt zurueckkehren — unbelegte Wirkung ist eine Attrappe.
    assert.ok(!/WASSER_HUB|wasser_maske/.test(server), "unbelegte Wasser-Bewegung ist zurueck");
    assert.ok(server.includes("BEWUSST NICHT GEBAUT"), "die Entscheidung muss im Code stehen");
  });

  it("das Tiefenmodell kommt als ONNX, nicht als torch (Abbildgroesse)", () => {
    const anforderungen = fs.readFileSync("workers/smejj-video-worker/requirements.txt", "utf8");
    assert.ok(anforderungen.includes("onnxruntime"), "onnxruntime fehlt");
    assert.ok(!/^torch/m.test(anforderungen), "torch gehoert NUR ins GPU-Abbild (800 MB)");
  });

  it("das Dockerfile bindet IPv4 (Zeaburs internes Netz, Lehre Bild-Maler)", () => {
    const dockerfile = fs.readFileSync("Dockerfile.smejj-video-worker", "utf8");
    const cmd = dockerfile.split("\n").find((zeile) => zeile.startsWith("CMD")) || "";
    assert.ok(cmd.includes('"0.0.0.0"'), "uvicorn muss auf 0.0.0.0 binden");
    assert.ok(!cmd.includes('"::"'), '"::" waere IPv6-only — Connection refused im Zeabur-Netz');
  });

  it("verifiziert den Inhalt von chat-markdown.js für Video-Parsing", () => {
    const content = fs.readFileSync("public/chat-markdown.js", "utf8");
    assert.ok(content.includes("MD_VIDEO"), "MD_VIDEO fehlt in chat-markdown.js");
    assert.ok(content.includes("<video class=\"chat-video\""), "video element tag fehlt in chat-markdown.js");
    assert.ok(content.includes("playsinline"), "playsinline fehlt (iOS spielt sonst im Vollbild)");
    // Nur data:video aus der eigenen Bruecke — fremde URLs waeren ein Tracking-Kanal.
    const videoZeile = content.split("\n").find((zeile) => zeile.startsWith("const MD_VIDEO"));
    assert.ok(videoZeile && videoZeile.includes("data:video"), "MD_VIDEO muss data:video verlangen");
    assert.ok(videoZeile && !videoZeile.includes("https?"), "MD_VIDEO darf keine fremden http(s)-Quellen erlauben");
  });

  it("die Video-CSS-Klasse ist im Chat-Stylesheet verankert", () => {
    const css = fs.readFileSync("public/chat-markdown.css", "utf8");
    assert.ok(css.includes(".chat-video"), ".chat-video fehlt in chat-markdown.css");
  });
});

describe("Portraet-Qualitaet (Befund Betreiber 2026-08-13)", () => {
  it("warpt weich statt in Tiefenscheiben zu zerschneiden", () => {
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    // Das Ebenen-Verfahren zerriss Gesichter (gemessen +0,32 Kantenenergie,
    // live vom Betreiber als "sehr schlecht" gemeldet). Es darf nicht
    // unbemerkt zurueckkehren.
    assert.ok(!server.includes("PARALLAX_EBENEN"), "Ebenen-Verfahren ist zurueck");
    assert.ok(server.includes("bilinear") || server.includes("Warping"), "Weich-Warping fehlt");
    assert.ok(server.includes("GaussianBlur(5)"), "Tiefenkarten-Glaettung fehlt (Riss-Kanten)");
  });

  it("kodiert mit CRF 23 (drei Stufen schaerfer als vorher)", () => {
    const server = fs.readFileSync("workers/smejj-video-worker/server.py", "utf8");
    assert.ok(server.includes('"SMEJJ_VIDEO_CRF", "23"'), "CRF-Vorgabe 23 fehlt");
    assert.ok(server.includes('str(CRF)'), "CRF wird nicht verwendet");
  });
});
