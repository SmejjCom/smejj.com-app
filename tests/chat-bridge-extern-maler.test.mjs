// smejj.com — Schutztests fuer den externen Bild-Maler (Weg 0, 2026-08-14).
//
// Der Weg kostet echtes Geld und laedt Daten von einer fremden Adresse. Beides
// muss hart abgesichert sein, und zwar OHNE Netz pruefbar: der Schluessel wird
// beim Laden des Moduls gelesen, das Netz haengt an der fetchImpl-Naht.
import assert from "node:assert/strict";
import test from "node:test";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

// Frisches Modul mit eigener Umgebung. Ohne Cache-Buster teilen sich alle
// Tests EIN Modul — und damit den Schluesselzustand des ersten Imports.
async function ladeModul(umgebung, nummer) {
  for (const [name, wert] of Object.entries(umgebung)) {
    if (wert === null) delete process.env[name];
    else process.env[name] = wert;
  }
  return import(`../public/chat-bridge-bilder-extern.js?extern=${nummer}`);
}

test("ohne Schluessel existiert der externe Weg nicht — kein Aufruf, kein Cent", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: null }, 1);
  let angefasst = false;
  const inhalt = await modul.erzeugeExternesBild("a red fox", {}, () => {
    angefasst = true;
    throw new Error("darf nie passieren");
  });
  assert.equal(inhalt, "", "ohne Schluessel muss der Weg leer zurueckkommen");
  assert.equal(angefasst, false, "ohne Schluessel darf das Netz nicht angefasst werden");
  assert.equal(modul.externerMalerBereit(), false);
});

test("istFalAdresse laesst nur fal-Adressen durch (SSRF-Schutz)", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: null }, 2);
  for (const gut of ["https://fal.run/x.jpg", "https://v3.fal.media/files/a/b.jpg", "https://fal.ai/y.png"]) {
    assert.equal(modul.istFalAdresse(gut), true, `sollte erlaubt sein: ${gut}`);
  }
  const boese = [
    "http://fal.run/x.jpg",                 // kein TLS
    "https://evil-fal.run/x.jpg",           // Bindestrich-Trick
    "https://fal.run.angreifer.com/x.jpg",  // Suffix-Trick
    "https://falrun.com/x.jpg",
    "https://169.254.169.254/latest/meta-data/", // Metadaten-Dienst
    "file:///etc/passwd",
    ""
  ];
  for (const schlecht of boese) {
    assert.equal(modul.istFalAdresse(schlecht), false, `muss abgewiesen werden: ${schlecht}`);
  }
});

test("bildFormatAusBytes glaubt nur den Magic Bytes", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: null }, 3);
  assert.equal(modul.bildFormatAusBytes(JPEG), "jpeg");
  assert.equal(modul.bildFormatAusBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13])), "png");
  assert.equal(modul.bildFormatAusBytes(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")])), "webp");
  // HTML-Fehlerseite unter der Bildadresse: sieht aus wie eine Antwort, ist keins.
  assert.equal(modul.bildFormatAusBytes(Buffer.from("<!doctype html><html>")), "");
  assert.equal(modul.bildFormatAusBytes(Buffer.from([1, 2])), "");
  assert.equal(modul.bildFormatAusBytes(null), "");
});

test("mit Schluessel liefert der externe Weg ein Bild als data:-URL", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: "test-schluessel" }, 4);
  assert.equal(modul.externerMalerBereit(), true);
  const gesehen = [];
  const fake = async (url, init) => {
    gesehen.push(String(url));
    if (String(url).startsWith("https://fal.run/")) {
      // Der Schluessel muss im Kopf stehen, sonst zahlt ein fremdes Konto.
      assert.match(init.headers.Authorization, /^Key test-schluessel$/);
      return { ok: true, status: 200, json: async () => ({ images: [{ url: "https://v3.fal.media/files/a/b.jpg" }] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) };
  };
  const notiz = {};
  const inhalt = await modul.erzeugeExternesBild("a red fox in the forest", notiz, fake);
  assert.match(inhalt, /^Hier ist dein Bild:/);
  assert.ok(inhalt.includes(`data:image/jpeg;base64,${JPEG.toString("base64")}`), "das gelieferte Bild muss durchgereicht werden");
  assert.equal(gesehen.length, 2, "genau ein Auftrag und ein Bild-Abruf");
  assert.equal(notiz.externGrund, undefined, "im Erfolgsfall gibt es keinen Fehlgrund");
});

test("eine fremde Bildadresse in der Antwort wird NICHT geladen", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: "test-schluessel" }, 5);
  const geladen = [];
  const fake = async (url) => {
    geladen.push(String(url));
    if (String(url).startsWith("https://fal.run/")) {
      return { ok: true, status: 200, json: async () => ({ images: [{ url: "https://angreifer.example/klau.jpg" }] }) };
    }
    throw new Error("diese Adresse haette nie geladen werden duerfen");
  };
  const notiz = {};
  assert.equal(await modul.erzeugeExternesBild("a red fox", notiz, fake), "");
  assert.equal(notiz.externGrund, "extern_fremde_bildadresse");
  assert.equal(geladen.length, 1, "nach der Ablehnung darf kein zweiter Abruf folgen");
});

test("kaputte Bilddaten unter einer echten fal-Adresse fallen durch", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: "test-schluessel" }, 6);
  const html = Buffer.from("<!doctype html><html>Fehler</html>");
  const fake = async (url) => (String(url).startsWith("https://fal.run/")
    ? { ok: true, status: 200, json: async () => ({ images: [{ url: "https://v3.fal.media/files/a/b.jpg" }] }) }
    : { ok: true, status: 200, arrayBuffer: async () => html.buffer.slice(html.byteOffset, html.byteOffset + html.length) });
  const notiz = {};
  assert.equal(await modul.erzeugeExternesBild("a red fox", notiz, fake), "");
  assert.equal(notiz.externGrund, "extern_keine_bilddaten");
});

test("der Tagesdeckel bremst, statt unbegrenzt Geld auszugeben", async () => {
  const modul = await ladeModul({ SMEJJ_BILDER_EXTERN_KEY: "test-schluessel", SMEJJ_BILDER_EXTERN_MAX_PRO_TAG: "2" }, 7);
  const fake = async (url) => (String(url).startsWith("https://fal.run/")
    ? { ok: true, status: 200, json: async () => ({ images: [{ url: "https://v3.fal.media/files/a/b.jpg" }] }) }
    : { ok: true, status: 200, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) });
  assert.match(await modul.erzeugeExternesBild("eins", {}, fake), /^Hier ist dein Bild:/);
  assert.match(await modul.erzeugeExternesBild("zwei", {}, fake), /^Hier ist dein Bild:/);
  const notiz = {};
  assert.equal(await modul.erzeugeExternesBild("drei", notiz, fake), "", "der dritte Auftrag muss am Deckel scheitern");
  assert.equal(notiz.externGrund, "tagesdeckel_2_erreicht");
});
