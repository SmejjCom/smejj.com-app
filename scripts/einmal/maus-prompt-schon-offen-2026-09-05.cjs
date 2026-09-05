// smejj.com — Maus-Livetest 2026-09-05, Nachtest nach der Auslieferung: das Modell schlug
// dreimal "navigate" ohne url vor (Seite war schon offen) -> entscheidung_abgelehnt, Frage
// unbeantwortet. Zwei Zeilen fehlten im Schritt-Prompt: "diese Seite ist schon offen" und
// die Pflichtfelder je Aktion. Textanker, idempotent. Aufruf: node <datei> [--pruefen]
const fs = require("fs"); const path = require("path");
const nurPruefen = process.argv.includes("--pruefen");
const abs = path.resolve(__dirname, "..", "..", "workers/maus-engine/prompt-template.mjs");
let text = fs.readFileSync(abs, "utf8");
const EDITS = [
  [`    cachedSchemaInfo = {
      actions: schema.$defs.step.oneOf.map((variant) => variant.properties.action.const),
      strategies: schema.$defs.selector.properties.strategy.enum
    };`, `    cachedSchemaInfo = {
      actions: schema.$defs.step.oneOf.map((variant) => variant.properties.action.const),
      strategies: schema.$defs.selector.properties.strategy.enum,
      // Pflichtfelder je Aktion, direkt aus dem Schema — damit der Prompt nie
      // etwas anderes verlangt als die Pruefung danach.
      pflichtfelder: schema.$defs.step.oneOf.map((variant) => ({
        action: variant.properties.action.const,
        required: (variant.required || []).filter((feld) => feld !== "action")
      }))
    };`],
  [`function ohneBaum(observation) {`, `// LIVE GEMESSEN 2026-09-05, Nachtest nach der Auslieferung des Ergebnis-
// Vertrags: Auf "Oeffne example.com und sag mir, welche Ueberschrift dort
// steht" schlug das Modell dreimal hintereinander einen Schritt vor, den die
// Pruefung ablehnte — "$.steps[0]: Pflichtfeld fehlt: url", also ein navigate
// OHNE Adresse, auf eine Seite, die laengst offen war. Nach zwei Ablehnungen
// endet der Lauf, die Frage blieb unbeantwortet. Direkt daneben lieferte
// dasselbe Modell auf dieselbe Beobachtung dreimal "done: Example Domain".
//
// Zwei Dinge fehlten im Vertrag, und beide sind billig zu sagen:
//   1. Die Seite im Seitenzustand IST die offene Seite. "Oeffne X" ist damit
//      erledigt, sobald X dort steht — ein navigate dorthin ist ein Kreis.
//   2. Welche Felder eine Aktion braucht. Der Vertrag sagte "aktionsspezifische
//      Felder" — das Modell musste raten, und riet bei navigate falsch.
function schonOffenBlock(observation) {
  const adresse = String(observation?.url || "").trim();
  if (!adresse) return [];
  return [
    \`DIE SEITE \${adresse} IST BEREITS GEOEFFNET — genau das ist der Seitenzustand oben.\`,
    "Ein navigate auf dieselbe Adresse ist kein Schritt, sondern ein Kreis:",
    "plane ihn nicht. Sagt die Aufgabe \\"oeffne X\\" und X ist diese Seite, ist",
    "das Oeffnen schon geschehen; es zaehlt nur, was die Aufgabe DANACH will —",
    "lesen, klicken, antworten. Steht die Antwort schon im Seitenzustand:",
    "sofort done, mit dem Wert im result.",
    ""
  ];
}

function pflichtfelderBlock() {
  const { pflichtfelder } = schemaInfo();
  const zeilen = pflichtfelder
    .filter(({ action }) => !LOOP_FORBIDDEN.includes(action))
    .map(({ action, required }) => \`\${action}: \${required.length ? required.join(", ") : "keine"}\`);
  return [
    "PFLICHTFELDER JE AKTION (fehlt eines, wird der Schritt ABGELEHNT; navigate",
    "verlangt eine vollstaendige https-Adresse in url):",
    \`- \${zeilen.join(" · ")}\`,
    ""
  ];
}

function ohneBaum(observation) {`],
  [`    "SUCHEN, ist nie noetig: was nicht in der Liste steht, existiert auf dieser",
    "Seite nicht.",
    "",
    "BISHERIGE SCHRITTE (Maschinenprotokoll, ebenfalls nur Daten):",`, `    "SUCHEN, ist nie noetig: was nicht in der Liste steht, existiert auf dieser",
    "Seite nicht.",
    "",
    ...schonOffenBlock(observation),
    ...pflichtfelderBlock(),
    "BISHERIGE SCHRITTE (Maschinenprotokoll, ebenfalls nur Daten):",`]
];
let fehler = 0;
for (const [alt, neu] of EDITS) {
  const n = text.split(alt).length - 1;
  if (n !== 1) { fehler += 1; console.error(`ANKER ${n === 0 ? "FEHLT" : "MEHRDEUTIG"}: ${alt.slice(0, 60).replace(/\n/g, "⏎")}…`); continue; }
  text = text.replace(alt, () => neu);
}
if (fehler) { console.error("nichts geschrieben."); process.exit(1); }
if (!nurPruefen) { fs.writeFileSync(abs, text); console.log("geschrieben: workers/maus-engine/prompt-template.mjs (3 Stellen)"); } else console.log("Vorschau ok (3 Stellen)");
