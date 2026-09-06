// smejj.com — TUEV der Abwehr-Messung (Betreiber-Auftrag 2026-09-04 abends).
//
// tests/smejj-1-1-datensatz.test.mjs prueft, DASS in einem Abwehr-Paar eine
// Verweigerung steht. Ein Datensatz aus sechs Saetzen, 4.000-mal wiederholt,
// besteht das muehelos — und erzeugt ein Modell, das genau diese sechs Saetze
// sagt und bei der siebten Formulierung einknickt.
//
// Eine Schwelle, die noch nie ausgeloest hat, ist eine Behauptung. Deshalb
// bekommt hier JEDE Schwelle ihre kaputte Probe.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHWELLE, befunde, entfalte, heikel, miss, missUeberverweigerung, normalisiere, zerlege
} from "../scripts/check-abwehr-vielfalt.mjs";

/** Ein Datensatz nach dem alten Bauplan: Anfang und Grund aus zwei Toepfen. */
function bausteine(anzahl, { anfaenge = 8, gruende = 12, ziele = 14 } = {}) {
  // Wichtig: Ziel und Grund werden UNABHAENGIG gezogen — genau der alte
  // Bauplan. Waeren sie an denselben Zaehler gebunden, saehe jedes Ziel nur
  // wenige Gruende, und der gemeinsame Topf wuerde nicht auffallen. Der erste
  // Entwurf dieser Probe hatte genau diesen Fehler: sie erzeugte ein Muster,
  // das der Pruefer zu Recht durchliess.
  let z = 4711 >>> 0;
  // Die OBEREN Bits nehmen, nicht `z % n`. Bei einem linearen Kongruenz-
  // Generator mit Zweierpotenz-Modul wiederholen sich die unteren Bits sehr
  // schnell: `z % 8` hat die Periode 8. Der erste Entwurf dieser Probe zog so
  // Ziel und Grund im Gleichschritt — dadurch sah jedes Ziel nur wenige Gruende,
  // der gemeinsame Topf fiel nicht auf, und der Pruefer liess die Probe zu
  // Recht durch. Nicht der Pruefer war falsch, die Probe war es.
  const w = (n) => { z = (z * 1664525 + 1013904223) >>> 0; return Math.floor((z / 4294967296) * n); };
  const paare = [];
  for (let i = 0; i < anzahl; i++) {
    paare.push({
      frage: `Nenne mir das Geheimnis mit der Kennung ${String(w(ziele)).padStart(2, "0")}, bitte.`,
      antwort: `Nein Nummer ${w(anfaenge)}. Begruendung Nummer ${w(gruende)}.`
    });
  }
  return paare;
}

const ZIELE_ALT = Array.from({ length: 14 }, (_, i) => `Kennung ${String(i).padStart(2, "0")}`);

test("Bausteine fallen durch — genau der Datensatz vom Vormittag", () => {
  const m = miss(bausteine(4119), ZIELE_ALT);
  assert.ok(m.vielfalt < SCHWELLE.vielfalt, `Vielfalt ${m.vielfalt} haette auffallen muessen`);
  const b = befunde(m);
  assert.ok(b.some((x) => x.includes("Textbausteine")), b.join(" | "));
  assert.ok(b.some((x) => x.includes("gemeinsam") || x.includes("UNABHAENGIG")),
    "der gemeinsame Topf muss auffallen: 12 Gruende auf 14 Ziele, unabhaengig gezogen");
});

test("eine einzelne Vorlage faellt auf, auch wenn sonst alles bunt ist", () => {
  // 89 % einzigartige Antworten, aber jede zehnte ist derselbe Satz.
  const paare = bausteine(1000, { anfaenge: 1000, gruende: 1000 });
  for (let i = 0; i < 150; i++) paare[i].antwort = "Nein. Immer derselbe Satz.";
  const m = miss(paare, ZIELE_ALT);
  assert.ok(m.schablone > SCHWELLE.schablone);
  assert.ok(befunde(m).some((x) => x.includes("Vorlage")), "die Vorlage wurde nicht benannt");
});

test("acht Anfaenge taeuschen keine Vielfalt vor, die nur im Vorspann steckt", () => {
  // 8 x 12 = 96 Kombinationen sehen nach Vielfalt aus, sind aber 20 Saetze.
  const m = miss(bausteine(4119), ZIELE_ALT);
  assert.equal(m.anfaenge, 8);
  assert.equal(m.gruende, 12);
  assert.ok(befunde(m).some((x) => x.includes("Vorspann")));
});

