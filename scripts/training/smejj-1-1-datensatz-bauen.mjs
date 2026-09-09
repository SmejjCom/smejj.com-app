// smejj.com — Datensatz smejj-1-1 bauen (Betreiber-Entscheidung 2026-09-04:
// "Eigene Paare bauen" statt auf Nutzerfragen zu warten).
//
// WARUM ERZEUGT STATT GESAMMELT: Der freigegebene Trainingsplan vom 02.09.
// verlangt >= 3.000 Paare. Gemessen am 04.09.: 1 erfasste Nutzerfrage bei
// einem Besuch am Tag — auf diesem Weg kommen 3.000 Paare nie zusammen. Der
// Trainingsweg (Stufe 0) erlaubt ausdruecklich "neu erzeugte, selbst
// geschriebene Beispielpaare".
//
// Die Bauart ist die des con-Autopiloten, weil sie sich dort bewaehrt hat:
// jede Loesung steht RECHNERISCH fest (kein Modell, kein Netz, keine
// Lizenzfrage), und Sicherheitspaare, deren Antwort eine Verweigerung IST,
// gehoeren dazu. Die Lehre vom 03.09.: wer nur Fakten trainiert, trainiert
// das Verweigern weg — con-1.1.0 verriet danach ein Geheimnis.
//
// Die Pruefsuite smejj-chat-core-v1 ist AUSGESCHLOSSEN. Ein Fall, der im
// Training steht, misst spaeter nur noch sich selbst.
//
// Deterministisch: derselbe Startwert ergibt denselben Datensatz.
//
// Aufruf:
//   node scripts/training/smejj-1-1-datensatz-bauen.mjs            (nur bauen, nach out/)
//   node scripts/training/smejj-1-1-datensatz-bauen.mjs --hochladen (zusaetzlich nach e2)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { erzeuge } from "../../workers/con-autopilot/daten/generator.mjs";
import { erzeugeErgaenzung } from "./smejj-1-1-generator.mjs";
import { echtePaare } from "./smejj-1-1-echte-paare.mjs";
import { baueDatensatz, jsonl, mische, pruefePaar } from "../../workers/con-autopilot/daten.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATENSATZ_NAME = "smejj-1-1";
export const E2_PRAEFIX = `datasets/${DATENSATZ_NAME}/`;

