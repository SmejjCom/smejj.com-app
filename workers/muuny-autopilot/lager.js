// muuny AI — Lager und Umgebung (Single Responsibility: WO liegt etwas, und WIE heisst der Schalter dafuer).
//
// Zwei Dinge haben sich beim Umzug von "con" auf "muuny" geaendert, und nur zwei:
//   1. das e2-Prefix (con/ -> muuny/)
//   2. die Namen der Umgebungsvariablen (CON_* -> MUUNY_*)
//
// Beides steht ab jetzt NUR hier. Vorher war "con/" ueber neun Dateien verstreut;
// ein Umzug bedeutete, in jeder einzelnen zu suchen — und eine vergessene Stelle
// haette den Autopiloten still in zwei Lager schreiben lassen (Register hier,
// Kosten dort), ohne dass ein Test das bemerkt.
//
// Rueckfall auf die alten CON_*-Namen: der Zeabur-Dienst traegt seine 21 Variablen
// noch unter den alten Namen. Sie werden weiter gelesen, damit ein Redeploy nicht
// in dem Moment stehenbleibt, in dem der Betreiber gerade nicht am Rechner sitzt.
// Der neue Name gewinnt immer, wenn beide gesetzt sind.

/** Das Prefix im e2-Bucket, immer mit Schraegstrich am Ende. */
export function lagerPrefix(env = process.env) {
  const roh = String(env.MUUNY_LAGER_PREFIX || env.CON_LAGER_PREFIX || "muuny").trim();
  return roh.replace(/^\/+|\/+$/g, "") + "/";
}

/**
 * Ein Wert aus der Umgebung, neuer Name zuerst.
 * @param {string} name  ohne Praefix, z. B. "SALAD_FREIGABE"
 */
export function wert(env, name) {
  const neu = env[`MUUNY_${name}`];
  if (neu !== undefined && String(neu).trim() !== "") return neu;
  return env[`CON_${name}`];
}

/** Wie `wert`, aber liefert immer eine Zeichenkette (nie undefined). */
export function text(env, name, standard = "") {
  const w = wert(env, name);
  return w === undefined || w === null ? standard : String(w);
}

/** Der Familienname. Steckt in jeder Versionsnummer (muuny-1.3) und in jeder Job-Kennung. */
export const FAMILIE = "muuny";

/**
 * Das Lager als fertige Schluessel. Eine Funktion, kein Objekt-Literal: das Prefix
 * darf sich im Test aendern, ohne dass das Modul neu geladen werden muss.
 */
export function schluessel(env = process.env) {
  const p = lagerPrefix(env);
  return {
    prefix: p,
    registry: `${p}registry.json`,
    deploy: `${p}deploy.json`,
    zustand: `${p}autopilot/zustand.json`,
    datensaetze: `${p}datasets`,
    datensatzIndex: `${p}datasets/index.json`,
    kosten: `${p}logs/kosten`,
    kostenGesamt: `${p}logs/kosten/gesamt.json`,
    tasks: `${p}logs/tasks`,
    taskIndex: `${p}logs/tasks/index.json`,
    jobs: `${p}logs/jobs`,
    versionen: `${p}versions`,
    evals: `${p}evals`,
    deployMetriken: `${p}deploy-metriken`,
    // Vergleichswert: die gemessene Note des UNTRAINIERTEN Grundmodells.
    grundmodell: `${p}grundmodell/messung.json`,
    // Echte Lernpaare (Daumen hoch + Einwilligung), eine unveraenderliche Datei je Paar.
    paare: `${p}training/paare`,
    // Stand der letzten Runde: {paare, datensatz, am}. Das Tor rechnet dagegen.
    paarStand: `${p}training/stand.json`,
    // Freigabe fuer die Laufzeit: welcher Adapter live ist. Geloescht = Grundmodell.
    freigabe: `${p}freigabe.json`
  };
}

/** Bequemer Zugriff fuer Module, die keine eigene Konfiguration durchreichen. */
export const L = schluessel();
