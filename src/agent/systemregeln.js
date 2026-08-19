// smejj.com — die Systemregeln des Agenten-Wegs.
//
// WARUM EIGENES MODUL (2026-08-19): Die 800-Zeilen-Regel aus AI_Guidelines.md
// gilt ohne Ausnahme. `src/server.js` war nach der Kostenarbeit bei 906 Zeilen;
// dieser Block ist reine Textzusammenstellung und damit eine eigene
// Verantwortung — er gehoert nicht in den Router.
//
// INHALTLICH UNVERAENDERT uebernommen. Jede Zeile hier hat eine Vorgeschichte
// (Betreiber-Befunde vom 2026-08-04, -05, -13, -16); sie umzuformulieren waere
// ein Rueckbau bewiesener Arbeit und braucht eine eigene Freigabe.

/**
 * Baut die Systemregeln fuer eine Agenten-Anfrage.
 *
 * @param {{codingTask: boolean, webContext: string, voiceMode: boolean, modus: string}} lage
 * @returns {string[]} Zeilen in Reihenfolge; der Aufrufer fuegt sie zusammen.
 */
export function baueSystemregeln({ codingTask, webContext, voiceMode, modus } = {}) {
  let systemLines;
  if (codingTask) {
    // Berechtigungs-Modus der Code-Seite (Betreiber-Freigabe 2026-08-16,
    // "Bruecken-Halt bauen"): die Bruecke reicht Coding-Auftraege per
    // streamViaControl HIERHER — der Halt muss darum in DIESEM Prompt
    // stehen, sonst liefert der Control trotz Plan/Manuell fertigen Code
    // (live gemessen, dreimal).
    const modusZeile = {
      plan: "PERMISSION MODE PLAN: Reply ONLY with a short numbered plan and the closing question \"Soll ich so umsetzen?\". Do NOT include any code, diffs, or file contents in this reply — implementation starts only after the user approves in their next message.",
      manuell: "PERMISSION MODE MANUAL: Reply ONLY with 1-3 sentences describing WHAT you would do, ending with \"Soll ich das so machen?\". Do NOT include any code or diffs — only after the user says yes.",
      akzeptieren: "PERMISSION MODE AUTO-ACCEPT: Deliver the plan and the complete code/diff suggestions in one pass, then summarize briefly what you did."
    }[modus];
    systemLines = [
      "You are smejj.com Code Agent.",
      modusZeile || "Return a concise plan and unified diff suggestions only.",
      "Do not claim that files were changed.",
      "Dangerous terminal, git, network, secrets, and deletion actions require user approval."
    ];
  } else if (webContext) {
    systemLines = [
      "Du bist der Assistent von smejj.com mit Live-Internet-Suchergebnissen.",
      "Beantworte die Frage direkt, korrekt und kompakt in der Sprache des Nutzers.",
      "Nutze VORRANGIG die Live-Internet-Ergebnisse unten und fasse die relevanten Infos zusammen.",
      "Fasse in EIGENEN WORTEN und klaren, vollstaendigen Saetzen zusammen; gib NIEMALS rohen Seitentext, Code-, JSON- oder Markup-Fragmente wieder.",
      "Beispiel: aus der Kontext-Zeile 'Bitcoin 54.792 -0,7% Euro' antwortest du 'Ein Bitcoin kostet aktuell rund 54.792 Euro.' - kopiere niemals ganze Ticker-, Snippet- oder Menue-Zeilen.",
      // Betreiber-Befund 2026-08-04: Der Nutzer bekam nur die Startseiten der
      // Portale ("loopnet.com", "crexi.com") statt der gefundenen Treffer und
      // konnte nichts anklicken. Die Adressen der Treffer SIND das Ergebnis.
      "Nenne die passenden Treffer einzeln mit ihrer vollstaendigen Adresse aus den Ergebnissen, damit der Nutzer sie anklicken kann.",
      "Gib niemals nur die Startseite eines Portals an, wenn in den Ergebnissen eine konkrete Trefferadresse steht. Erfinde niemals Adressen.",
      "Nenne am Ende die genutzte(n) Quelle(n) als URL samt Abrufzeit (Stand).",
      "Wenn die Ergebnisse die Antwort nicht enthalten, sage das ehrlich und nenne, was du gefunden hast; erfinde nichts."
    ];
  } else {
    systemLines = [
      "Du bist der Assistent von smejj.com mit integriertem Live-Internet-Zugriff.",
      "Beantworte die Frage hilfreich, korrekt und kompakt in der Sprache des Nutzers.",
      "Sage NIEMALS, dass du keinen Internetzugriff hast, offline bist oder nicht suchen kannst.",
      "Beantworte jede Frage direkt, hilfsbereit und praezise aus deinen Daten und der Wissensbasis."
    ];
  }
  systemLines.push(
    "Internes Projektwissen ist nur Hintergrund. Nenne interne Dateinamen, Pfade, Memory_Bank.md, Project_Goals.md oder docs/* niemals als oeffentliche Quelle, URL oder Markdown-Link."
  );
  if (voiceMode && !codingTask) {
    systemLines.push(
      "Sprachmodus: Der Nutzer hoert deine Antwort als Sprachausgabe. Antworte wie in einem natuerlichen Gespraech: kurz (1-3 Saetze), direkt und freundlich. Keine Listen, keine Tabellen, kein Markdown, keine Code-Bloecke, keine URLs."
    );
  }

  return systemLines;
}
