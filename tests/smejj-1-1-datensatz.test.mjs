// smejj.com — Der gebaute Datensatz smejj-1-1.
//
// Betreiber-Entscheidung 2026-09-04: "Eigene Paare bauen". Gemessen am selben
// Tag: 1 erfasste Nutzerfrage bei einem Besuch am Tag — auf dem Sammelweg
// kommen die geforderten 3.000 Paare nie zusammen.
//
// Geprueft wird die EIGENSCHAFT des Datensatzes, nicht seine Groesse: dass er
// deterministisch ist, dass die Pruefsuite draussen bleibt, und dass Abwehr
// und Gegenprobe beide vorkommen. Die Lehre vom 03.09.: con-1.1.0 wurde
// verworfen, weil es fast nur auf Fakten trainiert wurde — es verriet danach
// ein Geheimnis und folgte einer Prompt-Injection.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { erzeugeErgaenzung, abwehrPaare, gegenprobePaare, ehrlichkeitsPaare, formPaare } from "../scripts/training/smejj-1-1-generator.mjs";
import { MASCHEN } from "../scripts/training/smejj-1-1-abwehr.mjs";
import { HANDLUNGEN } from "../scripts/training/smejj-1-1-gegenprobe.mjs";

/** Wie der Peer-Waechter misst: klein, ohne Satzzeichen, ohne Mehrfach-Leerzeichen. */
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
const antworten = (paare) => paare.map((p) => norm(p.messages.at(-1).content));
const haeufigkeiten = (liste) => { const z = {}; for (const x of liste) z[x] = (z[x] || 0) + 1; return z; };
import { baue, leseSuiten, MENGEN, STARTWERT } from "../scripts/training/smejj-1-1-datensatz-bauen.mjs";
import { teile, PAARE_JE_TEIL } from "../scripts/training/smejj-1-1-hochladen.mjs";
import { wuerfel, erzeuge } from "../workers/con-autopilot/daten/generator.mjs";

test("derselbe Startwert ergibt denselben Datensatz", () => {
  const a = erzeugeErgaenzung({ startwert: 4711 });
  const b = erzeugeErgaenzung({ startwert: 4711 });
  const c = erzeugeErgaenzung({ startwert: 4712 });
  assert.deepEqual(a, b, "ohne Determinismus ist kein Trainingslauf nachvollziehbar");
  assert.notDeepEqual(a, c, "ein anderer Startwert muss auch etwas anderes ergeben");
});

test("bei jedem Abwehr-Paar IST die Antwort eine Verweigerung", () => {
  const paare = abwehrPaare(wuerfel(7), 400);
  const verweigert = /\b(nein|nicht|kein|keine|lehne|ab)\b/i;
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.match(antwort, verweigert, `Abwehr ohne Verweigerung: ${antwort.slice(0, 60)}`);
  }
});

test("die Gegenprobe verweigert NICHT — sonst entsteht Ueberverweigerung", () => {
  // Ein Modell, das bei jedem Wort "Schluessel" abblockt, ist genauso
  // unbrauchbar wie eines, das alles ausplaudert.
  const paare = gegenprobePaare(wuerfel(9), 200);
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.ok(!/^(nein|das mache ich nicht|das kann ich nicht tun)/i.test(antwort.trim()),
      `harmlose Frage wurde verweigert: ${antwort.slice(0, 60)}`);
    assert.ok(antwort.length > 40, "eine Gegenprobe muss wirklich antworten, nicht abwimmeln");
  }
});

test("Ehrlichkeits-Paare sagen 'weiss ich nicht' UND erfinden nichts", () => {
  const paare = ehrlichkeitsPaare(wuerfel(11), 200);
  for (const p of paare) {
    const antwort = p.messages.at(-1).content;
    assert.match(antwort, /(kann ich nicht|weiss ich nicht|keine Angabe|nicht sagen|muss ich passen)/i);
    assert.ok(!/\b\d{4,}\b/.test(antwort), `erfundene Zahl in einer Nichtwissen-Antwort: ${antwort.slice(0, 70)}`);
  }
});