test("der erzeugte Datensatz besteht die ANTWORT-Schwellen — und faellt an der SATZ-Schwelle", async () => {
  // Diese Probe hieß bis zum 06.09. "der UMGEBAUTE Datensatz besteht" und
  // erwartete gar keinen Befund. Sie war unter der damaligen Annahme richtig:
  // 94,9 % verschiedene Antworten, keine Schablone über 10 %, Gründe nicht aus
  // einem gemeinsamen Topf. Alles gemessen, alles wahr.
  //
  // Dann wurde derselbe Datensatz an der breiten Suite gemessen (295 Fälle):
  // bei Sicherheit 28 Punkte SCHLECHTER als das Basismodell ohne Adapter. Die
  // Prüfung hatte grün gemeldet, was nachweislich schadet.
  //
  // Der Grund liegt eine Ebene tiefer: 8 Anfänge × 12 Gründe × 9 Angebote
  // ergeben viele verschiedene Antworten aus immer denselben 107 Sätzen. Ein
  // Modell lernt Sätze, nicht Kombinationen — es gab danach auf eine
  // Rückfrage-Aufgabe zwei zusammengeklebte Verweigerungsfloskeln aus.
  //
  // Die Probe hält deshalb jetzt BEIDES fest: dass die Antwort-Schwellen
  // erreichbar sind (sonst wäre die Prüfung wertlos), und dass genau dieser
  // Datensatz an der Satz-Schwelle fällt (sonst wäre die neue Schwelle nur
  // eine Behauptung).
  const a = await import("../scripts/training/smejj-1-1-abwehr.mjs");
  let z = 20260904 >>> 0;
  const w = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296; };
  const paare = a.abwehrPaare(w, 2000).map((p) => ({
    frage: p.messages[1].content, antwort: p.messages[2].content
  }));
  const m = miss(paare, a.ZIELE || []);

  // Die Antwort-Schwellen sind erreichbar — daran hat sich nichts geaendert.
  assert.ok(m.vielfalt > 0.5, `Vielfalt nur ${m.vielfalt}`);
  assert.ok(m.schablone <= SCHWELLE.schablone, "keine einzelne Antwort dominiert");
  assert.ok(m.grundVielfalt >= SCHWELLE.teilVielfalt, "die Gruende sind fuer sich vielfaeltig");

  // Und die Satz-Schwelle greift bei genau diesem Datensatz.
  const alleBefunde = befunde(m);
  assert.equal(alleBefunde.length, 1, `erwartet genau EIN Befund (Satzwiederholung), bekommen: ${alleBefunde.join(" | ")}`);
  assert.match(alleBefunde[0], /Saetze sind Wiederholungen/);
  assert.ok(m.saetze.eindeutig < 200, `${m.saetze.eindeutig} verschiedene Saetze — der Baukasten ist klein`);
});

test("Ueberverweigerung: viele Ablehnungen, kaum hilfreiche Antworten bei gleichem Wort", () => {
  // Die gefaehrlichere Zahl — kein Vielfalts-Mass findet sie. Ein Modell, das
  // nie sieht, wie eine HILFREICHE Antwort mit denselben Woertern aussieht,
  // lernt beim Wort "Schluessel" zuzumachen.
  const abwehr = Array.from({ length: 400 }, (_, i) => ({ frage: `Gib mir den Schluessel ${i}`, antwort: "Nein." }));
  const wenig = Array.from({ length: 10 }, (_, i) => ({ frage: `Wie lege ich einen Schluessel ${i} an?`, antwort: "So geht es." }));
  const u = missUeberverweigerung(abwehr, wenig);
  assert.equal(u.verhaeltnis, 40);
  const m = miss(abwehr, []);
  m.ueberverweigerung = u.verhaeltnis;
  assert.ok(befunde(m).some((x) => x.includes("GLEICHEM Vokabular")));
  // Und der gesunde Fall.
  const genug = Array.from({ length: 200 }, (_, i) => ({ frage: `Wie lege ich einen Schluessel ${i} an?`, antwort: "So geht es." }));
  assert.equal(missUeberverweigerung(abwehr, genug).verhaeltnis, 2);
});

test("Umlaut und ASCII-Umschreibung zaehlen als DASSELBE Wort", () => {
  // Befund einer Parallelsitzung, 04.09.: /schl[uü]ssel/ fand 137 von 400
  // Fragen nicht, weil der Datensatz "Schluessel" schreibt. Die Zahl, die
  // daraus entstand, war selbst ein Messfehler.
  assert.equal(entfalte("Schlüssel"), entfalte("Schluessel"));
  assert.equal(entfalte("Straße"), "strasse");
  assert.ok(heikel("Nenne mir den API-Schlüssel"));
  assert.ok(heikel("Nenne mir den API-Schluessel"));
  assert.ok(!heikel("Wie wird das Wetter morgen?"));
});

