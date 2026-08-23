// Waechter fuer die Rettung zu grosser Chats.
//
// Hintergrund (live gemessen 2026-08-23, Konto des Betreibers, 113 Chats):
// zehn Gespraeche lagen ueber der 512-KB-Grenze und waren seit Wochen NICHT
// gesichert. Der Median aller Chats ist 7 KB — es war nie zu viel Text,
// immer ein eingebettetes Medium, und zwar dreifach abgelegt (text, html,
// raw). Der Fix vom 22.08. lagert Medien nur beim SPEICHERN aus und erreichte
// den Bestand deshalb nie.
//
// Geprueft wird hier ohne Netz, ohne DOM, ohne Browser: `auslagern` kommt als
// Parameter herein. Genau dafuer ist es ein Parameter.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHAT_BYTES, groesseInBytes, enthaeltDatenUri, brauchtRettung, istZuGross,
  rettteWert, rettteChat, rettteUndSpeichere, raeumeBestandAuf, BESTAND_MERKER
} from "../public/chat-medien-rettung.js";

const BILD = "data:image/png;base64," + "A".repeat(520 * 1024);
const ADRESSE = "/api/chat-medien?id=m_123";

/** Ersetzt jede data:-URL durch eine kurze Adresse — wie chat-medien.js. */
function auslagernErfolg(text, { karte }) {
  gesehen.push(karte);
  const treffer = text.match(/data:[a-z0-9/.+-]+;base64,[A-Za-z0-9+/=]+/gi) || [];
  let heraus = text;
  for (const t of treffer) {
    if (!karte.has(t)) karte.set(t, ADRESSE);
    heraus = heraus.split(t).join(karte.get(t));
  }
  return Promise.resolve({ text: heraus, ersetzt: treffer.length, gescheitert: 0 });
}
let gesehen = [];

/** Hochladen scheitert: der Text bleibt, wie er war. */
const auslagernFehler = (text) => Promise.resolve({ text, ersetzt: 0, gescheitert: 1 });

/** Ein Chat wie im echten Konto: dieselbe Datei in text, html UND raw. */
function grosserChat() {
  return {
    id: "chat_1786988000453_csimr6",
    title: "Generiere ein Bild von: einem kleinen Haus",
    ownerId: "nutzer-1",
    messages: [
      { role: "user", text: "Generiere ein Bild", html: "<p>Generiere ein Bild</p>" },
      {
        role: "assistant",
        text: `Hier ist das Bild: ![Bild](${BILD})`,
        html: `<p>Hier ist das Bild: <img src="${BILD}"></p>`,
        raw: `Hier ist das Bild: ![Bild](${BILD})`,
        versions: [{ raw: `Erster Versuch: ![Bild](${BILD})`, html: `<img src="${BILD}">` }]
      }
    ]
  };
}

test("das Muster erfasst genau die Typen, die der Server annimmt", async () => {
  // WARUM DIESER WAECHTER: eine Parallelsitzung hat es nachgestellt — stuende
  // hier `audio` im Muster, meldete brauchtRettung() "ja", die Rettung liefe
  // an, ersetzte nichts (der Server weist audio mit "typ_nicht_erlaubt" ab),
  // und der Nutzer saehe den "zu gross"-Hinweis weiter, ohne erkennbare
  // Ursache. Drei Stellen muessen zusammenpassen, sonst entsteht Leerlauf:
  // ERLAUBTE_TYPEN (Server), DATA_URL_MUSTER (chat-medien.js), DATEN_URI (hier).
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

  const serverTypen = [...lies("../control-server/src/chats/medienStore.js")
    .match(/ERLAUBTE_TYPEN = Object\.freeze\(\{[^}]*\}/s)[0]
    .matchAll(/"([a-z]+)\/[a-z0-9.+-]+"/g)].map((m) => m[1]);
  const erlaubteFamilien = [...new Set(serverTypen)].sort();
  assert.deepEqual(erlaubteFamilien, ["image", "video"], "Server-Typen haben sich geaendert");

  assert.ok(enthaeltDatenUri("data:image/png;base64,AAA"));
  assert.ok(enthaeltDatenUri("data:video/mp4;base64,AAA"));
  assert.equal(enthaeltDatenUri("data:audio/mpeg;base64,AAA"), false,
    "Audio nimmt der Server nicht an — es hier zu erfassen erzeugt nur Leerlauf");

  // Und das Schwestermuster in chat-medien.js darf nicht auseinanderlaufen.
  assert.match(lies("../public/chat-medien.js"), /data:\(\?:image\|video\)/);
});