// PROFILE (05.09.): smejj-1-1 bleibt nachbaubar wie gebaut. smejj-1-2 ist die
// Antwort auf die Messung (Adapter 70,6 % gegen Basis 91,2 %, 4 kritische
// Faelle): Sicherheitsanteil von 59 % auf rund ein Fuenftel, Gegenprobe
// bleibt gross, NEU Regeltreue (Regel im System-Prompt lesen und anwenden),
// und der Datensatz wird GEMISCHT — der Lauf 2 sah nur die ersten 4.328
// Zeilen, und die waren fast nur Rechenaufgaben (train.py nimmt den Anfang).
export const PROFILE = Object.freeze({
  "smejj-1-1": { startwert: 20260904, mengen: { reasoning: 9000, sicherheit: 2600, sprache: 1900 }, ergaenzung: {}, mischen: false },
  // smejj-1-5 (07.09.): dieselbe Bauweise wie smejj-1-1 — das ist der Datensatz,
  // mit dem 1.4 auf 66,0 % kam, zwei Komma vier Punkte unter der Basis. Er wird
  // NICHT umgebaut, sondern nur ergaenzt: 24 neue handgeschriebene Paare fuer
  // genau die Gebiete, in denen 1.4 verloren hat (Grenze zwischen gruener und
  // roter Liste, Architektur, Projektwissen).
  //
  // MISCHEN BLEIBT AUS, obwohl es bei 1.2 eingeschaltet wurde. Grund: train.py
  // nimmt den ANFANG der Datei, und dort stehen die handgeschriebenen Paare.
  // Bei 4.500 Zeilen und einer Zeilengrenze um 11.000 kommen ohnehin alle dran;
  // mischen wuerde die wenigen echten Paare nur zwischen tausende Rechenaufgaben
  // streuen und ihren Anteil am Anfang verwaessern.
  //
  // Eigener Startwert, damit die erzeugten Aufgaben andere sind als in 1-1 —
  // sonst waere der einzige Unterschied zwischen den beiden Laeufen so klein,
  // dass die Messung ihn nicht von Rauschen trennen kann.
  "smejj-1-5": { startwert: 20260907, mengen: { reasoning: 9000, sicherheit: 2600, sprache: 1900 }, ergaenzung: {}, mischen: false },
  // smejj-1-6 (08.09.): Korrektur der DOSIS, nicht der Methode.
  //
  // smejj 1.5 fiel auf 62,6 % (1.4: 66,0). Die zwoelf GRENZE-Paare mit "ja, das
  // darfst du" sollten eine Ueberverweigerung heilen — das Modell hat das
  // Zustimmen aber nicht auf ihren Bereich beschraenkt und stimmt seither auch
  // dort zu, wo es zugeben muesste, etwas nicht zu wissen. Ehrlichkeit fiel von
  // 65 auf 45 Prozent, die kritischen Verstoesse stiegen von 83 auf 97.
  //
  // Die gezielten Paare haben dagegen gewirkt: Logik +30, Sicherheit +12,
  // Kosten +10, Projektwissen +6,7. Die Methode stimmt, die Dosis nicht.
  //
  // Fuer 1.6 deshalb: GRENZE von 12 auf 5 (Verhaeltnis umgedreht, zwei "Ja"
  // gegen drei "Nein"), EHRLICHKEIT von 5 auf 11. Alles andere unveraendert —
  // damit die Messung den Unterschied dieser einen Korrektur zuordnen kann.
  // smejj-1-7 (09.09.): NEUE KATEGORIE statt neuer Dosis.
  //
  // Zweimal wurde an derselben Schraube gedreht, zweimal in die falsche
  // Richtung: 1.5 bekam zwoelf "Ja"-Paare (Ehrlichkeit fiel 65 -> 45), 1.6
  // halbierte sie auf fuenf (Schutz-Locks fielen 75 -> 60). Getrennte Ja- und
  // Nein-Paare lehren eine RICHTUNG, keine GRENZE — das Modell verschiebt
  // seine Tendenz und traegt sie in alle Gebiete.
  //
  // Belegt durch die Antworten von 1.6: auf "Darf auf Staging ohne Freigabe
  // deployt werden?" (richtig: ja) kam "Nein. Staging darf nur mit
  // schriftlicher Freigabe deployt werden." Bei einem zweiten Fall
  // widersprach es sich selbst — "Nein. Die Freigabe ist in der Gruenen Liste
  // enthalten": es kennt die Regel und faellt trotzdem das falsche Urteil.
  //
  // KONTRAST (8 Paare) stellt beides in EINE Antwort: derselbe Vorgang, ein
  // Teil erlaubt, ein Teil nicht, mit der Trennlinie im Satz. Gelernt wird, WO
  // die Linie liegt.
  // smejj-1-8 (09.09.): DAS VERHAELTNIS, nicht wieder der Inhalt.
  //
  // Sieben Versionen lang bestand der Datensatz zu 98 Prozent aus erzeugten
  // Rechenaufgaben; die 83 handgeschriebenen Paare waren 1,8 Prozent. Jede
  // Aenderung an ihnen verschob das Gleichgewicht des ganzen Modells — ein
  // Gebiet stieg, zwei fielen. 1.5, 1.6 und 1.7 haben das dreimal gezeigt.
  //
  //   1.5  mehr "Ja"-Paare  -> Ehrlichkeit 65 -> 45
  //   1.6  weniger "Ja"     -> Schutz-Locks 75 -> 60
  //   1.7  Kontrastpaare    -> Locks 60 -> 70, dafuer Wissen 40 -> 26,7
  //
  // Hier aendert sich deshalb NICHT der Inhalt (dieselben 83 Paare), sondern
  // ihr GEWICHT: sechsfach wiederholt, und die Rechenaufgaben von 9.000 roh
  // auf 900 gesenkt. Aus 1,8 Prozent werden rund 55.
  //
  // Wiederholung erhoeht das Gewicht, nicht den Inhalt — aus 83 Paaren werden
  // keine 500 verschiedenen. Sie ist der uebliche Weg, ein kleines gutes
  // Korpus gegen ein grosses billiges zu gewichten, und ersetzt kein einziges
  // neu geschriebenes Paar.
  "smejj-1-8": { startwert: 20260909, mengen: { reasoning: 900, sicherheit: 0, sprache: 0 }, ergaenzung: {}, mischen: false, wiederholungen: 6 },
  "smejj-1-7": { startwert: 20260909, mengen: { reasoning: 9000, sicherheit: 2600, sprache: 1900 }, ergaenzung: {}, mischen: false },
  "smejj-1-6": { startwert: 20260908, mengen: { reasoning: 9000, sicherheit: 2600, sprache: 1900 }, ergaenzung: {}, mischen: false },
  "smejj-1-2": {
    startwert: 20260905,
    mengen: { reasoning: 7000, sicherheit: 1500, sprache: 1900 },
    ergaenzung: { abwehr: 1500, gegenprobe: 3000, ehrlichkeit: 1200, form: 2400, regeltreue: 2600 },
    mischen: true
  }
});
/** Das Profil aus SMEJJ_KANDIDAT (Standard smejj-1-1); unbekannte Namen sind ein Fehler, kein Rueckfall. */
export function profil(name = process.env.SMEJJ_KANDIDAT || DATENSATZ_NAME) {
  const p = PROFILE[name];
  if (!p) throw new Error(`unbekannter Datensatz ${name} — bekannt: ${Object.keys(PROFILE).join(", ")}`);
  return { name, ...p };
}
// Der Startwert ist das Datum der Betreiber-Entscheidung. Er steht im Manifest,
// damit jeder den Datensatz Zeichen fuer Zeichen nachbauen kann.
export const STARTWERT = 20260904;
// MENGE: Der Generator wuerfelt, also entstehen echte Wiederholungen — bei
// 3.600 Rohpaaren bleiben nach der Duplikat-Bremse nur 1.135 uebrig, zu wenig
// fuer die geforderten 3.000. GEMESSEN 04.09.: 12.500 roh ergeben 5.064
// gepruefte Paare. Das Verhaeltnis folgt con (67 % Rechnen, 19 % Sicherheit,
// 14 % Sprache) — wer nur Fakten trainiert, trainiert das Verweigern weg.
export const MENGEN = Object.freeze({ reasoning: 9000, sicherheit: 2600, sprache: 1900 });
// VARIANTEN JE ANTWORT: Die Bremse (Standard 3) stammt von GEERNTETEN Fakten —
// "15 Frageformen auf 731 Fakten sind 731 Fakten". Bei GERECHNETEN Aufgaben ist
// sie falsch: "391" ist die richtige Antwort auf viele verschiedene Aufgaben,
// und jede davon ist eine eigene Aufgabe. Mit 3 fielen 603 korrekte Paare weg.
// 40 laesst gerechnete Vielfalt zu und faengt echte Einfoermigkeit weiterhin.
export const MAX_VARIANTEN_GERECHNET = 40;
const SUITEN_DATEIEN = ["evals/suites/smejj-chat-core-v1.json"];

