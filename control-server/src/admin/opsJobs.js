// smejj.com — Modul H: Jobs und Laeufe (Single Responsibility: Betriebssicht).
//
// DIE WICHTIGSTE ENTSCHEIDUNG HIER IST, WAS NICHT DRINSTEHT.
//
// Ein Job-Datensatz enthaelt `task` — den Auftragstext der Nutzerin. Das ist
// Inhalt, nicht Betriebszustand. In Stufe 3 wurde festgelegt, dass Chat-Inhalte
// nie im Standardumfang stehen und `users.content.read` fuer den Owner
// Vier-Augen und fuer den Support die Einwilligung der betroffenen Person
// verlangt. Ein Betriebsbildschirm, der den Auftragstext nebenbei anzeigt,
// haette diese Regel still ausgehebelt.
//
// Draussen bleiben deshalb: `task`, `contextPaths`, die Repository-Adresse und
// der Wortlaut von Fehlermeldungen (ein Modell zitiert im Fehlerfall gern die
// Anfrage). Drin ist alles, was die Frage "haengt etwas?" beantwortet.
//
// Der Job-Store ist ein Zwischenspeicher im Arbeitsspeicher; die dauerhafte
// Quelle ist die Task Capsule auf IDrive e2. Diese Ansicht sagt das ausdruecklich,
// statt eine Vollstaendigkeit zu behaupten, die sie nicht hat.
import { activeWorkerCount, jobCount, listJobs } from "../jobs/jobStore.js";

const ENDZUSTAENDE = Object.freeze(["succeeded", "failed", "cancelled", "completed", "error"]);
// Ab wann ein laufender Job auffaellig ist. Bewusst grosszuegig: ein echter
// Codier-Lauf darf lange dauern, ein haengender faellt trotzdem auf.
const HAENGT_AB_MS = 30 * 60 * 1000;

export function jobUebersicht({ jetztMs = Date.now(), limit = 100, quelle = null } = {}) {
  const roh = typeof quelle === "function" ? quelle({ limit }) : listJobs({ limit });
  const jobs = (Array.isArray(roh) ? roh : []).map((job) => aufbereiten(job, jetztMs));

  const laufend = jobs.filter((j) => !j.abgeschlossen);
  return {
    ok: true,
    total: typeof quelle === "function" ? jobs.length : jobCount(),
    angezeigt: jobs.length,
    laufend: laufend.length,
    haengt: laufend.filter((j) => j.haengt).length,
    fehlgeschlagen: jobs.filter((j) => j.status === "failed" || j.status === "error").length,
    aktiveWorker: typeof quelle === "function" ? 0 : activeWorkerCount(),
    jobs: jobs.sort(sortiereNachDringlichkeit),
    hinweis: "Zwischenspeicher im Arbeitsspeicher: nach einem Neustart des Control-Servers "
      + "ist die Liste leer. Die dauerhafte Quelle je Lauf ist die Task Capsule auf IDrive e2.",
    inhaltHinweis: "Auftragstext, Kontextpfade und Repository-Adresse stehen hier bewusst nicht — "
      + "das ist Inhalt und faellt unter users.content.read."
  };
}

function aufbereiten(job, jetztMs) {
  const status = String(job?.status || "unknown");
  const abgeschlossen = ENDZUSTAENDE.includes(status);
  const zuletzt = Date.parse(job?.updatedAt || job?.createdAt || "");
  const alterMs = Number.isFinite(zuletzt) ? Math.max(0, jetztMs - zuletzt) : null;
  return {
    id: job?.id || "",
    status,
    abgeschlossen,
    // "Haengt" heisst: laeuft noch und hat sich lange nicht gemeldet. Das ist
    // ein Verdacht fuer den Blick der Betreiberin, kein Urteil ueber den Job.
    haengt: !abgeschlossen && alterMs !== null && alterMs > HAENGT_AB_MS,
    modellId: job?.modelId || null,
    ausfuehrungsart: job?.executionMode || null,
    nutzerId: job?.userId || "",
    projektId: job?.projectId || "",
    elternJobId: job?.parentJobId || "",
    erstelltAm: job?.createdAt || null,
    geaendertAm: job?.updatedAt || null,
    alterMs,
    dauerhafteKapsel: job?.durableTaskCapsule === true,
    // Nur die Tatsache, nicht die Adresse.
    mitRepository: Boolean(job?.repository?.url || job?.repository?.name)
  };
}

/** Haengende zuerst, dann fehlgeschlagene, dann laufende, dann der Rest. */
function sortiereNachDringlichkeit(a, b) {
  const rang = (j) => {
    if (j.haengt) return 0;
    if (j.status === "failed" || j.status === "error") return 1;
    if (!j.abgeschlossen) return 2;
    return 3;
  };
  const unterschied = rang(a) - rang(b);
  if (unterschied !== 0) return unterschied;
  return String(b.geaendertAm || "").localeCompare(String(a.geaendertAm || ""));
}
