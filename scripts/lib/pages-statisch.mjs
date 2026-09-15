// smejj.com — Welche Adressen der Admin-Konsole liefert GitHub Pages STATISCH aus?
//
// WARUM ES DIESE LISTE GIBT (15.09.): Der Prüfstand scripts/check-admin-konsole.mjs
// fragt jede Adresse, die die Konsole ruft, beim Control-Server-Handler an. Eine
// Datei, die auf smejj.com nur statisch bei GitHub Pages liegt, kennt dieser
// Handler nicht — der Prüfstand meldete "kein Handler zuständig", obwohl die
// Datei ausgeliefert wird. Deshalb hat die Radar-Ansicht auf smejj.com zuerst
// die Admin-Adresse gerufen, die es auf Pages NICHT gibt: ein echter 404 in der
// Browser-Konsole, nur um den Prüfstand ruhig zu halten.
//
// ERLAUBNISLISTE, keine Ausnahme ins Blaue: Jede Adresse nennt die Datei im Repo,
// aus der sie stammt. Fehlt die Datei, ist das ein Befund — eine statische
// Adresse ohne Datei wäre auf Pages genauso tot wie eine Route ohne Handler.
//
//   /radar/berichte.json  public/radar/berichte.json, im Frontend-Klon unter
//                         radar/berichte.json (von Hand gepflegt, zuerst mit
//                         "feat(admin): Konkurrenz-Radar als Stufe 10").
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export const STATISCHE_PAGES_DATEIEN = Object.freeze({
  "/radar/berichte.json": "public/radar/berichte.json"
});

/**
 * Ist die gerufene Adresse eine statische Pages-Datei?
 *
 * @returns {null | {quelle: string, vorhanden: boolean}} null = keine statische
 *   Adresse, weiter zum Handler; sonst die Repo-Datei und ob es sie gibt.
 */
export function statischePagesDatei(methode, pfad, {
  liste = STATISCHE_PAGES_DATEIEN,
  existiert = (relativ) => existsSync(path.join(WURZEL, relativ))
} = {}) {
  // Pages beantwortet nur Lesen; ein POST auf dieselbe Adresse bleibt ein Befund.
  if (String(methode || "GET").toUpperCase() !== "GET") return null;
  const ohneSuche = String(pfad || "").split(/[?#]/)[0];
  if (!Object.hasOwn(liste, ohneSuche)) return null;
  const quelle = liste[ohneSuche];
  return { quelle, vorhanden: Boolean(existiert(quelle)) };
}