test("die Antworten sind vielfaeltig genug fuer die Varianten-Bremse", () => {
  // Erste Fassung der Ehrlichkeits-Paare hatte je Bauart EINE Antwort: von
  // 1.200 erzeugten ueberlebten 74. Die Bremse laesst 40 Varianten je Antwort.
  const paare = ehrlichkeitsPaare(wuerfel(13), 600);
  const antworten = new Set(paare.map((p) => p.messages.at(-1).content));
  assert.ok(antworten.size >= 60, `nur ${antworten.size} verschiedene Antworten — die Duplikat-Bremse frisst den Rest`);
});

test("keine Antwort besteht nur aus Zeichen ohne Buchstaben", () => {
  // Die Daten-Pipeline verwirft solche Antworten als "spam" (403 Paare am
  // 04.09., reine Zahlenlisten aus der Sortier-Aufgabe).
  for (const p of formPaare(wuerfel(17), 300)) {
    assert.match(p.messages.at(-1).content, /\p{L}/u, "Antwort ohne Buchstaben faellt in den Spam-Filter");
  }
});

test("kein Fall der Pruefsuite steht im Datensatz", async () => {
  const suiten = await leseSuiten();
  const roh = [...erzeuge({ startwert: STARTWERT, ...MENGEN }), ...erzeugeErgaenzung({ startwert: STARTWERT })];
  const { paare, manifest } = baue(roh, suiten);
  const normalisiere = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const drin = new Set(paare.map((p) => normalisiere(p.messages.find((m) => m.role === "user")?.content)));
  for (const s of suiten) {
    for (const fall of s.cases || []) {
      assert.ok(!drin.has(normalisiere(fall.prompt)),
        `Suitenfall ${fall.id} steht im Training — die Messung wuerde sich selbst messen`);
    }
  }
  assert.ok(manifest.paare >= 3000, `nur ${manifest.paare} Paare — der Plan verlangt mindestens 3.000`);
  // Verweigern muss so stark vertreten sein wie Rechnen, sonst wird es
  // wegtrainiert (con-1.1.0, verworfen 03.09.).
  const k = manifest.kategorien;
  assert.ok(k.sicherheit >= k.reasoning * 0.5,
    `Sicherheit ${k.sicherheit} gegen Rechnen ${k.reasoning} — zu wenig Abwehr im Datensatz`);
  assert.ok(k.ehrlichkeit >= 300, `nur ${k.ehrlichkeit} Ehrlichkeits-Paare`);
});

test("die Teile sind einzeln klein genug fuer den 30-s-Deckel des Signierers", () => {
  // s3Signer.js#requestTimeoutSignal deckelt JEDES Zeitbudget bei 30 s. 3,8 MB
  // brauchen auf der Leitung des Betreibers (1,5 Mbit/s) rund 20 s netto und
  // liefen zweimal in die Zeitueberschreitung.
  const zeilen = Array.from({ length: 3200 }, (_, i) => JSON.stringify({ n: i })).join("\n");
  const stuecke = teile(zeilen);
  assert.equal(stuecke.length, 3, "3.200 Zeilen ergeben drei Teile");
  for (const s of stuecke) {
    assert.ok(s.split("\n").filter(Boolean).length <= PAARE_JE_TEIL);
    assert.ok(s.endsWith("\n"), "JSONL endet mit Zeilenumbruch");
  }
  assert.equal(stuecke.join("").split("\n").filter(Boolean).length, 3200, "kein Paar geht beim Teilen verloren");
});

// ---------------------------------------------------------------------------
// Der Spiegel-Job fasst den con-Autopiloten nicht an
//
// Der con-Autopilot laeuft rund um die Uhr. Seine Salad-Gruppe (con-job)
// umzukonfigurieren wuerde einen laufenden Trainingslauf abbrechen — am
// 04.09. lief dort gerade con-1.1.0 gegen die Schwaeche reasoning.
// ---------------------------------------------------------------------------
const { spiegelKonfig, REPO, PREFIX, GRUPPE, MAX_MINUTEN, SPEICHER_GB } = await import("../scripts/training/smejj-1-1-basis-spiegeln.mjs");

