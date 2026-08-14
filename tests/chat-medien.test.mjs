// smejj.com — Tests fuer die Medien-Auslagerung des Chat-Verlaufs.
//
// Der Anlass ist gemessen, nicht vermutet (2026-08-14): Im Konto lagen vier
// Video-Eintraege, deren gespeichertes html-Feld unter 1 KB gross war — nur ein
// toter `blob:`-Zeiger, die Videodaten waren nie gespeichert worden. Und jeder
// Chat mit einem erzeugten Bild (~585 KB als data:-URL) lag ueber dem
// Server-Deckel von 512 KB und wurde KOMPLETT abgewiesen, ohne dass der Nutzer
// etwas merkte. Groesstes html-Feld ueber alle 125 gespeicherten Nachrichten: 7 KB.
//
// Die Zusagen, die diese Tests halten:
//   1. Nur erlaubte Medientypen und Groessen kommen in die Ablage.
//   2. Die Kennung ist der Inhalts-Hash — gleiches Medium, gleicher Platz.
//   3. Der Klient findet Bilder UND Videos (auch nach der blob-Umwandlung).
//   4. Scheitert die Ablage, bleibt alles unveraendert — nie schlechter.

import test from "node:test";
import assert from "node:assert/strict";
import {
  ERLAUBTE_TYPEN, MAX_MEDIUM_BYTES, kennungGueltig, leseDataUrl, medienKennung
} from "../control-server/src/chats/medienStore.js";
import {
  VIDEO_QUELLE_ATTRIBUT, adresseFuer, findeAuslagerbare, lagereMedienAus
} from "../public/chat-medien.js";

const png = (inhalt = "hallo") => `data:image/png;base64,${Buffer.from(inhalt).toString("base64")}`;
const mp4 = (inhalt = "film") => `data:video/mp4;base64,${Buffer.from(inhalt).toString("base64")}`;

// --- Server: was darf ueberhaupt in die Ablage? -----------------------------

test("erlaubte Typen werden gelesen, alles andere abgewiesen", () => {
  const gut = leseDataUrl(png());
  assert.equal(gut.ok, true);
  assert.equal(gut.mime, "image/png");
  assert.equal(gut.endung, "png");
  assert.equal(gut.daten.toString(), "hallo");

  assert.equal(leseDataUrl(mp4()).endung, "mp4");
  assert.deepEqual(Object.keys(ERLAUBTE_TYPEN).sort(),
    ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
});

test("fail-closed: alles Unbekannte oder Kaputte kommt nicht in die Ablage", () => {
  const faelle = [
    ["", "kein_data_url"],
    ["https://example.com/bild.png", "kein_data_url"],
    ["data:text/html;base64,PHNjcmlwdD4=", "typ_nicht_erlaubt"],
    ["data:image/svg+xml;base64,PHN2Zz4=", "typ_nicht_erlaubt"],
    ["data:image/png;base64,", "kein_data_url"],
    ["data:image/png;base64,!!!nicht-base64!!!", "kein_data_url"]
  ];
  for (const [eingabe, grund] of faelle) {
    const r = leseDataUrl(eingabe);
    assert.equal(r.ok, false, `haette abgewiesen werden muessen: ${eingabe.slice(0, 30)}`);
    assert.equal(r.error, grund, eingabe.slice(0, 30));
  }
});

test("SVG bleibt verboten — es kann Skripte tragen", () => {
  // Der Chat-Renderer erlaubt SVG als BILD; in der Ablage waere es eine Datei,
  // die der Browser spaeter unter eigener Adresse oeffnet. Das ist ein Unterschied.
  assert.equal(ERLAUBTE_TYPEN["image/svg+xml"], undefined);
});

test("die Groessengrenze greift", () => {
  const zuGross = `data:image/png;base64,${Buffer.alloc(MAX_MEDIUM_BYTES + 1).toString("base64")}`;
  assert.equal(leseDataUrl(zuGross).error, "zu_gross");
  const geradeNoch = `data:image/png;base64,${Buffer.alloc(1024).toString("base64")}`;
  assert.equal(leseDataUrl(geradeNoch).ok, true);
});

test("die Kennung ist der Inhalts-Hash — gleiches Medium, gleicher Platz", () => {
  const a = medienKennung(Buffer.from("gleicher inhalt"), "png");
  const b = medienKennung(Buffer.from("gleicher inhalt"), "png");
  const c = medienKennung(Buffer.from("anderer inhalt"), "png");
  assert.equal(a, b, "derselbe Inhalt muss dieselbe Kennung ergeben (Dedup)");
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{40}\.png$/);
});

test("nur wohlgeformte Kennungen bauen einen Schluessel", () => {
  assert.equal(kennungGueltig(medienKennung(Buffer.from("x"), "mp4")), true);
  for (const boese of ["../../fremd/geheim.png", "a".repeat(40) + ".exe", "kurz.png", "", null,
                       "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.png"]) {
    assert.equal(kennungGueltig(boese), false, `haette abgewiesen werden muessen: ${boese}`);
  }
});

// --- Klient: findet er die Medien? -----------------------------------------

