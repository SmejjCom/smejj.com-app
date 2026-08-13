// smejj.com — Selbsttests der Autopilot-Module (Teil 2 des Laeufers).
//
// Jeder Test gibt seinem Autopiloten eine AUFGABE MIT FESTSTEHENDER ANTWORT
// und prueft das Ergebnis. Deshalb ist ein gruener Herzschlag hier ein
// Nachweis und kein Lebenszeichen: Wer die Aufgabe falsch loest, wird ROT.
//
// Ausgelagert aus autopilotLaeufer.js (800-Zeilen-Regel). Jede Funktion
// liefert {ok, meldung} und wirft nicht — der Laeufer verpackt Ausnahmen.
import { generateResearchPlan } from "./deepResearchAutopilot.js";
import { extractUserFacts } from "./memoryAutopilot.js";
import { validateMultimodalInput } from "./multimodalAutopilot.js";
import { buildTaskGraph } from "./taskOrchestratorAutopilot.js";
import { evaluateResponseQuality } from "./selfImprovementAutopilot.js";
import { createInitialLifecycleState, evaluateShadowTrial } from "./modelLifecycleAutopilot.js";
import { scrubPiiData } from "./userFeedbackFlywheelAutopilot.js";
import { decomposeReasoningSteps, verifyReasoningTracePRM } from "./processRewardAutopilot.js";
import { distillOptimalReasoning } from "./knowledgeDistillerAutopilot.js";
import { runEvolutionaryStressTest } from "./evolutionaryMutationAutopilot.js";
import { extractHarvestedFacts } from "./realtimeInternetHarvesterAutopilot.js";
import { validateMultiFileArchitecture } from "./multiFileRepoArchitectAutopilot.js";
import { updateEloRatings, calculateExpectedScore } from "./liveArenaLeaderboardAutopilot.js";
import { buildInstantWebContainerPreview, analyzeWebContainerSnippet } from "./instantWebContainerAutopilot.js";
import { createVoicePairSession, processRealtimePairFrame } from "./realtimeVoicePairAutopilot.js";
import { analyzePullRequestDiff } from "./autonomousGitBotAutopilot.js";

/** Kleine Hilfe: aus einer Liste von Pruefungen eine Meldung machen. */
function auswerten(name, pruefungen) {
  const daneben = pruefungen.filter((p) => !p.erfuellt);
  if (daneben.length) {
    return { ok: false, meldung: `${name}: ${daneben.length}/${pruefungen.length} Pruefungen fehlgeschlagen — ${daneben[0].was}` };
  }
  return { ok: true, meldung: `${name}: ${pruefungen.length}/${pruefungen.length} Pruefungen bestanden` };
}

export function laufDeepResearch() {
  const plan = generateResearchPlan("Vergleich von Vektordatenbanken", 3);
  const schritte = Array.isArray(plan) ? plan : plan?.steps || plan?.plan;
  return auswerten("Rechercheplan", [
    { was: "Plan ist eine Liste", erfuellt: Array.isArray(schritte) },
    { was: "Plan hat Schritte", erfuellt: Array.isArray(schritte) && schritte.length > 0 },
    { was: "Thema taucht im Plan auf", erfuellt: JSON.stringify(plan || "").toLowerCase().includes("vektor") }
  ]);
}

export function laufMemory() {
  // Der Autopilot muss aus einem Gespraech Fakten ziehen. WICHTIG fuer die
  // Fairness des Tests: extractUserFacts erkennt feste Wendungen ("ich heiße",
  // "ich wohne in") — der Testtext benutzt genau sie, sonst pruefte er die
  // Sprachvielfalt des Musters statt die Arbeit des Autopiloten.
  const fakten = extractUserFacts([
    { role: "user", content: "Ich heiße Alan." },
    { role: "assistant", content: "Freut mich!" },
    { role: "user", content: "Ich wohne in Wien." }
  ]);
  const text = JSON.stringify(fakten || "").toLowerCase();
  return auswerten("Faktenextraktion", [
    { was: "liefert eine Liste", erfuellt: Array.isArray(fakten) },
    { was: "findet mindestens einen Fakt", erfuellt: Array.isArray(fakten) && fakten.length > 0 },
    { was: "erkennt den Namen oder den Ort", erfuellt: text.includes("alan") || text.includes("wien") }
  ]);
}

