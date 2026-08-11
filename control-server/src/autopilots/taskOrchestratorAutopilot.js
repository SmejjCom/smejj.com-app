// smejj.com — Task-Orchestrierungs KI-Autopilot
// Zerlegt komplexe Aufgabenstellungen in Sub-Agenten-Tasks, koordiniert deren Ausführung und führt Ergebnisse zusammen.

export function buildTaskGraph(goalDescription) {
  if (!goalDescription || typeof goalDescription !== "string") {
    throw new Error("Task-Orchestrierung erfordert sein Hauptziel als String.");
  }

  const goal = goalDescription.trim();
  const tasks = [
    {
      id: "task-1-analyse",
      title: "Anforderungsanalyse & Zerlegung",
      description: `Analysiere das Hauptziel: "${goal}"`,
      dependencies: [],
      status: "pending"
    },
    {
      id: "task-2-recherche",
      title: "Datenbeschaffung & Recherche",
      description: `Sammle notwendige Informationen & Fakten zu: "${goal}"`,
      dependencies: ["task-1-analyse"],
      status: "pending"
    },
    {
      id: "task-3-ausfuehrung",
      title: "Kernumsetzung & Generierung",
      description: `Führe die Hauptaufgabe aus`,
      dependencies: ["task-2-recherche"],
      status: "pending"
    },
    {
      id: "task-4-synthese",
      title: "Ergebnissynthese & Qualitätsprüfung",
      description: `Prüfe und konsolidiere das Gesamtergebnis`,
      dependencies: ["task-3-ausfuehrung"],
      status: "pending"
    }
  ];

  return {
    goal,
    tasks,
    createdAt: new Date().toISOString()
  };
}

export async function executeTaskOrchestrator(goalDescription, executorFn = null) {
  const graph = buildTaskGraph(goalDescription);
  const results = {};

  for (const task of graph.tasks) {
    task.status = "running";
    task.startedAt = new Date().toISOString();

    try {
      if (typeof executorFn === "function") {
        results[task.id] = await executorFn(task);
      } else {
        results[task.id] = { status: "simulated_success", output: `Teilaufgabe ${task.title} abgeschlossen.` };
      }
      task.status = "completed";
      task.completedAt = new Date().toISOString();
    } catch (err) {
      task.status = "failed";
      task.error = String(err?.message || err);
      break;
    }
  }

  const allCompleted = graph.tasks.every(t => t.status === "completed");

  return {
    status: allCompleted ? "success" : "partial_failure",
    goal: graph.goal,
    tasks: graph.tasks,
    results,
    timestamp: new Date().toISOString()
  };
}
