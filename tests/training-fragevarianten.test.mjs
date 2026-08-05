// smejj.com — Tests der Fragevarianten-Pruefung.
// Ohne Netz, ohne Schluessel, ohne Dateizugriff auf den echten Korpus.
import test from "node:test";
import assert from "node:assert/strict";
import {
  FRAGE_MAX_ZEICHEN,
  faktSchluessel,
  HERKUNFT,
  laengsteGemeinsameFolge,
  MAX_UEBERLAPPUNG,
  pruefeEintrag,
  pruefeSammlung,
  ueberlappung
} from "../src/training/projectcorpus/fragevarianten.js";

const GUT = {
  quelle: "AI_Guidelines.md",
  ueberschrift: "6. Memory System",
  antwort: "Memory darf ausschliesslich aus erfolgreich validierten Ergebnissen lernen.",
  fragen: [
    { text: "Woraus zieht das Gedaechtnis seine Eintraege?", herkunft: HERKUNFT.HAND, erfasstAm: "2026-08-05" },
    { text: "Darf ein fehlgeschlagener Build gespeichert werden?", herkunft: HERKUNFT.NUTZERFRAGE, erfasstAm: "2026-08-05" }
  ]
};

test("ein sauberer Eintrag besteht", () => {
  assert.deepEqual(pruefeEintrag(GUT), { ok: true, gruende: [] });
});

test("modellerzeugte Fragen sind gesperrt — auch wenn sie gut aussehen", () => {
  // Die zentrale Regel. Sie richtet sich ausdruecklich auch gegen den Agenten,
  // der dieses Geruest gebaut hat: ein Modell, das auf seinen eigenen Fragen
  // trainiert, lernt nur seine eigene Verteilung.
  for (const herkunft of ["modell", "glm", "kimi", "generiert", "", undefined, null, "HAND"]) {
    const eintrag = { ...GUT, fragen: [{ text: "Eine formal einwandfreie Frage zum Thema?", herkunft }] };
    const urteil = pruefeEintrag(eintrag);
    assert.equal(urteil.ok, false, `unzulaessige Herkunft durchgelassen: ${String(herkunft)}`);
    assert.ok(urteil.gruende.some((g) => g.startsWith("herkunft_unzulaessig")));
  }
});

test("Varianten muessen sich in der FORM unterscheiden", () => {
  // Zwei Fragen, die sich in einem Wort unterscheiden, verdreifachen nur die
  // Zeilenzahl — genau der Fehler der drei fest verdrahteten Schablonen.
  const fastGleich = {
    ...GUT,
    fragen: [
      { text: "Woraus zieht das Gedaechtnis seine Eintraege?", herkunft: HERKUNFT.HAND },
      { text: "Woraus zieht das Gedaechtnis die Eintraege?", herkunft: HERKUNFT.HAND }
    ]
  };
  assert.ok(pruefeEintrag(fastGleich).gruende.includes("zu_aehnlich"));
  assert.equal(pruefeEintrag(GUT).ok, true, "echte Formvielfalt muss bestehen");
});

test("die Frage darf die Antwort nicht schon enthalten", () => {
  const verraeterisch = {
    ...GUT,
    fragen: [{
      text: "Stimmt es, dass Memory ausschliesslich aus erfolgreich validierten Ergebnissen lernen darf?",
      herkunft: HERKUNFT.HAND
    }]
  };
  assert.ok(pruefeEintrag(verraeterisch).gruende.includes("antwortverrat"));
});

test("Laenge und Fragezeichen werden geprueft", () => {
  const kurz = { ...GUT, fragen: [{ text: "Was?", herkunft: HERKUNFT.HAND }] };
  assert.ok(pruefeEintrag(kurz).gruende.includes("frage_zu_kurz"));

  const lang = { ...GUT, fragen: [{ text: `${"a".repeat(FRAGE_MAX_ZEICHEN + 1)}?`, herkunft: HERKUNFT.HAND }] };
  assert.ok(pruefeEintrag(lang).gruende.includes("frage_zu_lang"));

  const aussage = { ...GUT, fragen: [{ text: "Das Gedaechtnis lernt aus validierten Ergebnissen.", herkunft: HERKUNFT.HAND }] };
  assert.ok(pruefeEintrag(aussage).gruende.includes("kein_fragezeichen"));
});

test("fehlende Pflichtfelder fallen durch, statt still zu gelten", () => {
  assert.ok(pruefeEintrag({ ...GUT, quelle: "" }).gruende.includes("quelle_fehlt"));
  assert.ok(pruefeEintrag({ ...GUT, ueberschrift: "" }).gruende.includes("ueberschrift_fehlt"));
  assert.ok(pruefeEintrag({ ...GUT, fragen: [] }).gruende.includes("keine_fragen"));
  assert.deepEqual(pruefeEintrag(null), { ok: false, gruende: ["eintrag_ungueltig"] });
});

test("die Sammlung trennt angenommen von abgelehnt und rechnet nach", () => {
  const { angenommen, abgelehnt, kennzahlen } = pruefeSammlung({
    eintraege: [GUT, { ...GUT, ueberschrift: "7. Kosten", fragen: [{ text: "Eine Frage?", herkunft: "modell" }] }]
  });
  assert.equal(angenommen.length, 1);
  assert.equal(abgelehnt.length, 1);
  assert.equal(kennzahlen.fragen, 2, "gezaehlt werden nur die Fragen der angenommenen Eintraege");
  assert.equal(kennzahlen.fragenJeFakt, 2);
});

test("die ausgelieferte Sammlung ist leer und gueltig", async () => {
  // Bewusst leer: das Geruest darf nicht mit modellerzeugten Fragen vorbefuellt
  // sein. Ein spaeterer Lauf soll hier echte Eintraege sehen, keine Attrappen.
  const { readFile } = await import("node:fs/promises");
  const roh = JSON.parse(await readFile(new URL("../training-fragen/varianten.json", import.meta.url), "utf8"));
  assert.equal(roh.schemaVersion, 1);
  assert.deepEqual(roh.eintraege, [], "die Sammlung wird leer ausgeliefert");
  assert.equal(pruefeSammlung(roh).kennzahlen.abgelehnt, 0);
});

test("Hilfsmasse rechnen wie erwartet", () => {
  assert.equal(ueberlappung("das ist eine frage", "das ist eine frage"), 1);
  assert.equal(ueberlappung("voellig andere woerter hier", "nichts davon kommt vor"), 0);
  assert.ok(ueberlappung("woraus lernt das gedaechtnis", "woraus lernt das system") > MAX_UEBERLAPPUNG - 0.3);
  assert.equal(laengsteGemeinsameFolge("eins zwei drei vier", "null eins zwei drei"), 3);
  assert.equal(laengsteGemeinsameFolge("gar nichts", "voellig anders"), 0);
  assert.equal(faktSchluessel("AGENTS.md", "Change-Lock"), "AGENTS.md#Change-Lock");
});
