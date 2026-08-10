// Crash-Guard auf Prozess-Ebene fuer die Salad-Worker (Infra-Audit 2026-08-09).
//
// Problem: ein unbehandelter Fehler (uncaughtException / unhandledRejection)
// laesst den Node-Prozess in undefiniertem Zustand weiterlaufen. Die Salad-Sonde
// ist nur eine TCP-Sonde — sie sieht den offenen Port und haelt die Instanz fuer
// gesund, waehrend die Job-Verarbeitung faktisch tot ist ("stiller Tod").
//
// Loesung wie im Control Server (control-server/src/http/crashGuard.js), hier als
// eigenes Modul, weil die Worker als getrennte Bundles ohne Zugriff auf
// control-server/ laufen: jeder unbehandelte Fehler landet mit Stack im Log,
// danach kontrollierter Exit 1. Die Salad-Probe erkennt den Exit und realloziert.
//
// DI-testbar: proc und log sind injizierbar (kein echter Exit im Test).

export function formatFatal(app, kind, error) {
  const detail = error instanceof Error
    ? `${error.message}\n${error.stack || "(kein Stack)"}`
    : String(error);
  return `${app} FATAL ${kind}: ${detail}`;
}

export function installWorkerCrashGuard(app = "smejj.com worker", proc = process, log = console.error) {
  const report = (kind) => (error) => {
    try {
      log(formatFatal(app, kind, error));
    } catch {
      // Logging darf den kontrollierten Abgang nicht verhindern.
    }
    proc.exit(1);
  };
  const onUncaught = report("uncaughtException");
  const onRejection = report("unhandledRejection");
  proc.on("uncaughtException", onUncaught);
  proc.on("unhandledRejection", onRejection);
  return { onUncaught, onRejection };
}