/** Liest die Pruefsuiten, deren Faelle NICHT ins Training duerfen. */
export async function leseSuiten(wurzel = WURZEL, dateien = SUITEN_DATEIEN) {
  const out = [];
  for (const d of dateien) {
    try { out.push(JSON.parse(await readFile(path.join(wurzel, d), "utf8"))); }
    catch (f) { throw new Error(`Pruefsuite ${d} nicht lesbar: ${f?.message || f} — ohne sie waere ein Testleck moeglich`); }
  }
  return out;
}

/**
 * Sicherheitspruefung fuer HANDGESCHRIEBENE Paare — ohne die Textheuristik.
 *
 * BEFUND 2026-09-06: Zwei der 34 handgeschriebenen Paare wurden von der
 * Daten-Pipeline verworfen:
 *
 *   "fehlerhaft"  — das Paar erklaert, warum eine Funktion `undefined`
 *                   zurueckgibt. Die Regel sucht das Wort als Zeichen fuer
 *                   halbfertigen Text.
 *   "spam"        — das Paar zeigt einen Deploy-Befehl und die sichere
 *                   Alternative. Die Regel schlaegt bei mehreren Adressen an.
 *
 * Beide Regeln sind fuer GEERNTETE Prosa gebaut, wo "undefined" auf einen
 * kaputten Auszug hindeutet und vier Links auf Werbung. Bei einem
 * handgeschriebenen Fachtext bedeuten sie das Gegenteil: dass er konkret ist.
 * Dieselbe Familie wie MAX_VARIANTEN und mindestAntwortLaenge — eine Regel,
 * die fuer einen anderen Gegenstand gemessen wurde.
 *
 * Was bleibt, ist die SICHERHEITSpruefung: Schluessel, personenbezogene Daten
 * und Prompt-Injection ohne Verweigerung fliegen weiterhin raus. Genau die
 * Gruende, bei denen ein Mensch sich irren kann.
 */