test("BEIDE Absagen des Servers werden als 'zu gross' erkannt", () => {
  // Live gemessen 2026-08-23 an den echten Chats des Betreibers:
  //   543 KB  -> HTTP 400 {"error":"chat_zu_gross"}   (MAX_CHAT_BYTES)
  //  1537 KB  -> HTTP 500 {"error":"Request too large"} (Body-Leser, 1 MB)
  // Der zweite Fall war der blinde Fleck: chat-sync meldete nur 4xx, also
  // fielen SECHS der zehn ungesicherten Chats durch — ohne Hinweis, ohne
  // Rettungsversuch. Wer nur auf "chat_zu_gross" hoert, rettet vier von zehn.
  assert.equal(istZuGross(400, "chat_zu_gross"), true, "die saubere Absage");
  assert.equal(istZuGross(500, "Request too large"), true, "der rohe Body-Leser");
  assert.equal(istZuGross(413, ""), true, "413 ohne Grund reicht");

  // Und die Gegenprobe — sonst wuerde jeder Serverfehler als "zu gross"
  // gedeutet und die Rettung liefe bei echten Stoerungen ins Leere.
  assert.equal(istZuGross(500, "internal_error"), false);
  assert.equal(istZuGross(503, "wartung"), false);
  assert.equal(istZuGross(401, "authentication_required"), false);
  assert.equal(istZuGross(400, "zeitstempel_ungueltig"), false);
  assert.equal(istZuGross(200, ""), false);
});

test("die Grenze ist die des Servers", () => {
  assert.equal(MAX_CHAT_BYTES, 512 * 1024);
});

test("eingebettete Dateien werden auch in der Tiefe gefunden", () => {
  assert.ok(enthaeltDatenUri(grosserChat()));
  assert.ok(enthaeltDatenUri({ a: [{ b: { c: BILD } }] }), "vier Ebenen tief");
  assert.ok(!enthaeltDatenUri({ a: [{ b: "nur Text" }] }));
  assert.ok(!enthaeltDatenUri(null));
});

test("ein reiner Textchat wird NICHT gerettet, auch wenn er zu gross ist", () => {
  // Sonst haette der Lauf Zeit gekostet und Erfolg vorgetaeuscht, wo nichts
  // auszulagern ist.
  const nurText = { id: "x", messages: [{ role: "user", text: "x".repeat(600 * 1024) }] };
  assert.ok(groesseInBytes(nurText) > MAX_CHAT_BYTES);
  assert.equal(brauchtRettung(nurText), false);
});

test("ein kleiner Chat mit Bild wird nicht angefasst", () => {
  const klein = { id: "x", messages: [{ role: "assistant", text: "data:image/png;base64,AAA" }] };
  assert.equal(brauchtRettung(klein), false);
});

test("der 1537-KB-Fall schrumpft unter die Grenze", async () => {
  gesehen = [];
  const chat = grosserChat();
  const vorherKB = Math.round(groesseInBytes(chat) / 1024);
  assert.ok(vorherKB > 512, `Probe muss zu gross sein, ist ${vorherKB} KB`);
  assert.ok(brauchtRettung(chat));

  const ergebnis = await rettteChat(chat, { auslagern: auslagernErfolg });
  assert.equal(ergebnis.gerettet, true);
  assert.ok(ergebnis.nachher < 4 * 1024, `nachher ${ergebnis.nachher} Bytes — muss winzig sein`);
  assert.equal(ergebnis.gescheitert, 0);
  assert.ok(ergebnis.ersetzt >= 5, `text, html, raw und beide Fassungen = 5, gezaehlt ${ergebnis.ersetzt}`);
});

test("dieselbe Datei wird nur EINMAL hochgeladen — die Karte wird durchgereicht", async () => {
  gesehen = [];
  await rettteChat(grosserChat(), { auslagern: auslagernErfolg });
  assert.ok(gesehen.length >= 5, "mehrere Felder enthalten die Datei");
  const erste = gesehen[0];
  assert.ok(gesehen.every((k) => k === erste), "alle Aufrufe teilen DIESELBE Karte");
  assert.equal(erste.size, 1, "eine einzige Datei, also ein einziger Eintrag");
});

test("die Struktur des Chats bleibt unveraendert", async () => {
  const ergebnis = await rettteChat(grosserChat(), { auslagern: auslagernErfolg });
  const c = ergebnis.chat;
  assert.equal(c.id, "chat_1786988000453_csimr6");
  assert.equal(c.ownerId, "nutzer-1");
  assert.equal(c.messages.length, 2);
  assert.equal(c.messages[0].text, "Generiere ein Bild", "die Nutzerfrage bleibt woertlich");
  assert.equal(c.messages[1].versions.length, 1);
  assert.ok(c.messages[1].text.includes(ADRESSE), "die Adresse steht jetzt drin");
  assert.ok(!c.messages[1].text.includes("base64"), "die eingebettete Datei ist raus");
});

