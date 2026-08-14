// smejj.com — AI Evolution Engine, Sammelpunkt.
//
// Die Schichten, in der Reihenfolge, in der sie arbeiten:
//
//   qualitaetsEngine        bewertet EIN Ergebnis je Medientyp (erweiterbar)
//   aiEvolutionEngine       nimmt jede KI-Aktion an, macht Aufgaben daraus
//   missingFunctionDetector vergleicht mit der Konkurrenz, macht Aufgaben daraus
//   autopilotSupervisor     nimmt fertige Arbeit ab — oder eben nicht
//
// Wer eine neue KI-Funktion anschliesst, braucht nur zwei Zeilen:
//   registriereMedientyp("neuerTyp", pruefer)
//   erfasseAktion({ art: "neuerTyp", ergebnis })

export * from "./qualitaetsEngine.js";
export * from "./aiEvolutionEngine.js";
export * from "./missingFunctionDetector.js";
export * from "./autopilotSupervisor.js";
