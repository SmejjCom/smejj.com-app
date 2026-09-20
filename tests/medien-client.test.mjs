// smejj.com — Medien-System im Browser (Betreiber-Auftrag 2026-09-17).
//
// Was diese Tests halten:
//   - Die Anzeige nimmt kurzlebige Anzeige-Adressen und faellt sonst sauber auf
//     den alten fetch-Weg zurueck.
//   - Gespeichertes HTML traegt immer die ECHTE Adresse; eine abgelaufene
//     Anzeige-Adresse oder ein toter blob: wird beim Laden geparkt.
//   - Ein laufendes Video wird beim Speichern nicht mehr umgeschaltet.
//   - Interne Adressen verlassen den Chat nie als Text (Teilen, Kopieren, Export).
//   - Upload geht roh (nicht mehr an der 1-MB-JSON-Grenze vorbei).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADRESSE_ATTRIBUT, FEHLENDES_BILD, LEERES_BILD, blobAusDataUrl, entwaessere, istAnzeigeAdresse,
  kennungAus, parkeMedienAdressen, rehydriereMedien
} from "../public/chat-medien.js";
import { ohneMedienAdressen, toPlainText } from "../public/chat-actions-menu.js";

const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8");
const ID = `${"d6".repeat(20)}.png`;
const VID = `${"a1".repeat(20)}.mp4`;
const ADRESSE = `https://api.smejj.com/api/chat-medien?id=${ID}`;
const VADRESSE = `https://api.smejj.com/api/chat-medien?id=${VID}`;
const ANZEIGE = `https://api.smejj.com/medium/${"T".repeat(120)}`;

function element(tag, attribute = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    attribute: { ...attribute },
    getAttribute: (n) => (Object.hasOwn(el.attribute, n) ? el.attribute[n] : null),
    setAttribute: (n, w) => { el.attribute[n] = String(w); },
    removeAttribute: (n) => { delete el.attribute[n]; },
    addEventListener: () => {}
  };
  return el;
}

function wurzel(elemente) {
  return {
    querySelectorAll: (wahl) => {
      if (wahl === "img, video") return elemente;
      if (wahl === `[${ADRESSE_ATTRIBUT}]`) return elemente.filter((e) => e.getAttribute(ADRESSE_ATTRIBUT) !== null);
      return [];
    }
  };
}

test("Anzeige-Adressen und Kennungen werden erkannt", () => {
  assert.equal(istAnzeigeAdresse(ANZEIGE), true);
  assert.equal(istAnzeigeAdresse(ADRESSE), false);
  assert.equal(istAnzeigeAdresse("https://api.smejj.com/medium/kurz"), false);
  assert.equal(kennungAus(ADRESSE), ID);
  assert.equal(kennungAus("https://api.smejj.com/api/chat-medien?id=../../x"), "");
});

test("Anzeige laeuft ueber gebuendelte Anzeige-Adressen: Bilder klein, Videos original", async () => {
  const bild = element("img", { [ADRESSE_ATTRIBUT]: ADRESSE, src: LEERES_BILD });
  const video = element("video", { [ADRESSE_ATTRIBUT]: VADRESSE });
  const aufrufe = [];
  const adressenHolen = async (ids, { vorschau }) => {
    aufrufe.push({ ids, vorschau });
    return Object.fromEntries(ids.map((id) => [id, { url: `${ANZEIGE}${vorschau ? "v" : "o"}`, bis: Date.now() + 3600_000 }]));
  };
  let altWeg = 0;
  const ergebnis = await rehydriereMedien(wurzel([bild, video]), { adressenHolen, holen: async () => { altWeg += 1; return null; } });
  assert.deepEqual(ergebnis, { geholt: 2, gescheitert: 0 });
  assert.deepEqual(aufrufe, [{ ids: [ID], vorschau: true }, { ids: [VID], vorschau: false }]);
  assert.equal(bild.getAttribute("src"), `${ANZEIGE}v`);
  assert.equal(bild.getAttribute("loading"), "lazy");
  assert.equal(video.getAttribute("src"), `${ANZEIGE}o`);
  assert.equal(bild.getAttribute(ADRESSE_ATTRIBUT), ADRESSE, "die echte Adresse bleibt am Element");
  assert.equal(altWeg, 0);

  // Speichern: die Anzeige-Adresse bleibt stehen — ein laufendes Video springt nicht zurueck.
  assert.equal(entwaessere(wurzel([bild, video])), 0);
  assert.equal(video.getAttribute("src"), `${ANZEIGE}o`);
  assert.equal(video.getAttribute(ADRESSE_ATTRIBUT), VADRESSE);

  // Zweiter Durchlauf ohne Netz: nichts wird neu geholt.
  aufrufe.length = 0;
  await rehydriereMedien(wurzel([bild, video]), { adressenHolen, holen: async () => null });
  assert.equal(aufrufe.length, 0);
});