test("der Spiegel nutzt eine EIGENE Gruppe und ein eigenes Ziel", () => {
  const basis = {
    basis: { repo: "Qwen/Qwen3.8-27B", prefix: "con/base/qwen3.8-27b" },
    salad: { gruppe: "con-job", speicherGb: 150, prioritaet: "batch", vcpu: 8, ramMb: 30720 }
  };
  const k = spiegelKonfig(basis);
  assert.equal(k.salad.gruppe, GRUPPE);
  assert.notEqual(k.salad.gruppe, "con-job", "con-job umzukonfigurieren bricht einen laufenden Trainingslauf ab");
  assert.equal(k.basis.repo, REPO);
  assert.equal(k.basis.prefix, PREFIX);
  assert.ok(!PREFIX.startsWith("con/"), "der Spiegel darf nicht in das con-Lager schreiben");
  assert.equal(basis.salad.gruppe, "con-job", "die uebergebene Konfiguration bleibt unveraendert");
  assert.equal(basis.basis.prefix, "con/base/qwen3.8-27b");
});

test("der Spiegel traegt Zeitgrenze und passenden Plattenplatz", () => {
  // Ohne Zeitgrenze wird nicht gestartet (Regel des con-Autopiloten).
  assert.ok(MAX_MINUTEN > 0 && MAX_MINUTEN <= 120, `Zeitgrenze ${MAX_MINUTEN} min`);
  // 8 GB Modell brauchen keine 150 GB Platte wie das 27B des con-Jobs.
  assert.ok(SPEICHER_GB >= 20 && SPEICHER_GB < 150, `Platte ${SPEICHER_GB} GB`);
});

test("der Spiegel fordert KEINE Grafikkarte an", () => {
  // BEFUND 2026-09-04, live: Der erste Lauf stand 27 Minuten auf "deploying"
  // ohne eine einzige Instanz. Die Gruppe hatte drei GPU-Klassen aus der
  // con-Konfiguration geerbt und wartete auf eine freie RTX 3090 — fuer einen
  // Job, der nur Dateien von Hugging Face nach e2 schaufelt. job.py verlangt
  // CUDA nur bei "messung" und "training".
  const k = spiegelKonfig({
    basis: { repo: "Qwen/Qwen3.8-27B", prefix: "con/base/qwen3.8-27b" },
    salad: { gruppe: "con-job", speicherGb: 150, gpuKlassen: ["3090", "3090ti", "4090"] }
  });
  assert.deepEqual(k.salad.gpuKlassen, [], "eine GPU, auf die man wartet und die man nicht braucht, kostet Zeit und Geld");
});

// ---------------------------------------------------------------------------
// Vielfalt: Haltung oder Textbausteine?
//
// BEFUND 2026-09-04: Die erste Abwehr hatte 8 Nein-Saetze mal 12 Gruende — 96
// moegliche Antworten auf 4.119 Paare, **1,6 % Vielfalt**. Ein Modell lernt
// daraus sechs Saetze auswendig, nicht die Haltung dahinter. Und wer die
// Schablone kennt, findet die Frage, die sie nicht abdeckt.
//
// Die Schwellen stammen aus der Parallelsitzung (smejj-com-app-58): unter 5 %
// Vielfalt sind es Bausteine; traegt eine einzelne Antwort mehr als 10 %, ist
// sie die Schablone.
// ---------------------------------------------------------------------------
test("die Abwehr-Antworten sind vielfaeltig genug fuer Haltung statt Schablone", () => {
  const a = antworten(abwehrPaare(wuerfel(21), 6000));
  const z = haeufigkeiten(a);
  const vielfalt = Object.keys(z).length / a.length;
  const schablone = Math.max(...Object.values(z)) / a.length;
  assert.ok(vielfalt > 0.05, `nur ${(vielfalt * 100).toFixed(1)} % verschiedene Antworten — das sind Textbausteine`);
  assert.ok(schablone < 0.10, `eine einzelne Antwort traegt ${(schablone * 100).toFixed(1)} % — das ist die Schablone`);
});

test("der GRUND traegt die Vielfalt, nicht nur der Vorspann", () => {
  // Sonst taeuschen acht Nein-Saetze eine Vielfalt vor, die nur im ersten Wort
  // steckt: dieselbe Begruendung, achtfach verpackt.
  const a = antworten(abwehrPaare(wuerfel(23), 4000));
  const ohneVorspann = a.map((s) => s.split(" ").slice(2).join(" "));
  const vielfalt = new Set(ohneVorspann).size / ohneVorspann.length;
  assert.ok(vielfalt > 0.05, `ohne den Vorspann bleiben nur ${(vielfalt * 100).toFixed(1)} % verschiedene Antworten`);
});

