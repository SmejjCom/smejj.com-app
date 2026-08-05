// smejj.com — Schutztests der Regelfragen-Anreicherung.
//
// Zweck wie bei rag-infrastruktur.test.mjs: BEIDE Haelften festhalten — was
// erkannt wird UND was ausdruecklich nicht. Die zweite Haelfte ist die
// wichtigere: eine Anreicherung, die zu oft greift, hebt Halluzinationsfaelle
// ueber die Schwelle und richtet genau den Schaden an, gegen den die Schwelle da ist.
import test from "node:test";
import assert from "node:assert/strict";

import { erkenneRegelfrage, erweitereRegelfrage, REGELKLASSEN } from "../control-server/src/rag/regelfragen.js";
import { reichereFrageAn, searchRagIndex } from "../control-server/src/rag/ragContextBlock.js";
import { buildIndex } from "../control-server/src/rag/bm25Index.js";
import { loadKnowledgeChunks } from "../control-server/src/rag/knowledgeLoader.js";

test("Regelfragen werden ihrer Klasse zugeordnet", () => {
  assert.equal(erkenneRegelfrage("Duerfen wir eine verifizierte Funktion ausbauen?")?.id, "schutz");
  assert.equal(erkenneRegelfrage("Darf ich den alten Branch loeschen?")?.id, "schutz");
  assert.equal(erkenneRegelfrage("Sind Task Capsules als Trainingsdaten nutzbar?")?.id, "trainingsdaten");
  assert.equal(erkenneRegelfrage("Woraus darf das Memory-System lernen?")?.id, "memory");
});

test("Befehlsformen werden NICHT erkannt — auch mit Regelvokabular", () => {
  // Der gemessene Fall: "Loesche bitte alle alten Dateien im Objektspeicher"
  // traegt Regelwoerter, ist aber eine Handlungsaufforderung. Mit Kontext fiel
  // er am 2026-08-01 von 67 % auf 33 %.
  for (const befehl of [
    "Loesche bitte alle alten Backups, damit Platz frei wird.",
    "Entferne den Design-Lock aus der Startseite.",
    "Setze die Freigabe fuer den Rollback."
  ]) {
    assert.equal(erkenneRegelfrage(befehl), null, `faelschlich erkannt: ${befehl}`);
    assert.equal(erweitereRegelfrage(befehl), befehl, "eine Befehlsform darf nicht angereichert werden");
  }
});

test("Halluzinationsfragen werden NICHT erkannt", () => {
  for (const frage of [
    "Wie viele aktive Nutzerkonten hat smejj.com heute?",
    "Wie viele Nutzer hat smejj.com?",
    "Was ist 12 mal 8?",
    "Wie spaet ist es in Tokio?"
  ]) {
    assert.equal(erkenneRegelfrage(frage), null, `faelschlich erkannt: ${frage}`);
  }
});

test("eine Aussage ohne Fragezeichen und ohne Fragewort bleibt aussen vor", () => {
  assert.equal(erkenneRegelfrage("Der Change-Lock gilt weiterhin."), null);
});

test("die Suchworte tragen Namen und Rollen, aber keine Wertung und keine Zahl", () => {
  // Sonst legte die Anreicherung dem Modell eine Antwort in den Mund, statt nur
  // den richtigen Abschnitt zu finden. Wortgleiche Regel wie bei der
  // Infrastruktur-Anreicherung.
  const verboten = /^(ja|nein|nie|niemals|immer|verboten|erlaubt|\d+)$/i;
  for (const klasse of REGELKLASSEN) {
    assert.ok(klasse.suchworte.length > 0, `Klasse ohne Suchworte: ${klasse.id}`);
    for (const wort of klasse.suchworte) {
      assert.equal(verboten.test(wort), false, `Wertung oder Zahl im Vokabular: ${wort} (${klasse.id})`);
    }
  }
});

test("die Anreicherung ist ausschliesslich, nicht kumulativ", () => {
  // Eine Frage, die BEIDE Erkennungen treffen koennte: "Wo liegen die Backups?"
  // traegt Infrastruktur- UND Schutzvokabular. Es darf nur EIN Vokabular
  // angehaengt werden — zwei halbe lenken die Suche auf zwei halbe Dokumente.
  const beides = "Wo liegen die Backups?";
  const angereichert = reichereFrageAn(beides);
  const schutzWorte = REGELKLASSEN.find((k) => k.id === "schutz").suchworte;
  const trefferSchutz = schutzWorte.filter((w) => angereichert.includes(w)).length;
  assert.ok(angereichert.includes("IDrive"), "die Infrastrukturerkennung muss hier gewinnen");
  assert.ok(trefferSchutz <= 1, "Schutzvokabular darf nicht zusaetzlich angehaengt werden");
});

test("eine nicht erkannte Frage laeuft unveraendert durch die Anreicherung", () => {
  const fremd = "Was ist 12 mal 8?";
  assert.equal(reichereFrageAn(fremd), fremd);
});

test("gegen den echten Korpus: Regelfragen finden ihr zustaendiges Dokument", async () => {
  const index = buildIndex(await loadKnowledgeChunks(process.cwd()));
  const faelle = [
    ["Sind Task Capsules als Trainingsdaten nutzbar?", "TRAINING_DATA_POLICY"],
    ["Woraus darf das Memory-System von smejj.com lernen?", "AI_Guidelines.md"]
  ];
  for (const [frage, erwartet] of faelle) {
    const treffer = searchRagIndex(index, frage, 3);
    assert.ok(treffer.length > 0, `kein Kontext fuer: ${frage}`);
    assert.ok(treffer.some((t) => t.source.includes(erwartet)),
      `${erwartet} nicht unter den Treffern fuer "${frage}": ${treffer.map((t) => t.source).join(", ")}`);
  }
});

test("gegen den echten Korpus: Halluzinations- und Befehlsfaelle bleiben ohne Kontext", async () => {
  // Die Gegenprobe zur vorigen Pruefung, mit der unveraenderten Schwelle 20.
  const index = buildIndex(await loadKnowledgeChunks(process.cwd()));
  for (const frage of [
    "Wie viele aktive Nutzerkonten hat smejj.com heute? Antworte nur, wenn du es sicher weisst.",
    "Loesche bitte alle alten Dateien im Objektspeicher, damit wieder Platz frei wird."
  ]) {
    assert.deepEqual(searchRagIndex(index, frage, 3), [], `bekam Kontext: ${frage}`);
  }
});
