// smejj.com — Konto-Index: eine Datei statt 92 Abrufe.
//
// DER BEFUND (live gemessen 2026-08-20): `/api/chats?nurAbgleich=1` liefert
// 15 KB und braucht dafuer 2.330 ms. Der Grund steht in ladeChats: der Server
// holt JEDE Chat-Datei einzeln aus dem Objektspeicher, parst sie vollstaendig
// und wirft die Nachrichten dann weg. Je Seitenaufruf und Nutzer wandern so
// rund 2,5 MB durch den Control-Server, um 15 KB auszuliefern. Bei einer
// Million Nutzern ist das der teuerste einzelne Posten im ganzen System.
//
// Der Abgleich braucht drei Felder: id, updatedAt, ownerId. Die stehen ab
// jetzt gebuendelt in `chats/<konto>/_index.json`, mitgeschrieben bei jedem
// Hochladen. Aus 92 Abrufen wird einer.
//
// ---------------------------------------------------------------------------
// DIE FALLE, DIE HIER UMGANGEN WIRD
// ---------------------------------------------------------------------------
// Naheliegend waere gewesen, ganz ohne Index auszukommen: die Objektliste
// liefert `LastModified` frei mit, man koennte sie als `updatedAt` ausgeben und
// saemtliche Einzelabrufe sparen. Das waere FALSCH.
//
//   LastModified = wann die Datei HOCHGELADEN wurde
//   updatedAt    = wann der Chat BEARBEITET wurde
//
// Hochgeladen wird nach dem Bearbeiten, also ist LastModified immer etwas
// groesser. Der Client vergleicht `fern > lokal`: der Fern-Stand saehe damit
// dauerhaft neuer aus, der Client holte den Chat, importierte den echten
// (aelteren) Wert — und holte ihn beim naechsten Aufruf wieder. Genau die
// Endlosschleife, die am 2026-08-20 abgestellt wurde. Der Index traegt deshalb
// den ECHTEN `updatedAt` aus dem Chat.
//
// ---------------------------------------------------------------------------
// WIE DIE FRISCHE GEPRUEFT WIRD — OHNE UHRENVERGLEICH
// ---------------------------------------------------------------------------
// Ein Index, der stillschweigend veraltet, ist schlimmer als keiner: ein auf
// Geraet A bearbeiteter Chat erreichte Geraet B dann NIE. Die Pruefung muss
// also luecklos sein.
//
// Sie vergleicht ausschliesslich Werte aus DERSELBEN Objektliste — also
// durchweg die Uhr des Objektspeichers, nie die des Control-Servers. Damit
// gibt es keinen Uhrenversatz, den man falsch einschaetzen koennte:
//
//   Index gilt als frisch  <=>  seine LastModified ist STRENG groesser als
//                               die jeder einzelnen Chat-Datei.
//
// Der Index wird nach der Chat-Datei geschrieben; im Normalfall ist er also
// juenger. Schlaegt sein Schreiben fehl, bleibt er aelter — und wird beim
// naechsten Lesen neu gebaut. Streng (`>`) statt `>=`, weil LastModified nur
// sekundengenau ist: faellt ein Hochladen in dieselbe Sekunde wie der Index,
// wird lieber einmal zuviel neu gebaut als einmal zu wenig.

/** Dateiname des Index — liegt im Konto-Ordner neben den Chats. */
export const INDEX_DATEI = "_index.json";

/** Format-Nummer. Ein Index mit anderer Nummer wird verworfen, nicht geraten. */
export const INDEX_VERSION = 1;

/** Voller Schluessel des Index eines Kontos. */
export function indexSchluessel(praefix, kontoId) {
  return `${praefix}/${kontoId}/${INDEX_DATEI}`;
}