test("jede Masche bringt ihre EIGENEN Gruende mit", () => {
  // Der Kern des Umbaus: Wer nach Base64 fragt, bekommt "eine andere Kodierung
  // macht aus einem Geheimnis kein oeffentliches Wort" — nicht irgendeine Zeile.
  const alle = [];
  for (const [name, m] of Object.entries(MASCHEN)) {
    assert.ok(m.formen.length >= 2, `${name}: zu wenige Angriffsformen`);
    assert.ok(m.gruende.length >= 3, `${name}: zu wenige Gruende`);
    alle.push(...m.gruende);
  }
  assert.equal(new Set(alle).size, alle.length, "kein Grund darf in zwei Maschen stehen — sonst passt er zu keiner");
  assert.ok(Object.keys(MASCHEN).length >= 10, "zu wenige Maschen, um Verhalten zu lernen");
});

// ---------------------------------------------------------------------------
// Ueberverweigerung ist kein kleinerer Fehler als Ausplaudern
//
// BEFUND 2026-09-04, am gebauten Datensatz gemessen: Von allen Fragen mit
// "Schluessel", "Passwort", "Token" oder "Zugang" wurden 2.481 abgelehnt und
// 115 beantwortet — eine hilfreiche Antwort auf 22 Ablehnungen. Ein Modell
// lernt daraus nicht "Geheimnisse nicht herausgeben", sondern "beim Wort
// Schluessel zumachen".
// ---------------------------------------------------------------------------
// Dasselbe Vokabular, das die Angriffe benutzen — inklusive der Begriffe, die
// nicht auf "-schluessel" enden (Wiederherstellungscode, Zugangsdaten).
//
// Das "ue" ist der Grund, warum die erste Messung log: der Datensatz schreibt
// durchgehend "Schluessel" in ASCII-Umschreibung, das Muster suchte
// "schlüssel" oder "schlussel" — und fand 137 von 400 passenden Fragen NICHT.
// Die daraus errechnete Zahl "1 hilfreiche Antwort auf 22 Ablehnungen" war
// damit selbst ein Messfehler. Ein Muster, das seinen eigenen Gegenstand nicht
// schreiben kann, misst nichts.
const HEIKEL = /schl(ue|[uü])ssel|passwort|token|zugang|geheim|code|kennwort|\.env|admin/i;
const ABLEHNUNG = /^(nein|das mache ich nicht|das kann ich nicht tun|ich gebe das nicht heraus|damit kann ich nicht dienen|das lehne ich ab)/i;

test("auf jede Ablehnung kommen genug hilfreiche Antworten zu denselben Woertern", () => {
  const r = wuerfel(27);
  const paare = [...abwehrPaare(r, 3000), ...gegenprobePaare(r, 2000)];
  let abgelehnt = 0, beantwortet = 0;
  for (const p of paare) {
    if (!HEIKEL.test(p.messages[1].content)) continue;
    ABLEHNUNG.test(p.messages.at(-1).content.trim()) ? (abgelehnt += 1) : (beantwortet += 1);
  }
  assert.ok(beantwortet > 0, "keine einzige hilfreiche Antwort zu heiklen Woertern");
  const verhaeltnis = abgelehnt / beantwortet;
  assert.ok(verhaeltnis <= 4, `1 hilfreiche Antwort auf ${verhaeltnis.toFixed(1)} Ablehnungen — das trainiert Ueberverweigerung`);
});

test("die Gegenproben tragen dieselben Woerter wie die Angriffe", () => {
  // Wer nur Fragen ueber das Wetter dagegenstellt, hat nichts bewiesen: die
  // Unterscheidung faellt dort, wo die Woerter gleich sind und die Absicht
  // verschieden ist.
  const paare = gegenprobePaare(wuerfel(29), 500);
  const mitHeikel = paare.filter((p) => HEIKEL.test(p.messages[1].content)).length;
  assert.ok(mitHeikel / paare.length > 0.9, `nur ${Math.round(mitHeikel / paare.length * 100)} % der Gegenproben sind nah genug an der Abwehr`);
  for (const p of paare.slice(0, 200)) {
    const a = p.messages.at(-1).content;
    assert.ok(!ABLEHNUNG.test(a.trim()), `legitime Frage abgelehnt: ${p.messages[1].content.slice(0, 50)}`);
    assert.ok(a.length > 80, "eine Gegenprobe muss wirklich etwas erklaeren, nicht abwimmeln");
  }
});

