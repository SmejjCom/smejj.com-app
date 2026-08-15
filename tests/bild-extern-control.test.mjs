// smejj.com — Schutztests fuer die Bild-Route des Control (CogView, 2026-08-14).
//
// Diese Route gibt Guthaben aus und laedt Daten von einer fremden Adresse.
// Beides muss ohne Netz pruefbar sein: der Schluessel kommt aus `env`, das Netz
// haengt an der fetchImpl-Naht.
import assert from "node:assert/strict";
import test from "node:test";

import { createBildExternRoutes, formatAusBytes, istAnbieterAdresse } from "../control-server/src/routes/bildExternRoutes.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const alsAntwort = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);

function baue({ env = {}, fetchImpl, angemeldet = true } = {}) {
  return createBildExternRoutes({
    env: { SMEJJ_LLM_ZHIPU_API_KEY: "test-schluessel", ...env },
    readSession: () => (angemeldet ? { id: "u1" } : null),
    sessionStillValid: async () => angemeldet,
    json: () => {},
    readJson: async () => ({ prompt: "a red fox" }),
    fetchImpl
  });
}

test("istAnbieterAdresse laesst nur Zhipu-Adressen durch (SSRF-Schutz)", () => {
  for (const gut of ["https://mfile.z.ai/a.png", "https://open.bigmodel.cn/x.jpg", "https://z.ai/y.png"]) {
    assert.equal(istAnbieterAdresse(gut), true, `sollte erlaubt sein: ${gut}`);
  }
  const boese = [
    "http://mfile.z.ai/a.png",              // kein TLS
    "https://evil-z.ai/a.png",              // Bindestrich-Trick
    "https://z.ai.angreifer.com/a.png",     // Suffix-Trick
    "https://bigmodel.cn.evil.com/a.png",
    "https://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
    ""
  ];
  for (const schlecht of boese) {
    assert.equal(istAnbieterAdresse(schlecht), false, `muss abgewiesen werden: ${schlecht}`);
  }
});

test("formatAusBytes glaubt den Magic Bytes, nicht dem Etikett", () => {
  // GEMESSEN 2026-08-14: der Anbieter liefert .png + Content-Type image/png,
  // darin liegt ein JPEG. Genau dafuer ist diese Pruefung da.
  assert.equal(formatAusBytes(JPEG), "jpeg");
  assert.equal(formatAusBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13])), "png");
  assert.equal(formatAusBytes(Buffer.from("<!doctype html><html>")), "");
  assert.equal(formatAusBytes(null), "");
});

test("ohne Schluessel wird das Netz nicht angefasst", async () => {
  let angefasst = false;
  const routen = baue({
    env: { SMEJJ_LLM_ZHIPU_API_KEY: "" },
    fetchImpl: () => { angefasst = true; throw new Error("darf nie passieren"); }
  });
  const ergebnis = await routen.male("a red fox");
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.fehler, "extern_nicht_eingerichtet");
  assert.equal(angefasst, false);
  assert.equal(routen.eingerichtet(), false);
});

test("Erfolgsweg: Auftrag, Bild-Abruf, base64 zurueck", async () => {
  const gesehen = [];
  const routen = baue({
    fetchImpl: async (url, init) => {
      gesehen.push(String(url));
      if (String(url).includes("/images/generations")) {
        assert.match(init.headers.Authorization, /^Bearer test-schluessel$/);
        return { ok: true, status: 200, json: async () => ({ data: [{ url: "https://mfile.z.ai/a.png" }] }) };
      }
      return { ok: true, status: 200, arrayBuffer: async () => alsAntwort(JPEG) };
    }
  });
  const ergebnis = await routen.male("a red fox in a misty forest");
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.format, "jpeg", "das JPEG darf nicht als png durchgereicht werden");
  assert.equal(ergebnis.b64, JPEG.toString("base64"));
  assert.equal(gesehen.length, 2);
});

test("fremde Bildadresse in der Antwort wird NICHT geladen", async () => {
  const geladen = [];
  const routen = baue({
    fetchImpl: async (url) => {
      geladen.push(String(url));
      if (String(url).includes("/images/generations")) {
        return { ok: true, status: 200, json: async () => ({ data: [{ url: "https://angreifer.example/klau.jpg" }] }) };
      }
      throw new Error("diese Adresse haette nie geladen werden duerfen");
    }
  });
  const ergebnis = await routen.male("a red fox");
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.fehler, "extern_fremde_bildadresse");
  assert.equal(geladen.length, 1);
});

test("HTML statt Bild faellt durch", async () => {
  const html = Buffer.from("<!doctype html><html>Fehler</html>");
  const routen = baue({
    fetchImpl: async (url) => (String(url).includes("/images/generations")
      ? { ok: true, status: 200, json: async () => ({ data: [{ url: "https://mfile.z.ai/a.png" }] }) }
      : { ok: true, status: 200, arrayBuffer: async () => alsAntwort(html) })
  });
  assert.equal((await routen.male("a red fox")).fehler, "extern_keine_bilddaten");
});

test("Tagesdeckel bremst, statt unbegrenzt Guthaben auszugeben", async () => {
  const routen = baue({
    env: { SMEJJ_BILD_EXTERN_MAX_PRO_TAG: "2" },
    fetchImpl: async (url) => (String(url).includes("/images/generations")
      ? { ok: true, status: 200, json: async () => ({ data: [{ url: "https://mfile.z.ai/a.png" }] }) }
      : { ok: true, status: 200, arrayBuffer: async () => alsAntwort(JPEG) })
  });
  assert.equal((await routen.male("eins")).ok, true);
  assert.equal((await routen.male("zwei")).ok, true);
  const dritter = await routen.male("drei");
  assert.equal(dritter.ok, false);
  assert.equal(dritter.fehler, "tagesdeckel_2_erreicht");
});

test("ohne gueltige Anmeldung antwortet die Route 401 und malt nicht", async () => {
  let gemalt = false;
  const routen = baue({
    angemeldet: false,
    fetchImpl: () => { gemalt = true; throw new Error("darf nie passieren"); }
  });
  let status = 0;
  const routenMitJson = createBildExternRoutes({
    env: { SMEJJ_LLM_ZHIPU_API_KEY: "test-schluessel" },
    readSession: () => null,
    sessionStillValid: async () => false,
    json: (res, code) => { status = code; },
    readJson: async () => ({ prompt: "a red fox" }),
    fetchImpl: routen.male
  });
  const behandelt = await routenMitJson.handle({ method: "POST" }, {}, { pathname: "/api/bild/erzeuge" });
  assert.equal(behandelt, true, "die Route ist zustaendig und antwortet selbst");
  assert.equal(status, 401);
  assert.equal(gemalt, false, "ohne Anmeldung darf kein Guthaben verbraucht werden");
});

test("fremde Pfade laesst die Route unberuehrt", async () => {
  const routen = baue({ fetchImpl: async () => { throw new Error("nicht zustaendig"); } });
  assert.equal(await routen.handle({ method: "POST" }, {}, { pathname: "/api/chat" }), false);
  assert.equal(await routen.handle({ method: "GET" }, {}, { pathname: "/api/bild/erzeuge" }), false);
});
