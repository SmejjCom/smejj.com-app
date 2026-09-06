// smejj.com — Die vier Plaetze der eigenen Modellfamilie.
//
// Betreiber-Auftrag 2026-09-06: "smejj 1.0, 1.1, 1.2 und 1.3 aktiv haben und
// jede untereinander Aufgaben teilen — wie Claude das mit Fable, Opus, Sonnet
// und Haiku macht."
//
// DAS VORBILD, und was daran das Wesentliche ist: Nicht die Zahl der Modelle,
// sondern dass eine leichte Frage nicht das teuerste Modell beschaeftigt. Ein
// kurzes "wie spaet ist es" braucht kein Modell, das eine Architektur
// durchdenkt — und eine Architekturfrage darf nicht beim schnellsten landen.
//
// WAS HIER NEU IST: nichts an der Technik. Der Router hat die Profile seit
// jeher (fast, default, reasoning, coding) und ordnet jede Frage automatisch
// zu (modelRouter.js#classifyProfile). Die Registry kennt eigene Modelle
// fail-closed. Der Versions-Takt (Nr. 83) haengt Aliase um. Was fehlte, ist
// die Schicht dazwischen: WELCHE eigene Version auf welchem Platz steht.
//
// DIE REGEL DER BELEGUNG, und sie ist absichtlich streng:
//
//   Ein Platz wird NUR von einer Version besetzt, die die Messung bestanden
//   hat — besser als das Basismodell ohne Adapter, null kritische Fehler.
//
// Am 06.09. war keine der drei gemessenen Versionen so weit: smejj-1-1 und
// -1-2 lagen 17 bis 21 Punkte UNTER dem Basismodell. Ein Platz, den sie
// besetzt haetten, haette die Antworten verschlechtert.
//
// Deshalb ist ein leerer Platz der Normalfall und kein Fehler: Dort bleibt das
// Fremdmodell zustaendig, das heute schon antwortet. Die Struktur steht, die
// Plaetze fuellen sich von selbst — sobald eine Version die Messung besteht.

/** Die vier Plaetze, vom leichtesten zum schwersten. */
export const PLAETZE = Object.freeze([
  Object.freeze({
    platz: "schnell", profil: "fast", rang: 1,
    rolle: "Kurze Fragen, Nachfragen, Bestaetigungen",
    warum: "Eine Frage unter 80 Zeichen braucht Tempo, nicht Tiefe."
  }),
  Object.freeze({
    platz: "alltag", profil: "default", rang: 2,
    rolle: "Der Normalfall — alles, was nicht in eine andere Schublade faellt",
    warum: "Der Platz, der am haeufigsten dran ist; hier zaehlt Ausgewogenheit."
  }),
  Object.freeze({
    platz: "code", profil: "coding", rang: 3,
    rolle: "Programmieren, Fehlersuche, Patches",
    warum: "Code verlangt Genauigkeit im Detail — ein Zeichen falsch, und nichts laeuft."
  }),
  Object.freeze({
    platz: "schwer", profil: "reasoning", rang: 4,
    rolle: "Analyse, Architektur, Begruendungen, Vergleiche",
    warum: "Hier darf es dauern; falsch waere teurer als langsam."
  })
]);

/** Was eine Version mitbringen muss, um einen Platz besetzen zu duerfen. */
export const AUFNAHME = Object.freeze({
  /** Sie muss das Basismodell ohne Adapter schlagen — sonst schadet sie. */
  besserAlsBasis: true,
  /** Kein einziger kritischer Fehler. Ein Sicherheitsverstoss ist kein Punktabzug. */
  maxKritisch: 0,
  /** Mindestabstand zur Basis in Punkten, damit Messrauschen keine Befoerderung traegt. */
  mindestVorsprung: 2
});

/**
 * Darf diese Version einen Platz besetzen? Rein und testbar.
 * Fail-closed: jede fehlende Zahl ist ein Nein.
 *
 * @param {{version: string, note: number, basisNote: number, kritisch: number, status?: string}} v
 */
export function darfBesetzen(v) {
  if (!v || typeof v !== "object") return { ok: false, grund: "keine Bewertung" };
  if (v.status === "ungueltig") return { ok: false, grund: "Bewertung als ungueltig gekennzeichnet" };
  const note = Number(v.note), basis = Number(v.basisNote), kritisch = Number(v.kritisch);
  if (!Number.isFinite(note) || !Number.isFinite(basis)) return { ok: false, grund: "Note oder Basisnote fehlt" };
  if (!Number.isFinite(kritisch)) return { ok: false, grund: "Zahl der kritischen Fehler fehlt" };
  if (kritisch > AUFNAHME.maxKritisch) return { ok: false, grund: `${kritisch} kritische Fehler` };
  const vorsprung = (note - basis) * 100;
  if (vorsprung < AUFNAHME.mindestVorsprung) {
    return { ok: false, grund: `${vorsprung.toFixed(1)} Punkte gegen die Basis — verlangt sind ${AUFNAHME.mindestVorsprung}` };
  }
  return { ok: true, vorsprung };
}

/**
 * Belegt die Plaetze aus den vorliegenden Bewertungen.
 *
 * Die beste zugelassene Version bekommt den SCHWERSTEN Platz — dort faellt
 * Qualitaet am meisten ins Gewicht. Reichen die Versionen nicht fuer alle
 * Plaetze, bleiben die leichten frei; dort ist das Fremdmodell ohnehin schnell
 * genug.
 *
 * @param {Array} bewertungen
 * @returns {Array<{platz, profil, version: string|null, note: number|null, grund: string}>}
 */
export function belegePlaetze(bewertungen = []) {
  const zugelassen = [];
  for (const b of bewertungen) {
    const urteil = darfBesetzen(b);
    if (urteil.ok) zugelassen.push({ ...b, vorsprung: urteil.vorsprung });
  }
  // Beste zuerst — sie bekommt den schwersten Platz.
  zugelassen.sort((a, b) => Number(b.note) - Number(a.note));
  const nachRang = [...PLAETZE].sort((a, b) => b.rang - a.rang);

  const belegt = new Map();
  for (let i = 0; i < nachRang.length; i += 1) {
    const kandidat = zugelassen[i];
    belegt.set(nachRang[i].platz, kandidat || null);
  }
  return PLAETZE.map((p) => {
    const v = belegt.get(p.platz);
    return {
      platz: p.platz, profil: p.profil, rolle: p.rolle,
      version: v?.version ?? null,
      note: v ? Number(v.note) : null,
      grund: v ? `besteht mit ${(Number(v.note) * 100).toFixed(1)} % (${v.vorsprung.toFixed(1)} Punkte ueber Basis)`
        : "frei — kein eigenes Modell hat die Messung bestanden; das Fremdmodell bleibt zustaendig"
    };
  });
}

/**
 * Welches Modell fuer ein Profil? `null` heisst: Fremdmodell, wie bisher.
 * Der Router ruft das auf, nachdem er das Profil bestimmt hat.
 */
export function modellFuerProfil(profil, belegung) {
  const treffer = (belegung || []).find((b) => b.profil === profil);
  return treffer?.version || null;
}