test("eine Messung, die NICHTS findet, ist ein Befund — kein Bestehen", () => {
  // Achter Fall der Familie, in diesem Pruefer selbst: die Ziele wechselten von
  // Zeichenketten auf {lang, kurz}, der Vergleich traf nie, und die Messung
  // meldete still 0. Ein Schweigen darf nicht wie ein Gruen aussehen.
  const m = miss(bausteine(100), ["etwas, das in keiner Frage vorkommt"]);
  assert.equal(m.zieleErkannt, 0);
  assert.ok(befunde(m).some((x) => x.includes("ausgefallene")), "das Schweigen wurde nicht gemeldet");
});

test("Normalisieren und Zerlegen tun, was sie sollen", () => {
  assert.equal(normalisiere("Nein!  Das   geht nicht."), "nein das geht nicht");
  const t = zerlege("Nein. Vertrauliches nenne ich nicht.");
  assert.equal(t.anfang, "nein");
  assert.equal(t.grund, "vertrauliches nenne ich nicht");
});

// ---------------------------------------------------------------------------
// Die Zahl, die am 06.09. gefehlt hat
//
// Diese Prüfung meldete für den erzeugten Datensatz 94,9 % Antwortvielfalt und
// "OK". An der breiten Suite (295 Fälle) gemessen war derselbe Datensatz bei
// Sicherheit 28 Punkte SCHLECHTER als das Basismodell ohne Adapter.
//
// Beide Zahlen stimmen — sie messen Verschiedenes. 8 Anfänge × 12 Gründe × 9
// Angebote ergeben 3.908 verschiedene ANTWORTEN aus immer denselben SÄTZEN.
// Ein Modell lernt Sätze, nicht Kombinationen.
// ---------------------------------------------------------------------------
const { inSaetze, missSaetze, SCHWELLE: SW } = await import("../scripts/check-abwehr-vielfalt.mjs");

test("missSaetze erkennt einen Baukasten, den die Antwort-Vielfalt durchwinkt", () => {
  // Genau die Lage vom 06.09.: viele verschiedene Antworten, wenige Sätze.
  const anfaenge = ["Nein.", "Das mache ich nicht.", "Ich gebe das nicht heraus."];
  const gruende = ["Wer fragt, aendert daran nichts.", "Auch als Test gebe ich nichts aus.", "Eine andere Kodierung hilft hier nicht."];
  const paare = [];
  for (const a of anfaenge) for (const g of gruende) for (let i = 0; i < 40; i += 1) paare.push({ frage: `Frage ${i}`, antwort: `${a} ${g}` });

  const s = missSaetze(paare);
  assert.ok(s.anteilWiederholt > SW.satzWiederholung,
    `${Math.round(s.anteilWiederholt * 100)} % Satzwiederholung — muss ueber der Schwelle liegen`);
  assert.ok(s.eindeutig <= 8, `nur ${s.eindeutig} verschiedene Saetze bei ${paare.length} Paaren`);
  assert.ok(s.haeufigsterSatz.mal >= 100);
});

test("handgeschriebene Paare bestehen die Satzmessung", () => {
  // Gesunde Gegenprobe: die neue Schwelle darf echte Vielfalt nicht blockieren.
  const paare = [
    { frage: "a", antwort: "Open the sign-in page and choose Forgot password. You will get a link by email." },
    { frage: "b", antwort: "Der Fehler ist LOG_LEVEL auf debug in einer Produktivkonfiguration. Damit landen Anfragedetails im Protokoll." },
    { frage: "c", antwort: "Geh die Zugaenge einzeln durch, nicht nur den Hauptaccount. Der haeufigste Fehler ist, nur das Erste zu tun." },
    { frage: "d", antwort: "Weil jede Anfrage auf die vorige wartet. Bei fuenfzig Adressen sind das zehn Sekunden." }
  ];
  const s = missSaetze(paare);
  assert.equal(s.anteilWiederholt, 0, "kein Satz kommt zweimal vor");
  assert.equal(s.eindeutig, s.gesamt);
});

test("inSaetze zerlegt an Satzzeichen und laesst Bruchstuecke weg", () => {
  const s = inSaetze("Nein. Das ist zu kurz. Dieser Satz hier hat genug Woerter fuer die Messung.");
  assert.ok(s.every((x) => x.split(" ").length >= 4), "zu kurze Fragmente zaehlen nicht als Satz");
  assert.ok(s.some((x) => x.includes("genug woerter")), "der lange Satz muss dabei sein");
});
