// smejj.com Control Server — Crash Guard (Prozess-Ebene).
// Zweck: den am 2026-07-04 verifizierten "stillen Tod" unmoeglich machen —
// unbehandelte Fehler landen IMMER mit Stack im Container-Log, danach beendet
// sich der Prozess kontrolliert mit Exit 1 (fail-closed: nach einem
// unbehandelten Fehler ist der Prozesszustand undefiniert; Salad-Probes
// erkennen den Exit und starten/reallozieren die Instanz automatisch).
// DI-testbar: process und Logger sind injizierbar (kein echter Exit im Test).

export function formatFatal(kind, error) {
  const detail =
    error instanceof Error
      ? `${error.message}\n${error.stack || "(kein Stack)"}`
      : String(error);
  return `smejj.com control-server FATAL ${kind}: ${detail}`;
}

export function installCrashGuard(proc = process, log = console.error) {
  const report = (kind) => (error) => {
    try {
      log(formatFatal(kind, error));
    } catch {
      // Logging darf den Abgang nicht verhindern.
    }
    proc.exit(1);
  };
  const onUncaught = report("uncaughtException");
  const onRejection = report("unhandledRejection");
  proc.on("uncaughtException", onUncaught);
  proc.on("unhandledRejection", onRejection);
  return { onUncaught, onRejection };
}