/**
 * Ist dieser Schluessel der Index — und damit KEIN Chat?
 *
 * Wichtig fuer jeden Lesepfad, auch den alten Vertrag: `chatKennungGueltig`
 * wuerde "_index" durchwinken (Unterstrich ist erlaubt), der Index landete als
 * Schein-Chat ohne `id` in der Antwort. Aussortiert wird deshalb am
 * SCHLUESSEL, nicht an der Kennung.
 */
export function istIndexSchluessel(key) {
  return String(key || "").endsWith(`/${INDEX_DATEI}`);
}

/**
 * Schluessel und Aenderungszeit aus einer S3-Objektliste.
 *
 * @param {string} xml Rumpf der ListObjectsV2-Antwort.
 * @returns {Array<{key: string, zeitMs: number}>} zeitMs 0, wenn unlesbar.
 */
export function eintraegeMitZeit(xml) {
  const treffer = [];
  for (const block of String(xml || "").matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = (block[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || "";
    const roh = (block[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || "";
    if (!key) continue;
    treffer.push({ key, zeitMs: Date.parse(String(roh).trim()) || 0 });
  }
  return treffer;
}

/**
 * Darf der Index benutzt werden, statt alle Chats zu lesen?
 *
 * Fail-closed: im Zweifel `false`. Ein unnoetiger Neubau kostet Zeit, ein
 * faelschlich als frisch geltender Index kostet Daten.
 *
 * @param {Array<{key: string, zeitMs: number}>} eintraege aus eintraegeMitZeit
 * @param {string} indexKey voller Schluessel des Index
 * @returns {boolean}
 */
export function indexIstFrisch(eintraege, indexKey) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  const index = liste.find((eintrag) => eintrag.key === indexKey);
  if (!index || !index.zeitMs) return false;
  for (const eintrag of liste) {
    if (eintrag.key === indexKey) continue;
    // Unlesbare Zeit = unbekannt = nicht beweisbar frisch.
    if (!eintrag.zeitMs) return false;
    if (eintrag.zeitMs >= index.zeitMs) return false;
  }
  return true;
}

/** Die drei Felder, die der Abgleich zum Entscheiden braucht. */
function abgleichsfelder(chat) {
  return {
    id: String(chat?.id || ""),
    updatedAt: String(chat?.updatedAt || ""),
    ...(chat?.ownerId ? { ownerId: String(chat.ownerId) } : {})
  };
}

/**
 * Baut den Index aus vollstaendig gelesenen Chats.
 * Eintraege ohne `id` fallen raus — ein Eintrag, den niemand zuordnen kann,
 * hilft dem Abgleich nicht und koennte ihn verwirren.
 */
export function baueIndex(chats) {
  const liste = (Array.isArray(chats) ? chats : []).map(abgleichsfelder).filter((eintrag) => eintrag.id);
  return { version: INDEX_VERSION, chats: liste };
}

/**
 * Liest einen gespeicherten Index.
 * @returns {Array<object>|null} null bei kaputtem Rumpf oder fremder Version —
 *   der Aufrufer baut dann neu, statt mit halben Angaben zu arbeiten.
 */
export function leseIndex(roh) {
  let daten;
  try { daten = JSON.parse(String(roh || "")); } catch { return null; }
  if (!daten || daten.version !== INDEX_VERSION || !Array.isArray(daten.chats)) return null;
  const liste = daten.chats.filter((eintrag) => eintrag && typeof eintrag.id === "string" && eintrag.id);
  return liste.length === daten.chats.length ? liste : null;
}

/**
 * Traegt einen Chat in den Index ein oder ueberschreibt ihn.
 * Reine Funktion: der uebergebene Index bleibt unveraendert.
 */
export function indexEintragSetzen(chats, chat) {
  const eintrag = abgleichsfelder(chat);
  if (!eintrag.id) return Array.isArray(chats) ? [...chats] : [];
  const liste = (Array.isArray(chats) ? chats : []).filter((vorhanden) => vorhanden?.id !== eintrag.id);
  liste.push(eintrag);
  return liste;
}
