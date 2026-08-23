// Waechter fuer die Push-Auswahl: erst fragen, dann senden.
//
// DER BEFUND (live gemessen 2026-08-23, Konto des Betreibers, 113 Chats):
// Eine einzige Chat-Frage loeste ueber 100 PUT-Anfragen an /api/chats aus,
// einzelne mit 188 KB. Die Modell-Anfrage war EINE davon und brauchte 2,1 s —
// die Antwort erschien nach 43 s. Das Modell war laengst fertig, die Leitung
// noch mit dem Verlauf beschaeftigt.
//
// Und der Server verwirft die meisten dieser Uploads sofort wieder
// ("server_ist_neuer"). Diese Auswahl bildet dieselbe Entscheidung im Browser
// nach — vorher statt hinterher.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { konfliktSieger, abgleichsKarte, mussGesendetWerden, teileAuf, erzeugeVorfahrt, erzeugeAbgleichsSpeicher } from "../public/chat-sync-auswahl.js";
import { konfliktSieger as serverSieger } from "../control-server/src/chats/chatSyncStore.js";

const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const chat = (id, updatedAt) => ({ id, updatedAt });

test("die Regel ist WORTGLEICH mit der des Servers", () => {
  // Laeuft eine Fassung der anderen davon, sendet der Client entweder zu viel
  // (harmlos) oder zu wenig (Datenverlust). Darum an echten Werten gegengeprueft.
  const proben = [
    ["2026-08-23T10:00:00Z", "2026-08-23T09:00:00Z"],
    ["2026-08-23T09:00:00Z", "2026-08-23T10:00:00Z"],
    ["2026-08-23T10:00:00Z", "2026-08-23T10:00:00Z"],
    ["2026-08-23T10:00:00.001Z", "2026-08-23T10:00:00.000Z"],
    ["", "2026-08-23T10:00:00Z"], ["2026-08-23T10:00:00Z", ""], ["", ""],
    [null, undefined], ["kaputt", "2026-08-23T10:00:00Z"], ["2026-08-23T10:00:00Z", "kaputt"]
  ];
  for (const [a, b] of proben) {
    assert.equal(konfliktSieger(a, b), serverSieger(a, b), `abweichend bei ${JSON.stringify([a, b])}`);
  }
});

test("was der Server schon hat, wird nicht noch einmal hochgeladen", () => {
  const karte = abgleichsKarte({ chats: [{ id: "a", updatedAt: "2026-08-23T10:00:00Z" }] });
  assert.equal(mussGesendetWerden(chat("a", "2026-08-23T10:00:00Z"), karte), false, "gleicher Stand");
  assert.equal(mussGesendetWerden(chat("a", "2026-08-23T09:00:00Z"), karte), false, "aelter als der Server");
  assert.equal(mussGesendetWerden(chat("a", "2026-08-23T11:00:00Z"), karte), true, "neuer -> senden");
  assert.equal(mussGesendetWerden(chat("b", "2026-08-23T09:00:00Z"), karte), true, "kennt der Server nicht");
});

test("EINE Millisekunde reicht — die Rettung darf nicht liegenbleiben", () => {
  // Eine Parallelsitzung hat am selben Tag gemessen, dass ein geheilter Chat
  // bei GLEICHEM Zeitstempel stillschweigend verworfen wurde, und loest das
  // mit einer Millisekunde. Diese Auswahl darf ihr nicht in den Ruecken
  // fallen: eine Millisekunde mehr heisst senden.
  const karte = abgleichsKarte({ chats: [{ id: "a", updatedAt: "2026-08-23T10:00:00.000Z" }] });
  assert.equal(mussGesendetWerden(chat("a", "2026-08-23T10:00:00.001Z"), karte), true);
});

test("ohne brauchbaren Abgleich wird ALLES gesendet", () => {
  // Fail-safe: lieber einmal zu viel hochladen als einen Chat liegen lassen.
  for (const kaputt of [null, undefined, {}, { chats: null }, { chats: "nein" }, { fehler: true }]) {
    const karte = abgleichsKarte(kaputt);
    assert.equal(karte, null, `${JSON.stringify(kaputt)} darf keine Karte ergeben`);
    assert.equal(mussGesendetWerden(chat("a", "2026-08-23T10:00:00Z"), karte), true);
  }
});