function knoten(html) {
  // Minimales DOM: nur was chat-medien.js wirklich benutzt.
  const elemente = [];
  const bauen = (tag, attribute) => {
    const el = {
      tagName: tag.toUpperCase(), attribute: { ...attribute },
      getAttribute: (n) => (Object.hasOwn(el.attribute, n) ? el.attribute[n] : null),
      setAttribute: (n, w) => { el.attribute[n] = String(w); },
      removeAttribute: (n) => { delete el.attribute[n]; }
    };
    elemente.push(el);
    return el;
  };
  for (const teil of html) bauen(teil.tag, teil.attribute);
  return {
    elemente,
    querySelectorAll: (wahl) => {
      if (wahl === 'img[src^="data:image/"]') {
        return elemente.filter((e) => e.tagName === "IMG" && String(e.getAttribute("src") || "").startsWith("data:image/"));
      }
      if (wahl === "video") return elemente.filter((e) => e.tagName === "VIDEO");
      return [];
    }
  };
}

test("Bilder und Videos werden gefunden — auch NACH der blob-Umwandlung", () => {
  const k = knoten([
    { tag: "img", attribute: { src: png("bild") } },
    // Video vor der Umwandlung: Daten stehen noch im src
    { tag: "video", attribute: { src: mp4("frisch") } },
    // Video nach der Umwandlung: src ist blob:, Daten stehen im Rettungsattribut
    { tag: "video", attribute: { src: "blob:https://smejj.com/abc", [VIDEO_QUELLE_ATTRIBUT]: mp4("gerettet") } }
  ]);
  const gefunden = findeAuslagerbare(k);
  assert.equal(gefunden.length, 3, "genau diese drei sind auslagerbar");
  assert.equal(gefunden[0].attribut, "src");
  assert.equal(gefunden[2].attribut, VIDEO_QUELLE_ATTRIBUT,
    "das umgewandelte Video muss ueber das Rettungsattribut gefunden werden");
});

test("was schon ausgelagert ist, wird nicht erneut hochgeladen", () => {
  const k = knoten([
    { tag: "img", attribute: { src: "https://x.example/api/chat-medien?id=abc.png" } },
    { tag: "video", attribute: { src: "https://x.example/api/chat-medien?id=def.mp4" } }
  ]);
  assert.deepEqual(findeAuslagerbare(k), []);
});

test("nach dem Auslagern steht im DOM nur noch die kurze Adresse", async () => {
  const k = knoten([
    { tag: "img", attribute: { src: png("bild") } },
    { tag: "video", attribute: { src: "blob:https://smejj.com/abc", [VIDEO_QUELLE_ATTRIBUT]: mp4("film") } }
  ]);
  const hochgeladen = [];
  const ergebnis = await lagereMedienAus(k, {
    basis: "https://x.example/api/chat-medien",
    hochladen: async (_basis, dataUrl) => { hochgeladen.push(dataUrl.slice(0, 20)); return "abc123.png"; }
  });
  assert.deepEqual(ergebnis, { ausgelagert: 2, gescheitert: 0 });
  assert.equal(hochgeladen.length, 2);

  const [bild, video] = k.elemente;
  assert.equal(bild.getAttribute("src"), "https://x.example/api/chat-medien?id=abc123.png");
  assert.equal(video.getAttribute("src"), "https://x.example/api/chat-medien?id=abc123.png");
  assert.equal(video.getAttribute(VIDEO_QUELLE_ATTRIBUT), null,
    "das Rettungsattribut muss weg sein — sonst waere der Datenberg wieder im html");
});

test("scheitert die Ablage, bleibt ALLES unveraendert", async () => {
  const original = png("bild");
  const k = knoten([{ tag: "img", attribute: { src: original } }]);
  const ergebnis = await lagereMedienAus(k, {
    basis: "https://x.example/api/chat-medien",
    hochladen: async () => ""   // Netz weg, Sync aus, zu gross — alles derselbe Fall
  });
  assert.deepEqual(ergebnis, { ausgelagert: 0, gescheitert: 1 });
  assert.equal(k.elemente[0].getAttribute("src"), original,
    "ohne Kennung darf die Quelle NICHT angefasst werden");
});

test("ohne Adresse oder ohne Medien passiert nichts", async () => {
  const leer = knoten([]);
  assert.deepEqual(await lagereMedienAus(leer, { basis: "https://x.example/api/chat-medien" }),
    { ausgelagert: 0, gescheitert: 0 });
  const k = knoten([{ tag: "img", attribute: { src: png() } }]);
  assert.deepEqual(await lagereMedienAus(k, { basis: "" }), { ausgelagert: 0, gescheitert: 0 });
});

test("adresseFuer kodiert die Kennung", () => {
  assert.equal(adresseFuer("https://x.example/api/chat-medien", "ab.png"),
    "https://x.example/api/chat-medien?id=ab.png");
});

// --- Verdrahtung ------------------------------------------------------------

test("der Store lagert VOR dem Schnappschuss aus", async () => {
  const quelle = await import("node:fs").then((fs) => fs.readFileSync("public/chat-store.js", "utf8"));
  const i = quelle.indexOf("async function persistActive()");
  const rumpf = quelle.slice(i, i + 200);
  assert.match(rumpf, /await medienAuslagern\(\);[\s\S]*const messages = readEntries\(\);/,
    "readEntries() speichert innerHTML — danach auszulagern waere wirkungslos");
});

test("der Renderer rettet die Videodaten vor der blob-Umwandlung", async () => {
  const quelle = await import("node:fs").then((fs) => fs.readFileSync("public/chat-markdown.js", "utf8"));
  const i = quelle.indexOf('const daten = video.getAttribute("src")');
  const rumpf = quelle.slice(i, i + 900);
  assert.match(rumpf, /setAttribute\("data-smejj-quelle", daten\)[\s\S]*removeAttribute\("src"\)/,
    "erst retten, dann entfernen — sonst sind die Daten weg");
});
