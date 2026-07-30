// smejj.com — Tests fuer die Deutung der Maus-Diagnose (scripts/diagnose).
// Ohne Netz, ohne Zugangsdaten, ohne Server: geprueft wird ausschliesslich,
// wie Messwerte gedeutet werden. Genau dort entstand der Fehler, der einen
// gelungenen Lauf als "0 Beweise" ausgab.
import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerabdruck,
  gleicherWert,
  belegeZusammenfassen,
  deuteEimerStatus,
  laufBefund,
  handlungsanweisung
} from "../scripts/diagnose/maus-befund.mjs";

test("Fingerabdruck verraet den Wert nicht und erkennt Leerzeichen", () => {
  const f = fingerabdruck("geheimwert-mit-64-zeichen");
  assert.equal(f.vorhanden, true);
  assert.equal(f.laenge, 25);
  assert.equal(f.sha8.length, 8);
  assert.equal(f.sauber, true);
  // Der Klartext darf in keinem Feld auftauchen.
  assert.ok(!JSON.stringify(f).includes("geheimwert"));
  assert.equal(fingerabdruck(" mit-rand ").sauber, false);
  assert.equal(fingerabdruck(undefined).vorhanden, false);
  assert.equal(fingerabdruck("").sha8, "-");
});

test("gleicherWert vergleicht ueber Laenge UND Fingerabdruck, fail-closed bei leer", () => {
  assert.equal(gleicherWert(fingerabdruck("abc"), fingerabdruck("abc")), true);
  assert.equal(gleicherWert(fingerabdruck("abc"), fingerabdruck("abd")), false);
  // Zwei fehlende Werte sind NICHT "gleich" — sonst gilt eine unkonfigurierte
  // Seite als in Ordnung.
  assert.equal(gleicherWert(fingerabdruck(""), fingerabdruck("")), false);
});

test("Belege werden aus dem Feld 'objects' gelesen, nicht aus 'entries'", () => {
  // Genau die Form, die artifact-uploader.mjs schreibt.
  const manifest = {
    planId: "selbsttest-smejj-com-v1",
    objects: [
      { key: "capsules/maus-engine/c/result/p/aktionsprotokoll.json.gz" },
      { key: "capsules/maus-engine/c/result/p/01-login.png.gz" },
      { key: "capsules/maus-engine/c/result/p/02-register.png.gz" }
    ]
  };
  const b = belegeZusammenfassen(manifest);
  assert.equal(b.objekte, 3);
  assert.equal(b.screenshots, 2);
  assert.equal(b.praefix, "capsules/maus-engine/c/result/p");
  assert.deepEqual(b.schluessel, ["aktionsprotokoll.json.gz", "01-login.png.gz", "02-register.png.gz"]);
});

test("Ein Manifest mit 'entries' statt 'objects' liefert 0 — der alte Messfehler", () => {
  const b = belegeZusammenfassen({ entries: [{ key: "x/y.png.gz" }] });
  assert.equal(b.objekte, 0);
  assert.equal(b.praefix, null);
});

test("Fehlendes oder kaputtes Manifest bricht nicht ab", () => {
  for (const eingabe of [null, undefined, {}, { objects: null }, "text"]) {
    const b = belegeZusammenfassen(eingabe);
    assert.equal(b.objekte, 0);
    assert.deepEqual(b.schluessel, []);
  }
});

test("403 und 404 sind zwei verschiedene Befunde", () => {
  assert.equal(deuteEimerStatus("403"), "anderes Konto");
  assert.equal(deuteEimerStatus(403), "anderes Konto");
  assert.equal(deuteEimerStatus("404"), "gleiches Konto, Objekt fehlt");
  assert.equal(deuteEimerStatus("?"), "unklar");
  assert.equal(deuteEimerStatus("500"), "unklar");
});

test("Lauf ohne abgelegte Beweise gilt nicht als Erfolg (fail-closed)", () => {
  assert.equal(laufBefund({ ok: true, objekte: 7 }), "engine_vollstaendig");
  assert.equal(laufBefund({ ok: true, objekte: 0 }), "ohne_beweise");
  assert.equal(laufBefund({ ok: false, objekte: 7 }), "lauf_gescheitert");
  assert.equal(laufBefund({ ok: false, objekte: 0 }), "lauf_gescheitert");
});

test("Handlungsanweisung ist leer, wenn nichts abweicht", () => {
  assert.deepEqual(handlungsanweisung({ tokenGleich: true, eimerFalsch: false }), []);
});

test("Handlungsanweisung nennt nur die tatsaechlich abweichenden Werte", () => {
  const nurToken = handlungsanweisung({ tokenGleich: false, eimerFalsch: false });
  assert.equal(nurToken.length, 1);
  assert.match(nurToken[0], /SMEJJ_MAUS_ENGINE_TOKEN/);

  const nurEimer = handlungsanweisung({
    tokenGleich: true, eimerFalsch: true,
    zielEimer: "smejj-app", region: "us-west-2", endpoint: "https://s3.us-west-2.idrivee2.com"
  });
  assert.equal(nurEimer.length, 3);
  assert.match(nurEimer[0], /IDRIVE_E2_BUCKET = smejj-app/);
  assert.match(nurEimer[2], /us-west-2/);
  // Der Control-Server wird nie als Aenderungsort genannt: sein Eimer traegt
  // den Bestand, umgestellt wird immer die Engine.
  assert.ok(!nurEimer.join(" ").toLowerCase().includes("salad"));
});

test("Beide Abweichungen zusammen ergeben vier Schritte in fester Reihenfolge", () => {
  const alle = handlungsanweisung({
    tokenGleich: false, eimerFalsch: true,
    zielEimer: "smejj-app", region: "us-west-2", endpoint: "https://s3.us-west-2.idrivee2.com"
  });
  assert.equal(alle.length, 4);
  assert.match(alle[0], /TOKEN/);
  assert.match(alle[1], /BUCKET/);
  assert.match(alle[2], /ACCESS_KEY/);
});
