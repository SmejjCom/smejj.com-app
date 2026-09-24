// smejj.com — Videos aus IDrive e2 (7-Tage-Link) im Chat (Betreiber 24.09.2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ersatzFuer, istE2Video, restlaufzeitMs } from "../public/chat-video-e2.js";

const LINK = "https://s3.us-west-2.idrivee2.com/smejj-app/medien-video/2026-09-24/0123456789abcdef0123456789abcdef.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AK%2F20260924%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260924T100000Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=abc123";
const START = Date.UTC(2026, 8, 24, 10, 0, 0);

test("nur genau die e2-Form gilt als Video — fremde Adressen bleiben Links", () => {
  assert.equal(istE2Video(LINK), true);
  for (const fremd of [
    "https://evil.example.com/v.mp4?a=1",
    LINK.replace("medien-video", "chat-medien"),
    LINK.replace("https://", "http://"),
    LINK.replace("0123456789abcdef0123456789abcdef", "../../etc"),
    `${LINK}"onerror=alert(1)`
  ]) assert.equal(istE2Video(fremd), false, fremd.slice(0, 60));
});

test("Ablaufzeit aus X-Amz-Date + X-Amz-Expires", () => {
  assert.equal(restlaufzeitMs(LINK, START), 604800 * 1000);
  assert.ok(restlaufzeitMs(LINK, START + 8 * 24 * 3600 * 1000) < 0);
  assert.ok(Number.isNaN(restlaufzeitMs("https://x.test/v.mp4")));
});

test("gueltig -> Player (erzaehlt mit Ton, sonst stumm in Schleife); abgelaufen/fremd -> Hinweis", () => {
  assert.deepEqual(ersatzFuer(LINK, "Erzähltes Video", START + 1000), { art: "video", src: LINK, loop: false, muted: false });
  assert.deepEqual(ersatzFuer(LINK, "Erstelltes Video", START + 1000), { art: "video", src: LINK, loop: true, muted: true });
  assert.equal(ersatzFuer(LINK, "", START + 8 * 24 * 3600 * 1000).art, "hinweis");
  assert.equal(ersatzFuer("https://x.test/v.mp4", "", START).art, "hinweis");
});

test("CSP erlaubt genau den e2-Host fuer Medien — sonst spielt der Browser nichts ab", () => {
  for (const datei of ["public/index.html", "public/assets/index.html"]) {
    const media = (readFileSync(datei, "utf8").match(/media-src[^;"]*/) || [""])[0];
    assert.match(media, /https:\/\/s3\.us-west-2\.idrivee2\.com(\s|$)/, datei);
    assert.doesNotMatch(media, /\*\.idrivee2|https:(\s|$)/, `${datei}: kein Platzhalter-Host`);
  }
});

test("der Renderer laedt das Modul nur bei Bedarf (Startgewicht) und prueft auch wiederhergestellte Verlaeufe", () => {
  const quelle = readFileSync("public/chat-markdown.js", "utf8");
  assert.doesNotMatch(quelle, /^import .*chat-video-e2/m, "kein statischer Import");
  assert.match(quelle, /import\("\.\/chat-video-e2\.js\?v=1"\)/);
  assert.match(quelle, /e2Videos\(document\)/);
});