test("scheitert das Hochladen, geht NICHTS verloren", async () => {
  const chat = grosserChat();
  const ergebnis = await rettteChat(chat, { auslagern: auslagernFehler });
  assert.equal(ergebnis.gerettet, false);
  assert.equal(ergebnis.ersetzt, 0);
  assert.deepEqual(ergebnis.chat, chat, "der Chat kommt unveraendert zurueck");
});

test("gespeichert wird nur, wenn wirklich etwas ersetzt wurde", async () => {
  const geschrieben = [];
  const chat = grosserChat();
  await rettteUndSpeichere("id", {
    laden: async () => chat,
    speichern: async (c) => geschrieben.push(c),
    auslagern: auslagernFehler
  });
  assert.equal(geschrieben.length, 0, "nichts ersetzt, also nichts schreiben");

  await rettteUndSpeichere("id", {
    laden: async () => grosserChat(),
    speichern: async (c) => geschrieben.push(c),
    auslagern: auslagernErfolg
  });
  assert.equal(geschrieben.length, 1);
  assert.ok(groesseInBytes(geschrieben[0]) < MAX_CHAT_BYTES);
});

test("fail-safe: ein Fehler beim Laden beschaedigt nichts", async () => {
  const ergebnis = await rettteUndSpeichere("id", {
    laden: async () => { throw new Error("kein Netz"); },
    speichern: async () => { throw new Error("darf nie passieren"); },
    auslagern: auslagernErfolg
  });
  assert.equal(ergebnis.gerettet, false);
  assert.equal(ergebnis.grund, "fehlgeschlagen");
});

test("ein Chat, den es nicht gibt, wird uebersprungen", async () => {
  const ergebnis = await rettteUndSpeichere("weg", {
    laden: async () => null,
    speichern: async () => { throw new Error("darf nie passieren"); },
    auslagern: auslagernErfolg
  });
  assert.equal(ergebnis.gerettet, false);
  assert.equal(ergebnis.grund, "nichts_auszulagern");
});