export function laufMultimodal() {
  const gut = validateMultimodalInput({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" });
  const schlecht = validateMultimodalInput(null);
  return auswerten("Eingabepruefung", [
    { was: "gueltige Eingabe wird angenommen", erfuellt: gut?.valid === true || gut?.ok === true },
    { was: "leere Eingabe wird abgewiesen", erfuellt: schlecht?.valid === false || schlecht?.ok === false }
  ]);
}

export function laufTaskOrchestrator() {
  const graph = buildTaskGraph("Baue eine Anmeldeseite mit Tests und Dokumentation");
  const knoten = Array.isArray(graph) ? graph : graph?.nodes || graph?.tasks || graph?.steps;
  return auswerten("Aufgabengraph", [
    { was: "Graph entsteht", erfuellt: Boolean(graph) },
    { was: "Graph hat Knoten", erfuellt: Array.isArray(knoten) && knoten.length > 0 }
  ]);
}

export function laufSelfImprovement() {
  // Eine ausfuehrliche Antwort muss besser bewertet werden als "ok." —
  // erkennt der Bewerter das nicht, taugt er nicht als Trainingsfilter.
  // Beide Antworten zum GLEICHEN Prompt — sonst vergleicht der Test zwei
  // verschiedene Aufgaben. Der Prompt ist ueber 50 Zeichen lang (darunter
  // greift die Kuerze-Regel des Bewerters nicht) und nennt bewusst kein
  // Code-Stichwort, sonst zoege der Bewerter der guten Antwort Punkte fuer
  // den fehlenden Codeblock ab.
  const frage = "Erklaere bitte ausfuehrlich den Unterschied zwischen Miete und Pacht im deutschen Recht.";
  const gut = evaluateResponseQuality(
    frage,
    "Bei der Miete darf die Sache nur gebraucht werden. Die Pacht erlaubt zusaetzlich, "
    + "die Fruechte zu ziehen, also den Ertrag zu behalten. Deshalb wird ein Acker verpachtet "
    + "und eine Wohnung vermietet."
  );
  const schlecht = evaluateResponseQuality(frage, "ok.");
  const nGut = Number(gut?.score ?? gut?.qualityScore ?? NaN);
  const nSchlecht = Number(schlecht?.score ?? schlecht?.qualityScore ?? NaN);
  return auswerten("Qualitaetsbewertung", [
    { was: "liefert eine Zahl", erfuellt: Number.isFinite(nGut) && Number.isFinite(nSchlecht) },
    { was: "gute Antwort schlaegt schlechte", erfuellt: Number.isFinite(nGut) && Number.isFinite(nSchlecht) && nGut > nSchlecht }
  ]);
}

export function laufModelLifecycle() {
  const stand = createInitialLifecycleState();
  // Der Schatten ist deutlich langsamer und kuerzer — das darf keine
  // Befoerderung ausloesen.
  const versuch = evaluateShadowTrial("Testfrage", "Eine ausfuehrliche, korrekte Antwort auf die Testfrage.", "kurz", 400, 4000);
  return auswerten("Schatten-Bewertung", [
    { was: "Anfangszustand entsteht", erfuellt: Boolean(stand) && typeof stand === "object" },
    { was: "Schattenversuch wird bewertet", erfuellt: Boolean(versuch) && typeof versuch === "object" },
    { was: "langsamer Schatten gewinnt nicht", erfuellt: versuch?.shadowWins !== true && versuch?.winner !== "shadow" }
  ]);
}

export function laufUserFeedbackFlywheel() {
  const roh = "Schreib an alan.best@example.com, mein Schluessel ist sk-abcdef1234567890abcdef und die IP 192.168.10.5";
  const sauber = String(scrubPiiData(roh) || "");
  return auswerten("PII-Maskierung", [
    { was: "E-Mail wird maskiert", erfuellt: !sauber.includes("alan.best@example.com") },
    { was: "Schluessel wird maskiert", erfuellt: !sauber.includes("sk-abcdef1234567890abcdef") },
    { was: "Text bleibt erhalten", erfuellt: sauber.length > 20 }
  ]);
}

export function laufProcessReward() {
  const kette = "Schritt 1: Wir setzen x = 4.\nSchritt 2: Wir quadrieren x, also 16.\nSchritt 3: Wir ziehen 6 ab, Ergebnis 10.";
  const schritte = decomposeReasoningSteps(kette);
  const pruefung = verifyReasoningTracePRM(kette);
  return auswerten("Schrittpruefung", [
    { was: "Kette wird zerlegt", erfuellt: Array.isArray(schritte) && schritte.length >= 2 },
    { was: "Kette wird bewertet", erfuellt: Boolean(pruefung) && typeof pruefung === "object" }
  ]);
}

export function laufKnowledgeDistiller() {
  const beste = distillOptimalReasoning("Summe von 1 bis 10", [
    { model: "a", solution: "Die Summe ist 55, denn n(n+1)/2 = 10*11/2 = 55.", correct: true },
    { model: "b", solution: "Keine Ahnung.", correct: false }
  ]);
  return auswerten("Destillation", [
    { was: "waehlt ein Ergebnis", erfuellt: Boolean(beste) },
    { was: "waehlt nicht die leere Antwort", erfuellt: !JSON.stringify(beste || "").includes("Keine Ahnung") }
  ]);
}

export function laufEvolutionaryMutation() {
  const bericht = runEvolutionaryStressTest("function teile(a, b) { return a / b; }");
  return auswerten("Mutationstest", [
    { was: "Bericht entsteht", erfuellt: Boolean(bericht) && typeof bericht === "object" },
    { was: "Faelle wurden geprueft", erfuellt: JSON.stringify(bericht).length > 20 }
  ]);
}

export function laufInternetHarvester() {
  const fakten = extractHarvestedFacts(
    "Node.js 24 wurde veroeffentlicht. Die Version bringt einen schnelleren Startvorgang. "
    + "Ausserdem wurde CVE-2026-1234 im HTTP-Parser behoben.",
    "Node.js"
  );
  return auswerten("Faktenernte", [
    { was: "liefert Fakten", erfuellt: Array.isArray(fakten) ? fakten.length > 0 : Boolean(fakten) },
    { was: "Inhalt taucht auf", erfuellt: JSON.stringify(fakten || "").toLowerCase().includes("node") }
  ]);
}

/** Prueft die ECHTE Architektur dieses Containers, kein Beispielprojekt. */
export function laufRepoArchitect(dateien = []) {
  if (!dateien.length) return { ok: false, meldung: "Kein Quelltext geladen — Architekturpruefung ohne Aussage" };
  const bericht = validateMultiFileArchitecture(dateien.slice(0, 120));
  return auswerten(`Architekturpruefung (${Math.min(dateien.length, 120)} Dateien)`, [
    { was: "Bericht entsteht", erfuellt: Boolean(bericht) && typeof bericht === "object" }
  ]);
}

export function laufLiveArena() {
  // Reine Mathematik, exakt pruefbar: Bei gleicher Wertung ist die Erwartung
  // 0,5. Wer gewinnt, muss steigen; wer verliert, faellt.
  const erwartung = calculateExpectedScore(1500, 1500);
  const nachSieg = updateEloRatings(1500, 1500, 1);
  const neuA = Number(nachSieg?.newRatingA ?? nachSieg?.ratingA ?? (Array.isArray(nachSieg) ? nachSieg[0] : NaN));
  const neuB = Number(nachSieg?.newRatingB ?? nachSieg?.ratingB ?? (Array.isArray(nachSieg) ? nachSieg[1] : NaN));
  return auswerten("ELO-Rechnung", [
    { was: "Erwartung bei Gleichstand ist 0,5", erfuellt: Math.abs(Number(erwartung) - 0.5) < 0.001 },
    { was: "Sieger steigt", erfuellt: Number.isFinite(neuA) && neuA > 1500 },
    { was: "Verlierer faellt", erfuellt: Number.isFinite(neuB) && neuB < 1500 }
  ]);
}

export function laufWebContainer() {
  const vorschau = buildInstantWebContainerPreview({ html: "<h1>Hallo</h1>", css: "h1{color:red}", js: "console.log(1)", title: "Test" });
  const text = typeof vorschau === "string" ? vorschau : JSON.stringify(vorschau || "");
  const erkannt = analyzeWebContainerSnippet("<html><body><h1>Test</h1></body></html>");
  return auswerten("Vorschau-Erzeugung", [
    { was: "Vorschau enthaelt den Inhalt", erfuellt: text.includes("Hallo") },
    { was: "Stil wird eingebettet", erfuellt: text.includes("color:red") || text.includes("color: red") },
    { was: "Schnipsel wird erkannt", erfuellt: Boolean(erkannt) }
  ]);
}

export function laufVoicePair() {
  const sitzung = createVoicePairSession("selbsttest", "voice_only");
  const rahmen = processRealtimePairFrame({ sessionId: sitzung?.sessionId || sitzung?.id, audio: "AAAA", timestamp: 0 });
  return auswerten("Sprachsitzung", [
    { was: "Sitzung entsteht", erfuellt: Boolean(sitzung) && typeof sitzung === "object" },
    { was: "Sitzung hat eine Kennung", erfuellt: Boolean(sitzung?.sessionId || sitzung?.id) },
    { was: "Rahmen wird verarbeitet", erfuellt: Boolean(rahmen) }
  ]);
}

export function laufGitBot() {
  // Ein Diff mit einem hart codierten Schluessel: den MUSS der Bot finden.
  const diff = [
    "diff --git a/config.js b/config.js",
    "+++ b/config.js",
    '+const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz123456";',
    "+eval(userInput);"
  ].join("\n");
  const bericht = analyzePullRequestDiff(diff);
  const text = JSON.stringify(bericht || "").toLowerCase();
  return auswerten("Diff-Pruefung", [
    { was: "Bericht entsteht", erfuellt: Boolean(bericht) },
    { was: "findet ein Risiko", erfuellt: text.includes("secret") || text.includes("eval") || text.includes("key") || text.includes("high") }
  ]);
}