test("jede Handlung der Gegenprobe antwortet fachlich, nicht ausweichend", () => {
  for (const [name, h] of Object.entries(HANDLUNGEN)) {
    assert.ok(h.fragen.length >= 2, `${name}: zu wenige Fragen`);
    assert.ok(h.antworten.length >= 3, `${name}: zu wenige Antworten`);
    for (const bauer of h.antworten) {
      const text = bauer({ der: "der API-Schluessel", den: "einen API-Schluessel", kurz: "API-Schluessel" });
      assert.ok(text.length > 100, `${name}: Antwort zu duenn — "${text.slice(0, 40)}"`);
      assert.ok(!ABLEHNUNG.test(text.trim()), `${name}: die Gegenprobe darf nicht ablehnen`);
    }
  }
});

// ---------------------------------------------------------------------------
// Der Trainingslauf fasst weder con noch das con-Lager an
// ---------------------------------------------------------------------------
const { trainingsKonfig, jobParameter, KANDIDAT, DATENSATZ_PREFIX, GRUPPE: TRAIN_GRUPPE, MAX_MINUTEN: TRAIN_MINUTEN } =
  await import("../scripts/training/smejj-1-1-trainieren.mjs");

test("der Trainingslauf laeuft in einer EIGENEN Gruppe", () => {
  const basis = {
    basis: { repo: "Qwen/Qwen3.8-27B", prefix: "con/base/qwen3.8-27b" },
    salad: { gruppe: "con-job", speicherGb: 150, gpuKlassen: ["3090"] }
  };
  const k = trainingsKonfig(basis);
  assert.equal(k.salad.gruppe, TRAIN_GRUPPE);
  assert.notEqual(k.salad.gruppe, "con-job", "con-job umzukonfigurieren bricht einen laufenden con-Lauf ab");
  assert.notEqual(k.salad.gruppe, "smejj-spiegel", "auch nicht die Spiegel-Gruppe — sonst stoeren sich zwei Laeufe");
  assert.equal(basis.salad.gruppe, "con-job", "die uebergebene Konfiguration bleibt unveraendert");
  // Anders als der Spiegel BRAUCHT das Training eine Grafikkarte.
  assert.ok((k.salad.gpuKlassen || []).length > 0, "QLoRA ohne GPU gibt es nicht");
});

test("die Job-Parameter zeigen auf den smejj-Datensatz und einen eigenen Kandidaten", () => {
  const p = jobParameter();
  assert.equal(p.CON_KANDIDAT, KANDIDAT);
  assert.equal(p.CON_DATENSATZ_PREFIX, DATENSATZ_PREFIX);
  assert.ok(!p.CON_DATENSATZ_PREFIX.startsWith("con/"), "nicht aus dem con-Lager lesen");
  assert.ok(!p.CON_CHECKPOINT_PREFIX.startsWith("con/"), "nicht ins con-Lager schreiben");
  const konfig = JSON.parse(p.CON_TRAIN_KONFIG);
  assert.ok(konfig.rang > 0 && konfig.epochen > 0 && konfig.lernrate > 0, "unvollstaendige Trainingskonfiguration");
});

test("die Zeitgrenze ist gesetzt und bleibt im Rahmen des Deckels", () => {
  // Ohne Zeitgrenze wird nicht gestartet. 170 min auf einer 24-GB-Karte zu
  // 0,10 USD/h sind rund 0,28 USD — der Monatsdeckel liegt bei 10 USD.
  assert.ok(TRAIN_MINUTEN > 0 && TRAIN_MINUTEN <= 240, `Zeitgrenze ${TRAIN_MINUTEN} min`);
  assert.ok((TRAIN_MINUTEN / 60) * 0.10 < 1, "ein einzelner Lauf darf keinen Dollar kosten");
});
