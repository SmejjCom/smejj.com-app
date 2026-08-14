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
  ADRESSE_ATTRIBUT, VIDEO_QUELLE_ATTRIBUT, adresseFuer, entwaessere, findeAuslagerbare,
  istMedienAdresse, lagereMedienAus, rehydriereMedien
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

// --- Anzeigen ohne die Sicherheitsrichtlinie zu brechen ---------------------
//
// Live gemessen 2026-08-14, mit einem securitypolicyviolation-Ereignis belegt:
// Die Seite laeuft unter `img-src 'self' data: blob:`. Ein <img src="https://
// smejj-control.zeabur.app/api/chat-medien?id=…"> wird hart abgewiesen —
// violatedDirective "img-src", das Bild bleibt 0x0. Und selbst ohne die
// Richtlinie koennte ein <img> den Anmelde-Schluessel nicht mitschicken; die
// Route antwortet von aussen mit 401.
//
// Darum wird das Medium geholt und als blob: gezeigt. Der gefaehrliche Teil
// daran ist die Rueckrichtung: Genau ein blob: im gespeicherten html hat die
// vier Videos im Konto zu Leichen gemacht. Diese Tests bewachen das.

function medienKnoten(teile) {
  const elemente = teile.map((t) => {
    const el = {
      tagName: t.tag.toUpperCase(), attribute: { ...t.attribute },
      getAttribute: (n) => (Object.hasOwn(el.attribute, n) ? el.attribute[n] : null),
      setAttribute: (n, w) => { el.attribute[n] = String(w); },
      removeAttribute: (n) => { delete el.attribute[n]; }
    };
    return el;
  });
  return {
    elemente,
    querySelectorAll: (wahl) => {
      if (wahl === "img, video") return elemente;
      if (wahl === `[${ADRESSE_ATTRIBUT}]`) return elemente.filter((e) => e.getAttribute(ADRESSE_ATTRIBUT));
      if (wahl === 'img[src^="data:image/"]') {
        return elemente.filter((e) => e.tagName === "IMG" && String(e.getAttribute("src") || "").startsWith("data:image/"));
      }
      if (wahl === "video") return elemente.filter((e) => e.tagName === "VIDEO");
      return [];
    }
  };
}

const ADRESSE = "https://c.example/api/chat-medien?id=abc123.png";

test("istMedienAdresse erkennt nur ausgelagerte Medien", () => {
  assert.equal(istMedienAdresse(ADRESSE), true);
  for (const andere of ["", null, "data:image/png;base64,AA==", "blob:https://smejj.com/x",
                        "https://c.example/api/chats", "https://c.example/api/chat-medien"]) {
    assert.equal(istMedienAdresse(andere), false, `sollte NICHT als Medium gelten: ${andere}`);
  }
});

test("rehydrieren zeigt als blob: an und merkt sich die echte Adresse", async () => {
  const k = medienKnoten([{ tag: "img", attribute: { src: ADRESSE } }]);
  // Ein ECHTER Blob: Node bricht sonst in createObjectURL ab, und der Test
  // wuerde den Fehler dem Code anlasten statt sich selbst.
  const r = await rehydriereMedien(k, { holen: async () => new Blob(["x"], { type: "image/png" }) });
  assert.deepEqual(r, { geholt: 1, gescheitert: 0 });
  assert.match(k.elemente[0].getAttribute("src"), /^blob:/);
  assert.equal(k.elemente[0].getAttribute(ADRESSE_ATTRIBUT), ADRESSE,
    "ohne gemerkte Adresse gaebe es keinen Rueckweg — genau daran starben die Videos");
});

test("scheitert das Holen, bleibt die Adresse unangetastet", async () => {
  const k = medienKnoten([{ tag: "img", attribute: { src: ADRESSE } }]);
  const r = await rehydriereMedien(k, { holen: async () => null });
  assert.deepEqual(r, { geholt: 0, gescheitert: 1 });
  assert.equal(k.elemente[0].getAttribute("src"), ADRESSE);
  assert.equal(k.elemente[0].getAttribute(ADRESSE_ATTRIBUT), null);
});

test("entwaessern dreht jedes blob: zurueck auf seine Adresse", () => {
  const k = medienKnoten([
    { tag: "img", attribute: { src: "blob:https://smejj.com/a", [ADRESSE_ATTRIBUT]: ADRESSE } },
    { tag: "video", attribute: { src: "blob:https://smejj.com/b", [ADRESSE_ATTRIBUT]: "https://c.example/api/chat-medien?id=d.mp4" } },
    { tag: "img", attribute: { src: "data:image/png;base64,AA==" } }
  ]);
  assert.equal(entwaessere(k), 2);
  assert.equal(k.elemente[0].getAttribute("src"), ADRESSE);
  assert.equal(k.elemente[1].getAttribute("src"), "https://c.example/api/chat-medien?id=d.mp4");
  assert.equal(k.elemente[0].getAttribute(ADRESSE_ATTRIBUT), null);
  assert.equal(k.elemente[2].getAttribute("src"), "data:image/png;base64,AA==", "Unbeteiligte bleiben unberuehrt");
});

test("KEIN blob: ueberlebt das Speichern — lagereMedienAus entwaessert zuerst", async () => {
  // Der Fall, der die ganze Arbeit ausgeloest hat, rueckwaerts gedacht:
  // ein angezeigtes (blob:) Medium plus ein frisch erzeugtes daneben.
  const k = medienKnoten([
    { tag: "img", attribute: { src: "blob:https://smejj.com/a", [ADRESSE_ATTRIBUT]: ADRESSE } },
    { tag: "img", attribute: { src: png("neu") } }
  ]);
  const r = await lagereMedienAus(k, { basis: "https://c.example/api/chat-medien", hochladen: async () => "neu99.png" });
  assert.deepEqual(r, { ausgelagert: 1, gescheitert: 0 }, "nur das FRISCHE Medium wird hochgeladen");
  assert.equal(k.elemente[0].getAttribute("src"), ADRESSE, "das angezeigte kehrt zu seiner Adresse zurueck");
  assert.equal(k.elemente[1].getAttribute("src"), "https://c.example/api/chat-medien?id=neu99.png");
  for (const el of k.elemente) {
    assert.doesNotMatch(el.getAttribute("src"), /^blob:/, "kein einziges blob: darf gespeichert werden");
  }
});

test("der Store holt die Medien beim Wiederherstellen", async () => {
  const quelle = await import("node:fs").then((fs) => fs.readFileSync("public/chat-store.js", "utf8"));
  // Vorwaerts schneiden, NICHT bis persistActive: das steht in der Datei
  // WEITER OBEN, der Ausschnitt waere leer und der Test immer rot.
  const i = quelle.indexOf("function renderEntriesInto");
  const rumpf = quelle.slice(i, i + 2200);
  assert.match(rumpf, /medienHolen\(log\)/,
    "ohne diesen Aufruf bliebe im Verlauf eine Adresse stehen, die die Sicherheitsrichtlinie blockt");
});
