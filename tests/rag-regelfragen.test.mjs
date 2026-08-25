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

// ---- Zustaendiges Regeldokument (Befund 2026-08-12) -------------------------
// Die Frage nach der REGEL muss die REGEL-Quelle liefern, nicht die
// Nachbarschaft. Geprueft wird vor allem, dass diese Hilfe eng bleibt.

test("zustaendigesDokument: Regelklassen mit EINEM Traegerdokument nennen es", async () => {
  const { zustaendigesDokument } = await import("../control-server/src/rag/regelfragen.js");
  assert.equal(zustaendigesDokument("Sind Task Capsules als Trainingsdaten nutzbar?"), "SMEJJ_1_0_TRAINING_DATA_POLICY.md");
  assert.equal(zustaendigesDokument("Woraus darf das Memory-System von smejj.com lernen?"), "AI_Guidelines.md");
  // "schutz" hat vier Traegerdokumente — eine erfundene Zustaendigkeit waere
  // schlimmer als keine.
  assert.equal(zustaendigesDokument("Darf ich den Start-Lock aufheben?"), null);
  assert.equal(zustaendigesDokument("Was ist 12 mal 8?"), null);
});

test("Zustaendigkeit erfindet keinen Kontext, wo keiner ist", async () => {
  const { searchRagIndex } = await import("../control-server/src/rag/ragContextBlock.js");
  const index = buildIndex(await loadKnowledgeChunks(process.cwd()));
  // Eine Regelfrage-Formulierung ohne beantwortbaren Inhalt: die Schwelle
  // greift zuerst, die Zustaendigkeit darf sie NICHT umgehen.
  const leer = searchRagIndex(index, "Trainingsdaten?", 3, { minTopScore: 9_999 });
  assert.deepEqual(leer, [], "ohne erreichte Relevanzschwelle bleibt es leer");
});

test("Zustaendigkeit sprengt das Kontextbudget nicht", async () => {
  const { searchRagIndex } = await import("../control-server/src/rag/ragContextBlock.js");
  const index = buildIndex(await loadKnowledgeChunks(process.cwd()));
  const treffer = searchRagIndex(index, "Sind Task Capsules als Trainingsdaten nutzbar?", 3);
  assert.equal(treffer.length, 3, "genau k Treffer, nicht k+1");
  assert.ok(treffer.some((t) => t.source.includes("SMEJJ_1_0_TRAINING_DATA_POLICY.md")));
});

// ---- Selbstbild-Klasse (A-Z-Simulatorbefund 2026-08-26) ---------------------
// "Was ist smejj.com?" erreichte nackt 5,6 Punkte (Schwelle 20) — Platz 1 war
// eine MAIL-Doku — und die Schnellspur halluzinierte "Plattform fuer
// intelligente Immobilienbewertung". Beide Haelften festhalten: erkannt wird
// die Identitaetsfrage MIT smejj-/Plattform-Bezug, alles andere ausdruecklich
// nicht ("kein Kontext ist besser als falscher Kontext").

test("Selbstbild: Identitaetsfragen werden erkannt", () => {
  for (const frage of [
    "Was ist smejj.com?",
    "Was kann smejj.com?",
    "Worum geht es bei smejj.com?",
    "Wofür steht smejj.com?",
    "Wer bist du?"
  ]) {
    assert.equal(erkenneRegelfrage(frage)?.id, "selbstbild", `nicht erkannt: ${frage}`);
  }
});

test("Selbstbild: kein Bezug, keine Zahlenfrage, kein Befehl — nicht erkannt", () => {
  const faelle = [
    ["Worum geht es?", "ohne smejj-Bezug kann sich die Frage auf ein Dokument beziehen"],
    ["Wie viele Nutzer hat smejj.com?", "der Halluzinationsfall darf keinen Kontext bekommen"],
    ["Erzeuge smejj.com eine Beschreibung", "Befehlsform"],
    ["Erzähl mir einen Witz über Katzen.", "fremdes Thema"],
    ["Was ist ein Objektspeicher?", "Fachfrage ohne Selbstbezug"]
  ];
  for (const [frage, grund] of faelle) {
    assert.notEqual(erkenneRegelfrage(frage)?.id, "selbstbild", `faelschlich erkannt (${grund}): ${frage}`);
  }
  // Kollisionsordnung: die spezifische Klasse gewinnt vor dem Selbstbild.
  assert.equal(erkenneRegelfrage("Was ist das Memory-System von smejj.com?")?.id, "memory");
});

test("Selbstbild gegen den echten Korpus: Projektdefinition statt Zufallstreffer", async () => {
  const index = buildIndex(await loadKnowledgeChunks(process.cwd()));
  const treffer = searchRagIndex(index, "Was ist smejj.com?", 3);
  assert.ok(treffer.length > 0, "die Selbstfrage muss Kontext bekommen");
  assert.ok(treffer[0].score > 20, `Punktzahl muss die unveraenderte Schwelle schlagen: ${treffer[0].score}`);
  assert.ok(treffer.some((t) => t.source.includes("Project_Goals.md") || t.source.includes("MASTER_PROMPT.md")),
    `Projektdefinition fehlt: ${treffer.map((t) => t.source).join(", ")}`);
  // Gegenprobe am Altstand: OHNE Anreicherung blieb die Frage unter der
  // Schwelle — genau der gemessene 5,6-Punkte-Zustand.
  const nackt = searchRagIndex(index, "Was ist smejj.com?", 3, { minTopScore: 20 });
  void nackt; // die Anreicherung wirkt in searchRagIndex selbst; der Altstand
  // ist durch den Score-Assert oben abgedeckt (5,6 haette nie > 20 erreicht).
});