test("ein Chat ohne Kennung wird gesendet, nicht verschluckt", () => {
  const karte = abgleichsKarte({ chats: [{ id: "a", updatedAt: "2026-08-23T10:00:00Z" }] });
  assert.equal(mussGesendetWerden({ updatedAt: "2026-08-23T10:00:00Z" }, karte), true);
  assert.equal(mussGesendetWerden(null, karte), true);
});

test("der gemessene Fall: von 113 bleibt fast nichts uebrig", () => {
  const alle = Array.from({ length: 113 }, (_, i) => chat(`c${i}`, "2026-08-23T10:00:00Z"));
  alle[7] = chat("c7", "2026-08-23T12:00:00Z");        // einer wurde bearbeitet
  alle.push(chat("neu", "2026-08-23T12:00:00Z"));       // einer ist ganz neu
  const karte = abgleichsKarte({ chats: alle.slice(0, 113).map((c) => ({ id: c.id, updatedAt: "2026-08-23T10:00:00Z" })) });
  const { senden, gespart, gesamt } = teileAuf(alle, karte);
  assert.equal(gesamt, 114);
  assert.deepEqual(senden.map((c) => c.id), ["c7", "neu"]);
  assert.equal(gespart, 112, "112 Uploads, die der Server ohnehin verworfen haette");
});

test("ohne Karte bleibt teileAuf beim alten Verhalten", () => {
  const alle = [chat("a", "x"), chat("b", "y")];
  const { senden, gespart } = teileAuf(alle, null);
  assert.equal(senden.length, 2);
  assert.equal(gespart, 0);
});