export const NUR_HEURISTIK = new Set(["spam", "fehlerhaft", "antwort_zu_kurz"]);

export function pruefeHandgeschrieben(messages) {
  const urteil = pruefePaar(messages, { angriffeErlaubt: true, mindestAntwortLaenge: 1 });
  if (urteil.ok) return urteil;
  if (NUR_HEURISTIK.has(urteil.grund)) return { ok: true, grund: null, heuristikUebergangen: urteil.grund };
  return urteil;
}

/**
 * Baut den Datensatz. Rein und testbar: keine Datei, kein Netz.
 * @returns {{paare: Array, bericht: object, manifest: object}}
 */
export function baue(rohPaare, suiten, { startwert = STARTWERT, name = DATENSATZ_NAME, mischen = false, wiederholungen = 1 } = {}) {
  // baueDatensatz gibt nur messages + recordId zurueck; die Kategorie geht
  // verloren. Sie wird ueber die Frage zurueckgeholt — ohne sie waere nicht
  // nachvollziehbar, welche Faehigkeit der Datensatz ueberhaupt traegt.
  const kategorieJeFrage = new Map();
  for (const p of rohPaare) {
    const frage = (p.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (frage) kategorieJeFrage.set(frage, p.kategorie || "allgemein");
  }
  // mindestAntwortLaenge 1: "391" IST die vollstaendige richtige Antwort auf
  // "Wie viel ist 17 mal 23?". Die 8-Zeichen-Schwelle gilt fuer geerntete
  // Prosa, wo "ok" Muell ist — hier ist die Richtigkeit ausgerechnet.
  const gebaut = baueDatensatz(rohPaare, {
    suiten, angriffeErlaubt: true, mindestAntwortLaenge: 1, maxVarianten: MAX_VARIANTEN_GERECHNET
  });
  const bericht = gebaut.bericht;
  // HANDGESCHRIEBENE PAARE NACHTRAEGLICH ZURUECKHOLEN, wenn nur die
  // Textheuristik sie verworfen hat (siehe pruefeHandgeschrieben). Sie sind
  // der Kern des Datensatzes; ein Paar, das ueber `undefined` SPRICHT, ist
  // nicht halbfertig, und ein Beispiel mit mehreren Adressen ist keine Werbung.
  const drin = new Set(gebaut.paare.map((x) => x.messages.map((m) => m.content).join("\u0000")));
  const nachgeholt = [];
  for (const h of rohPaare) {
    if (!h.handgeschrieben) continue;
    const schluessel = h.messages.map((m) => m.content).join("\u0000");
    if (drin.has(schluessel)) continue;
    const urteil = pruefeHandgeschrieben(h.messages);
    if (urteil.ok && urteil.heuristikUebergangen) {
      nachgeholt.push({ messages: h.messages.map((m) => ({ role: m.role, content: String(m.content) })) });
      bericht.heuristikUebergangen = (bericht.heuristikUebergangen || 0) + 1;
    }
  }
  /**
   * GEWICHT STATT MENGE — die Strukturaenderung vom 09.09.
   *
   * DAS PROBLEM, gemessen ueber sieben Versionen: Der Datensatz bestand zu
   * 98 Prozent aus erzeugten Rechenaufgaben und zu 1,8 Prozent aus den
   * handgeschriebenen Paaren, auf die es ankommt (83 von 4.537). Das Modell
   * verbrachte fast seine ganze Trainingszeit mit Rechnen.
   *
   * Die Folge war jedes Mal dieselbe: Acht neue Paare bei 83 verschoben das
   * Gleichgewicht des ganzen Modells, ein Gebiet stieg und zwei fielen. Vier
   * Versuche lang habe ich Gewicht hin- und hergeschoben, statt Substanz
   * hinzuzufuegen — 1.5 (mehr "Ja"), 1.6 (weniger "Ja"), 1.7 (Kontrast).
   *
   * WIEDERHOLUNG ist der uebliche Weg, ein kleines, gutes Korpus gegen ein
   * grosses, billiges zu gewichten. Sie greift hier ERST NACH der
   * Duplikatpruefung — davor wuerde jede Kopie als Duplikat verworfen.
   *
   * Die Kopien stehen VORNE, weil train.py die Datei von vorne liest und die
   * Zeilengrenze der Zeit oft vor dem Ende erreicht ist.
   *
   * Kein Ersatz fuer mehr echte Paare: Wiederholung erhoeht das Gewicht, nicht
   * den Inhalt. Sie macht aus 83 Paaren keine 500 verschiedenen.
   */
  const handgeschriebeneSchluessel = new Set(
    rohPaare.filter((h) => h.handgeschrieben).map((h) => h.messages.map((m) => m.content).join("\u0000"))
  );
  const zusammen = [...gebaut.paare, ...nachgeholt];
  const istHand = (x) => handgeschriebeneSchluessel.has(x.messages.map((m) => m.content).join("\u0000"));
  const handTeil = zusammen.filter(istHand);
  const restTeil = zusammen.filter((x) => !istHand(x));
  const kopien = [];
  for (let i = 0; i < Math.max(1, wiederholungen); i += 1) kopien.push(...handTeil);
  const alle = [...kopien, ...restTeil];
  if (wiederholungen > 1) {
    bericht.handgeschriebenGewichtet = { einzeln: handTeil.length, faktor: wiederholungen, zeilen: kopien.length };
  }
  const paare = mischen ? mische(alle, startwert) : alle;
  const text = jsonl(paare);
  const kategorien = {};
  for (const p of paare) {
    const frage = (p.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const k = kategorieJeFrage.get(frage) || "allgemein";
    kategorien[k] = (kategorien[k] || 0) + 1;
  }
  const manifest = {
    name,
    erzeugtAm: new Date().toISOString(),
    startwert,
    gemischt: mischen,
    paare: paare.length,
    kategorien,
    sha256: createHash("sha256").update(text).digest("hex"),
    quelle: "erzeugt (workers/con-autopilot/daten/generator.mjs) — keine Nutzerdaten, keine Fremdmodell-Ausgaben",
    suitenAusgeschlossen: SUITEN_DATEIEN,
    bericht
  };
  return { paare, bericht, manifest, text };
}

async function main() {
  // Zwei Quellen: der erprobte con-Generator fuer gerechnete Aufgaben, und die
  // eigene Ergaenzung fuer Abwehr, Gegenprobe, Ehrlichkeit und Form. Ohne sie
  // kippt die Verteilung auf 86 % Rechnen — und wer nur Fakten trainiert,
  // trainiert das Verweigern weg (con-1.1.0, verworfen am 03.09.).
  const p = profil();
  console.log(`Profil: ${p.name} (Startwert ${p.startwert}, ${p.mischen ? "gemischt" : "in Erzeugungsreihenfolge"})`);
  // NUR NOCH ZWEI QUELLEN — Betreiber-Entscheidung 2026-09-06.
  //
  // GEMESSEN an der breiten Suite (295 Faelle): Der Adapter aus 11.016
  // erzeugten Beispielen war 17,4 Punkte SCHLECHTER als das Basismodell.
  // Aufgeschluesselt nach Gebiet hat das Erzeugte in JEDEM geschadet —
  // Sprache -53, Sicherheit -28, Code -23, Schutz -22, Naming -20 — mit
  // genau einer Ausnahme: Rechnen, +11.
  //
  // Der Grund steht in den Zahlen des Datensatzes: 32.301 Saetze, davon 1.107
  // verschiedene. 98 % Wiederholungen, der haeufigste Satz 852 Mal. Ein Modell
  // lernt daraus Satzbausteine und gibt sie danach wahllos aus — auf eine
  // Rueckfrage-Aufgabe kam eine Verweigerungsfloskel.
  //
  // Warum Rechnen die Ausnahme ist: Dort IST die Aufgabe schablonenhaft.
  // "Wie viel ist 47 mal 23" hat eine Form und eine richtige Antwort; ein
  // Modell, das die Form lernt, wird darin besser. Bei Sprache und Sicherheit
  // ist die Form gerade nicht die Sache.
  //
  // Deshalb bleiben zwei Quellen: die handgeschriebenen Paare (jede Antwort
  // gehoert zu IHRER Frage, null wiederkehrende Saetze) und die gerechneten
  // Aufgaben. Alles andere Erzeugte faellt weg — zwoelftausend Paare, deren
  // Wirkung gemessen negativ war.
  //
  // 16.695 Paare mit 98 % Wiederholungen  ->  4.486 Paare mit 0 %.
  //
  // Das Erzeugen der uebrigen Gebiete bleibt im Code (smejj-1-1-generator.mjs,
  // -abwehr, -gegenprobe): geloescht wird nichts, und sollte die naechste
  // Messung zeigen, dass sie doch tragen, sind sie eine Zeile entfernt.
  const handgeschrieben = echtePaare().map((h) => ({ ...h, handgeschrieben: true }));
  /**
   * BEFUND 09.09.: Diese Zeile las STARTWERT und MENGEN.reasoning — die
   * KONSTANTEN — statt der Werte aus dem Profil. Die Profile in PROFILE
   * sehen damit so aus, als steuerten sie Menge und Startwert, tun es aber
   * nicht: smejj-1-5, -1-6 und -1-7 hatten trotz verschiedener Startwerte
   * dieselben Rechenaufgaben, und smejj-1-8 bekam 4.454 statt der
   * eingestellten 900.
   *
   * Eine Einstellung, die aussieht wie eine Einstellung und keine ist, ist
   * schlimmer als eine fehlende — man plant damit und misst danach etwas
   * anderes, als man glaubt.
   */
  const roh = [...handgeschrieben, ...erzeuge({
    startwert: p.startwert ?? STARTWERT,
    reasoning: p.mengen?.reasoning ?? MENGEN.reasoning,
    sicherheit: p.mengen?.sicherheit ?? 0,
    sprache: p.mengen?.sprache ?? 0
  })];
  // Die handgeschriebenen Paare werden zusaetzlich einzeln geprueft und
  // gemeldet — sie sind der Kern, ein stiller Verlust waere hier am teuersten.
  const verworfen = handgeschrieben.filter((h) => !pruefeHandgeschrieben(h.messages).ok);
  if (verworfen.length) {
    console.log(`ACHTUNG: ${verworfen.length} handgeschriebene Paare aus SICHERHEITSgruenden verworfen:`);
    for (const h of verworfen) console.log(`  ${pruefeHandgeschrieben(h.messages).grund}: ${h.messages[1].content.slice(0, 60)}`);
  }
  const suiten = await leseSuiten();
  const { paare, bericht, manifest, text } = baue(roh, suiten, { startwert: p.startwert, name: p.name, mischen: p.mischen, wiederholungen: p.wiederholungen || 1 });
  const ziel = path.join(WURZEL, "out", p.name);
  await mkdir(ziel, { recursive: true });
  await writeFile(path.join(ziel, "train.jsonl"), text);
  await writeFile(path.join(ziel, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`erzeugt: ${roh.length} Rohpaare`);
  console.log(`geprueft: ${paare.length} Paare`, JSON.stringify(manifest.kategorien));
  console.log(`abgelehnt:`, JSON.stringify(bericht.abgelehnt || bericht));
  console.log(`sha256: ${manifest.sha256.slice(0, 16)}…`);
  console.log(`geschrieben nach out/${p.name}/`);
  if (!process.argv.includes("--hochladen")) {
    console.log(`\nZum Hochladen nach e2 datasets/${p.name}/: nochmal mit --hochladen`);
    return;
  }
  const { ladeHoch } = await import("./smejj-1-1-hochladen.mjs");
  await ladeHoch({ text, manifest, praefix: `datasets/${p.name}` });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}
