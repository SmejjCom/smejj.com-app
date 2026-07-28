// smejj.com — begrenzt nebenlaeufiges Holen vieler Objekte (Single Responsibility: Gleichzeitigkeit).
//
// Warum es das gibt: Audit-Log, Freigaben und Impersonation holen je Eintrag ein
// Objekt aus IDrive e2. Nacheinander summieren sich die Rundreisen — live
// gemessen 2026-07-28: 11 Eintraege = 1115 ms, bei 50 waeren es Sekunden.
//
// Warum begrenzt und nicht "alle auf einmal": der Control-Server hat 2 vCPU, und
// 200 gleichzeitige Verbindungen gegen den Objektspeicher waeren kein Fortschritt,
// sondern eine Selbstueberlastung. Acht ist genug, um die Latenz zu verstecken,
// und wenig genug, um niemanden zu ueberrennen.
//
// Die Reihenfolge der Ergebnisse entspricht der Reihenfolge der Eingaben —
// darauf verlassen sich die Aufrufer (juengster Eintrag zuerst).

const STANDARD_GLEICHZEITIG = 8;

/**
 * Fuehrt `aufgabe` fuer jeden Eintrag aus, hoechstens `gleichzeitig` davon
 * parallel. Ein Fehler in einer Aufgabe ergibt `null` an ihrer Stelle und
 * kippt nie den ganzen Lauf — ein unlesbares Objekt darf keine Liste zerstoeren.
 *
 * @param {Array} eintraege
 * @param {(eintrag: any, index: number) => Promise<any>} aufgabe
 * @param {number} gleichzeitig
 * @returns {Promise<Array>} Ergebnisse in der Reihenfolge der Eingaben
 */
export async function mapMitGrenze(eintraege, aufgabe, gleichzeitig = STANDARD_GLEICHZEITIG) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  const grenze = Math.min(Math.max(1, Number(gleichzeitig) || STANDARD_GLEICHZEITIG), 16);
  const ergebnisse = new Array(liste.length).fill(null);
  let naechster = 0;

  async function arbeiter() {
    while (true) {
      const index = naechster;
      naechster += 1;
      if (index >= liste.length) return;
      try {
        ergebnisse[index] = await aufgabe(liste[index], index);
      } catch {
        ergebnisse[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(grenze, liste.length) }, arbeiter));
  return ergebnisse;
}
