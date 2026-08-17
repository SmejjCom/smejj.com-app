// smejj.com Maus-Engine — Schritt-Pruefer.
// Single Responsibility: in einem Plan die Schritte finden, die den Zustand
// der Seite veraendern, ohne dass danach jemals geprueft wird, OB sie gewirkt
// haben. Reine Analyse, kein Modell, keine Seite, keine Nebenwirkung.
//
// WARUM ES DAS GIBT
// Die fuehrenden Browser-Agenten pruefen nach JEDEM Schritt, ob der erwartete
// Zustand eingetreten ist ("Planner-Agent-Validator"). Der Grund ist nicht
// Ordnungsliebe: ein Klick, der ins Leere ging, faellt sonst erst viel spaeter
// auf — und bis dahin baut der Plan auf einer Seite auf, die er gar nicht vor
// sich hat. Der Fehler wandert, und die Fehlermeldung zeigt am Ende auf einen
// Schritt, der gar nichts falsch gemacht hat.
//
// WARUM ALS PLAN-ANALYSE UND NICHT ZUR LAUFZEIT
// Der eigentliche Ausfuehrer (interpreter.mjs) laeuft in der Maus-Engine, und
// die haengt an einem eingefrorenen Abbild: neuer Code dort erreicht die
// Produktion nicht. Diese Datei laeuft dagegen im Planer-Rundlauf auf
// smejj-control und ist normal ausrollbar. Und sie braucht die Engine gar
// nicht zu aendern — `waitFor` und `assert` kann die vorhandene Engine seit
// jeher ausfuehren. Der Pruefer sorgt nur dafuer, dass sie auch im Plan stehen.

// Schritte, nach denen sich die Seite veraendert haben MUSS, damit der Rest
// des Plans Sinn ergibt. Bewusst eng gehalten: hier steht nur, was ohne
// Nachweis wirklich gefaehrlich ist. Ein `scroll` oder `hover` etwa kann
// folgenlos bleiben, ohne dass der Plan dadurch falsch wird.
export const VERAENDERNDE_AKTIONEN = Object.freeze([
  "navigate", "openLink", "click", "doubleClick", "type", "fillForm",
  "hotkey", "dragAndDrop", "uploadFile", "switchTab", "runMacro"
]);

// Schritte, die einen Nachweis erbringen: sie scheitern, wenn der Zustand
// nicht stimmt, und stoppen den Lauf damit an der richtigen Stelle.
//
// `screenshot` steht bewusst NICHT hier. Ein Bild gelingt immer — auch von
// der falschen Seite. Es ist ein Beweis fuer Menschen hinterher, kein Nachweis
// fuer die Maschine waehrenddessen. Genau diese Verwechslung ist der Grund,
// warum ein Lauf "erfolgreich" aussehen kann und trotzdem nichts getan hat.
export const NACHWEIS_AKTIONEN = Object.freeze(["waitFor", "assert", "extract", "extractTable"]);

/**
 * Findet veraendernde Schritte ohne Nachweis.
 *
 * Als Nachweis zaehlt jeder Nachweis-Schritt, der VOR der naechsten
 * veraendernden Aktion kommt. Ein einzelner `waitFor` deckt also den einen
 * Schritt davor ab — nicht eine ganze Kette von Klicks.
 *
 * @param {object} plan Ein bereits schemavalider Plan.
 * @returns {Array<{id:string, action:string, index:number}>}
 */
export function ungepruefteSchritte(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const offen = [];
  const ergebnis = [];
  steps.forEach((step, index) => {
    const action = String(step?.action || "");
    if (NACHWEIS_AKTIONEN.includes(action)) {
      offen.length = 0;
      return;
    }
    if (VERAENDERNDE_AKTIONEN.includes(action)) {
      // Ein zweiter veraendernder Schritt ohne Nachweis dazwischen laesst den
      // ersten endgueltig ungeprueft: was er bewirkt hat, ist ab jetzt nicht
      // mehr feststellbar.
      ergebnis.push(...offen);
      offen.length = 0;
      offen.push({ id: String(step?.id ?? `#${index}`), action, index });
    }
  });
  // Was am Planende offen bleibt, bleibt ungeprueft — closeBrowser und
  // screenshot beweisen nichts.
  ergebnis.push(...offen);
  return ergebnis.sort((a, b) => a.index - b.index);
}

/** Kurze, menschenlesbare Begruendung fuer den Planer. */
export function nachweisHinweis(offene) {
  if (!offene.length) return "";
  const liste = offene.map((s) => `${s.id} (${s.action})`).join(", ");
  return [
    `Diese Schritte veraendern die Seite, werden aber nie geprueft: ${liste}.`,
    "Setze hinter jeden davon einen waitFor oder assert, der belegt, dass er",
    "gewirkt hat — z. B. waitFor selectorVisible auf ein Element, das erst",
    "danach existiert, oder assert urlMatches nach einer Navigation.",
    "Ein screenshot zaehlt NICHT als Nachweis: ein Bild gelingt auch von der",
    "falschen Seite."
  ].join("\n");
}