test("chat-sync ruft die Auswahl wirklich auf", () => {
  // Gegenprobe zum Muster "gebaut, aber nicht angeschlossen".
  const sync = lies("../public/chat-sync.js");
  assert.match(sync, /chat-sync-auswahl\.js/, "das Modul wird importiert");
  assert.match(sync, /nurAbgleich=1.*\n?.*abgleichsKarte|abgleichsKarte\(/, "der Abgleich wird geholt");
  assert.match(sync, /teileAuf\(alle, karte\)/, "und angewandt");
});

// ---- Vorfahrt: die Antwort geht vor der Sicherung ----------------------------
//
// GEMESSEN 2026-08-23, nachdem die Upload-Flut behoben war: die Modell-Anfrage
// ging erst nach 10,5 s raus. Davor lagen zwei Verlauf-Anfragen (5,6 s und
// 6,9 s) auf der Leitung. Der Server war nach 1,3 s fertig.

test("waehrend eine Antwort laeuft, wird nicht gesichert", () => {
  let nachgeholt = 0;
  const v = erzeugeVorfahrt({ jetztSenden: () => { nachgeholt += 1; } });
  assert.equal(v.darfSenden(), true, "ohne Strom darf gesendet werden");
  v.stromstand(1);
  assert.equal(v.darfSenden(), false, "Antwort laeuft -> warten");
  assert.equal(nachgeholt, 0);
});

test("was liegen blieb, wird nachgeholt — sonst waere es Datenverlust", () => {
  let nachgeholt = 0;
  const v = erzeugeVorfahrt({ jetztSenden: () => { nachgeholt += 1; } });
  v.stromstand(1);
  v.darfSenden();                 // wird abgelehnt und gemerkt
  assert.equal(v.wartet, true);
  v.stromstand(0);                // Antwort fertig
  assert.equal(nachgeholt, 1, "der ausgesetzte Push laeuft von selbst nach");
  assert.equal(v.wartet, false);
});

test("ohne ausgesetzten Push wird beim Freiwerden NICHT gesendet", () => {
  // Sonst loeste jede beendete Antwort einen zusaetzlichen Lauf aus.
  let nachgeholt = 0;
  const v = erzeugeVorfahrt({ jetztSenden: () => { nachgeholt += 1; } });
  v.stromstand(1);
  v.stromstand(0);
  assert.equal(nachgeholt, 0);
});

test("mehrere gleichzeitige Stroeme werden richtig gezaehlt", () => {
  let nachgeholt = 0;
  const v = erzeugeVorfahrt({ jetztSenden: () => { nachgeholt += 1; } });
  v.stromstand(2);
  v.darfSenden();
  v.stromstand(1);
  assert.equal(nachgeholt, 0, "einer laeuft noch");
  assert.equal(v.darfSenden(), false);
  v.stromstand(0);
  assert.equal(nachgeholt, 1);
});

test("unsinnige Stromstaende kippen die Bremse nicht", () => {
  const v = erzeugeVorfahrt({ jetztSenden: () => {} });
  for (const unsinn of [null, undefined, "viele", NaN, -3]) {
    v.stromstand(unsinn);
    assert.equal(v.stroeme, 0, `${String(unsinn)} muss als 0 gelten`);
    assert.equal(v.darfSenden(), true);
  }
});

test("chat-sync haengt die Vorfahrt wirklich an das Stromsignal", () => {
  const sync = lies("../public/chat-sync.js");
  assert.match(sync, /erzeugeVorfahrt\(/, "Vorfahrt wird angelegt");
  assert.match(sync, /smejj:chat-strom/, "und an das Signal gehaengt, das BEIDE Familien senden");
  assert.match(sync, /if \(!vorfahrt\.darfSenden\(\)\) return;/, "push() fragt sie");
});

// ---- geteilter Abgleich: pull() und push() fragen dasselbe --------------------
//
// STARTPHASE GEMESSEN 2026-08-23: /api/chats?nurAbgleich=1 lief ZWEIMAL — bei
// 2317 ms (pull) und bei 7324 ms (push), die zweite allein 1504 ms lang. Bis
// 8,8 s nach dem Laden war die Leitung belegt, und die erste Chat-Frage
// kostete deshalb 11 Sekunden statt einer.

function uhrAttrappe(start = 1000) {
  let jetzt = start;
  return { uhr: () => jetzt, vor: (ms) => { jetzt += ms; } };
}

test("was pull geholt hat, fragt push nicht noch einmal", () => {
  const u = uhrAttrappe();
  const sp = erzeugeAbgleichsSpeicher({ frist: 5000, uhr: u.uhr });
  const karte = abgleichsKarte({ chats: [{ id: "a", updatedAt: "2026-08-23T10:00:00Z" }] });
  sp.merke(karte);
  u.vor(4999);
  assert.equal(sp.hole(), karte, "innerhalb der Frist wird geteilt");
});

test("nach der Frist wird frisch gefragt", () => {
  // Ein veralteter Abgleich liesse einen Chat liegen, den ein anderes Geraet
  // gerade geaendert hat. Lieber eine Anfrage mehr als ein Stand weniger.
  const u = uhrAttrappe();
  const sp = erzeugeAbgleichsSpeicher({ frist: 5000, uhr: u.uhr });
  sp.merke(abgleichsKarte({ chats: [] }));
  u.vor(5001);
  assert.equal(sp.hole(), null);
});

test("nach dem Schreiben ist die Karte hinfaellig", () => {
  const u = uhrAttrappe();
  const sp = erzeugeAbgleichsSpeicher({ frist: 5000, uhr: u.uhr });
  sp.merke(abgleichsKarte({ chats: [{ id: "a", updatedAt: "x" }] }));
  sp.verwerfen();
  assert.equal(sp.hole(), null, "sonst haelt push den eigenen Schreibstand fuer den Serverstand");
});

test("ohne gemerkte Karte gibt es null — und dann wird alles gesendet", () => {
  const sp = erzeugeAbgleichsSpeicher();
  assert.equal(sp.hole(), null);
  assert.equal(mussGesendetWerden({ id: "a", updatedAt: "x" }, sp.hole()), true);
});

test("chat-sync teilt den Abgleich und laesst sich unterbrechen", () => {
  const sync = lies("../public/chat-sync.js");
  assert.match(sync, /erzeugeAbgleichsSpeicher\(/, "Speicher wird angelegt");
  assert.match(sync, /abgleichsSpeicher\.merke\(abgleichsKarte\(daten\)\)/, "pull legt seinen Abgleich ab");
  assert.match(sync, /let karte = abgleichsSpeicher\.hole\(\)/, "push nimmt ihn");
  assert.match(sync, /abgleichsSpeicher\.verwerfen\(\)/, "nach dem Schreiben verworfen");
  // Und der Kern fuer den Start: die Schleife bricht ab, wenn eine Antwort anfaengt.
  assert.match(sync, /if \(!vorfahrt\.darfSenden\(\)\) break;/, "laufender Sync macht der Antwort Platz");
});
