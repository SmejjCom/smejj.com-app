// smejj.com — Antwort ohne Modell: der freundliche Rueckfall der Plattform.
//
// Ausgelagert aus src/server.js am 2026-07-28 (Freigabe "Ja, Punkt 1" —
// dieselbe Aufteilungsarbeit wie bei public/app.js). server.js stand auf 799
// von 800 Zeilen und hatte damit keinerlei Luft mehr; jede kuenftige Aenderung
// haette zuerst eine Aufteilung erzwungen.
//
// Code zeilengleich uebernommen, kein Verhaltenswechsel. Diese Antworten greifen,
// wenn SMEJJ_SERVER_AI_ENABLED nicht gesetzt ist — die Seite bleibt dann
// bedienbar, statt einen Fehler zu zeigen (Graceful Degradation).

import { SECURITY_HEADERS } from "../../../src/shared/platform.js";

export function localAssistantStream(res, messages) {
  const prompt = latestUserMessage(messages);
  const lower = prompt.toLowerCase();
  const wantsGreeting = /^(hi|hallo|hey|servus|moin)\b/i.test(prompt);
  const wantsCode = /\b(code|coding|programm|bug|fehler|test|datei|repo|patch|fix|build)\b/i.test(lower);
  const wantsModel = /\b(glm|kimi|idrive|salad|modell|model|ki|ai|gpu|compute)\b/i.test(lower);
  const reply = buildLocalAssistantReply({ prompt, wantsGreeting, wantsCode, wantsModel });
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export function buildLocalAssistantReply({ prompt, wantsGreeting, wantsCode, wantsModel }) {
  if (!prompt) return "Ich bin da. Schreib mir, was ich fuer dich bauen, pruefen oder verbessern soll.";
  if (wantsGreeting) return "Hi, ich bin da. Was soll ich als Naechstes fuer dich bauen oder pruefen?";
  if (wantsCode) {
    return [
      "Verstanden. Ich behandle das als Coding-Aufgabe.",
      "Ich wuerde so vorgehen:",
      "1. Relevante Dateien gezielt lesen.",
      "2. Ursache finden, nicht blind umbauen.",
      "3. Kleine, messbare Aenderung machen.",
      "4. Danach genau den passenden Test laufen lassen.",
      "Sag mir die konkrete Datei, Fehlermeldung oder Aufgabe, dann gehe ich direkt rein."
    ].join("\n");
  }
  if (wantsModel) {
    return [
      "GLM-5.2 ist als IDrive-e2-Vault vorbereitet und bleibt der Hauptpfad fuer Coding und Planung.",
      "Salad/Compute startet nur mit expliziter Freigabe, damit keine GPU-Kosten unbemerkt loslaufen.",
      "Ich kann Architektur, Jobs, Storage, Worker-Planung und Tests hier weiter ausarbeiten."
    ].join("\n");
  }
  return [
    "Verstanden.",
    "Ich kann daraus eine konkrete Aufgabe machen, die Dateien pruefen, einen Plan schreiben oder direkt eine kleine Aenderung umsetzen.",
    "Schick mir den naechsten Schritt oder sag, welchen Bereich ich anfassen soll."
  ].join("\n");
}

export function latestUserMessage(messages) {
  const userMessages = Array.isArray(messages) ? messages.filter((message) => message?.role === "user") : [];
  const content = String(userMessages.at(-1)?.content || "").trim();
  return content.replace(/\s+/g, " ").slice(0, 180);
}