test("ohne Anzeige-Adressen (alter Server) greift der alte fetch-Weg; ohne alles ein sichtbarer Ersatz", async () => {
  const gut = element("img", { src: ADRESSE });
  const weg = element("img", { src: `https://api.smejj.com/api/chat-medien?id=${"ff".repeat(20)}.png` });
  const alteBlobs = [];
  globalThis.URL.createObjectURL = () => { alteBlobs.push(1); return "blob:https://smejj.com/1"; };
  const ergebnis = await rehydriereMedien(wurzel([gut, weg]), {
    adressenHolen: async () => null,
    holen: async (adresse) => (adresse === ADRESSE ? { size: 3 } : null)
  });
  assert.deepEqual(ergebnis, { geholt: 1, gescheitert: 1 });
  assert.equal(gut.getAttribute("src"), "blob:https://smejj.com/1");
  assert.equal(weg.getAttribute("src"), FEHLENDES_BILD);
  // Speichern dreht den blob: wie bisher auf die Adresse zurueck.
  assert.equal(entwaessere(wurzel([gut])), 1);
  assert.equal(gut.getAttribute("src"), ADRESSE);
});

test("gespeichertes HTML: abgelaufene Anzeige-Adresse und toter blob: werden geparkt", () => {
  const html = [
    `<img class="chat-image" src="${ADRESSE}" alt="a">`,
    `<img class="chat-image" data-smejj-adresse="${ADRESSE}" src="${ANZEIGE}" loading="lazy">`,
    `<img data-smejj-adresse="${ADRESSE}" src="blob:https://smejj.com/tot">`,
    `<video class="chat-video" controls data-smejj-adresse="${VADRESSE}" src="${ANZEIGE}"></video>`,
    `<video src="${VADRESSE}"></video>`
  ].join("\n");
  const geparkt = parkeMedienAdressen(html);
  assert.equal(geparkt.includes(ANZEIGE), false, "keine alte Anzeige-Adresse bleibt stehen");
  assert.equal(geparkt.includes("blob:"), false);
  assert.equal((geparkt.match(new RegExp(`src="${LEERES_BILD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) || []).length, 3);
  assert.equal(/<video[^>]*\ssrc=/.test(geparkt), false, "ein Video bekommt kein data:-SVG (media-src)");
  assert.equal((geparkt.match(/data-smejj-adresse=/g) || []).length, 5, "jede echte Adresse bleibt erhalten");
});

test("interne Adressen verlassen den Chat nie als Text", () => {
  const roh = `Hier:\n\n![Erstelltes Bild](${ADRESSE})\n![Erzähltes Video](data:video/mp4;base64,AAAA)\nLink ${ANZEIGE} und https://example.com/bleibt`;
  const text = toPlainText(roh);
  assert.equal(text.includes("chat-medien"), false);
  assert.equal(text.includes("/medium/"), false);
  assert.equal(text.includes("data:"), false);
  assert.match(text, /\[Bild\]/);
  assert.match(text, /\[Video\]/);
  assert.match(text, /https:\/\/example\.com\/bleibt/);
  assert.equal(ohneMedienAdressen("ohne Medien"), "ohne Medien");
});

test("Kopieren, Teilen und Markdown-Export sind verdrahtet", () => {
  const aktionen = lies("../public/chat-actions.js");
  assert.match(aktionen, /const roh = ohneMedienAdressen\(rawOf\(entry\)\);/);
  assert.match(aktionen, /copyText\(roh, button, htmlOf\(entry, roh\)\)/);
  // htmlOf() liegt seit dem 20.09.2026 in einem eigenen Modul (800-Zeilen-Regel);
  // die Medien-Sperre wandert mit der Funktion, nicht mit der Datei.
  const kopiertext = lies("../public/chat-actions-text.js");
  assert.match(aktionen, /await import\("\/assets\/chat-actions-text\.js/, "htmlOf muss nachgeladen werden, sonst waechst das Startgewicht");
  assert.match(kopiertext, /img\[data-smejj-adresse\], video/, "kopiertes HTML traegt keine Medien-Adressen");
  const menue = lies("../public/chat-menue-mehr.js");
  assert.match(menue, /oeffneTeilenBlatt\(medium, \{ text \}\)/, "Teilen mit Medium oeffnet das Teilen-Blatt");
  const verlauf = lies("../public/chat-history-text.js");
  assert.match(verlauf, /api\\\/chat-medien\\\?id=\|\\\/medium\\\//);
});

test("Upload geht roh; die Ansicht ist vorgeladen und darf Videos von der API spielen", () => {
  const blob = blobAusDataUrl("data:image/png;base64,iVBORw0KGgo=");
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 8);
  const medien = lies("../public/chat-medien.js");
  assert.match(medien, /"Content-Type": blob\.type/);
  const sw = lies("../public/sw.js");
  assert.match(sw, /"\/assets\/chat-medien-ansicht\.js"/);
  const index = lies("../public/index.html");
  assert.match(index, /media-src 'self' blob: https:\/\/api\.smejj\.com;/);
  const ansicht = lies("../public/chat-medien-ansicht.js");
  assert.match(ansicht, /border-radius:0!important/, "viereckig");
  assert.match(ansicht, /Nur einmal öffnen/);
  assert.match(ansicht, /Widerrufen/);
});