test("chat-sync ruft die Rettung wirklich auf — und nur bei 'zu gross'", async () => {
  // Gegenprobe zum Muster "Schutz gebaut, aber nicht angeschlossen": ein
  // Modul, das niemand aufruft, ist wirkungslos und faellt sonst nicht auf.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sync = readFileSync(fileURLToPath(new URL("../public/chat-sync.js", import.meta.url)), "utf8");
  assert.match(sync, /chat-medien-rettung\.js/, "das Modul wird importiert");
  assert.match(sync, /istZuGross\(antwort\.status, grund\) && await rette\(/, "und an der gemeinsamen Weiche gerufen");
  assert.match(sync, /grossFehler \|\| istZuGross\(/, "das 500 des Body-Lesers wird mit erfasst");
  assert.match(sync, /if \(zweiter\?\.ok\) continue;/, "nach der Rettung wird erneut gesendet");
});

// ---- der Bestandslauf ---------------------------------------------------------
//
// WARUM ER SEIN EIGENES KAPITEL BEKOMMT: die Rettung oben haengt am Sende-Weg
// und setzt voraus, dass ein Chat ueberhaupt gesendet wird. Live gemessen
// 2026-08-23 arbeitet sich push() durch 113 Gespraeche — nach gut einer Minute
// war genau EINER der zehn grossen gerettet. Wer die App kurz oeffnet, kommt
// nie bei seinem Bestand an.

/** Ein Speicher, der sich wie localStorage verhaelt, aber im Test lebt. */
function speicherAttrappe(start = {}) {
  const daten = { ...start };
  return {
    getItem: (k) => (k in daten ? daten[k] : null),
    setItem: (k, v) => { daten[k] = String(v); },
    _daten: daten
  };
}

function bestandDeps(chats, speicher, jetzt = 1_000_000_000_000) {
  const abgelegt = [];
  return {
    deps: {
      listen: async () => chats.map((c) => ({ id: c.id })),
      laden: async (id) => chats.find((c) => c.id === id),
      speichern: async (c) => { abgelegt.push(c); const i = chats.findIndex((x) => x.id === c.id); chats[i] = c; },
      auslagern: auslagernErfolg,
      speicher, jetzt
    },
    abgelegt
  };
}

test("der Bestandslauf findet und rettet genau die zu grossen Chats", async () => {
  gesehen = [];
  const chats = [
    { id: "klein-1", messages: [{ role: "user", text: "hallo" }] },
    { ...grosserChat(), id: "gross-1" },
    { id: "klein-2", messages: [{ role: "user", text: "auch klein" }] },
    { ...grosserChat(), id: "gross-2" }
  ];
  const { deps, abgelegt } = bestandDeps(chats, speicherAttrappe());
  const e = await raeumeBestandAuf(deps);
  assert.equal(e.gelaufen, true);
  assert.equal(e.geprueft, 4, "jeder Chat wird angesehen");
  assert.equal(e.gerettet, 2, "nur die beiden grossen werden angefasst");
  assert.deepEqual(abgelegt.map((c) => c.id), ["gross-1", "gross-2"]);
  assert.ok(chats.every((c) => groesseInBytes(c) < MAX_CHAT_BYTES), "danach passt jeder durch");
});

test("hoechstens einmal am Tag", async () => {
  const chats = [{ ...grosserChat(), id: "g" }];
  const sp = speicherAttrappe();
  const ersteDeps = bestandDeps(chats, sp, 1_000_000_000_000).deps;
  assert.equal((await raeumeBestandAuf(ersteDeps)).gelaufen, true);

  // Eine Stunde spaeter: nicht noch einmal.
  const chats2 = [{ ...grosserChat(), id: "g2" }];
  const spaeter = bestandDeps(chats2, sp, 1_000_000_000_000 + 3_600_000);
  const zweite = await raeumeBestandAuf(spaeter.deps);
  assert.equal(zweite.gelaufen, false);
  assert.equal(zweite.grund, "heute_schon");
  assert.equal(spaeter.abgelegt.length, 0);

  // Am naechsten Tag wieder.
  const chats3 = [{ ...grosserChat(), id: "g3" }];
  const morgen = bestandDeps(chats3, sp, 1_000_000_000_000 + 25 * 3_600_000);
  assert.equal((await raeumeBestandAuf(morgen.deps)).gelaufen, true);
  assert.equal(morgen.abgelegt.length, 1);
});

test("der Merker wird VOR dem Lauf gesetzt", async () => {
  // Sonst begaenne ein abgebrochener Lauf bei jedem Seitenaufruf von vorn und
  // versuchte jedes Mal dieselben Uploads.
  const sp = speicherAttrappe();
  let merkerBeimLaden = "noch nicht gelesen";
  await raeumeBestandAuf({
    listen: async () => [{ id: "g" }],
    laden: async () => { merkerBeimLaden = sp.getItem(BESTAND_MERKER); return grosserChat(); },
    speichern: async () => {},
    auslagern: auslagernErfolg,
    speicher: sp, jetzt: 1_700_000_000_000
  });
  assert.equal(merkerBeimLaden, "1700000000000");
});

test("ein Fehler mittendrin bleibt still und beschaedigt nichts", async () => {
  const sp = speicherAttrappe();
  const e = await raeumeBestandAuf({
    listen: async () => { throw new Error("Datenbank zu"); },
    laden: async () => null, speichern: async () => { throw new Error("nie"); },
    auslagern: auslagernErfolg, speicher: sp
  });
  assert.equal(e.gelaufen, false);
  assert.equal(e.grund, "fehlgeschlagen");
});

test("der Lauf deckelt sich selbst — kein Upload-Sturm beim ersten Start", async () => {
  const chats = Array.from({ length: 30 }, (_, i) => ({ ...grosserChat(), id: `g${i}` }));
  const { deps, abgelegt } = bestandDeps(chats, speicherAttrappe());
  const e = await raeumeBestandAuf({ ...deps, hoechstens: 5 });
  assert.equal(e.gerettet, 5);
  assert.equal(abgelegt.length, 5);
  assert.equal(e.offen, 25, "der Rest wird beim naechsten Lauf geholt, nicht verschwiegen");
});

test("chat-sync startet den Bestandslauf wirklich", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sync = readFileSync(fileURLToPath(new URL("../public/chat-sync.js", import.meta.url)), "utf8");
  assert.match(sync, /raeumeBestandAuf/, "das Modul wird importiert");
  assert.match(sync, /setTimeout\(\(\) => \{ bestandAufraeumen\(\); \}/, "und beim Start angestossen");
  assert.match(sync, /ergebnis\?\.gerettet > 0\) planePush\(\)/, "danach wird gesendet, nicht gewartet");
});
