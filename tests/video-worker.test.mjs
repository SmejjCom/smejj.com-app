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
