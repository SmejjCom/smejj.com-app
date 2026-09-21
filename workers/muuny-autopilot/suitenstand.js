// muuny AI — Stammen zwei Noten von derselben Latte?
//
// Eigene Datei, damit Kreislauf und Entscheidung dieselbe Pruefung benutzen,
// ohne sich gegenseitig zu importieren.

/**
 * Welche Suiten weichen ab? Fehlt einer der beiden Staende, ist ALLES
 * abweichend — ein unbekannter Stand ist kein gleicher Stand (fail-closed).
 * @returns {string[]} die Kennungen der abweichenden Suiten
 */
export function abweichendeSuitenStand(gemessen, aktuell) {
  if (!aktuell || typeof aktuell !== "object" || !Object.keys(aktuell).length) return ["aktueller_stand_unbekannt"];
  if (!gemessen || typeof gemessen !== "object") return Object.keys(aktuell);
  const alle = new Set([...Object.keys(aktuell), ...Object.keys(gemessen)]);
  return [...alle].filter((id) => gemessen[id] !== aktuell[id]);
}
