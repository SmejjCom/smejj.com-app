#!/usr/bin/env node
// smejj.com — prueft die von Hand erfassten Fragevarianten.
//
// Aufruf:  npm run training:fragen-pruefen
//
// Prueft drei Dinge, in dieser Reihenfolge:
//   1. HERKUNFT — nur 'hand' und 'nutzerfrage'. Von einem Sprachmodell erzeugte
//      Fragen sind gesperrt (Trainingsdaten-Policy). Fail-closed.
//   2. FORM — Varianten desselben Fakts muessen sich unterscheiden, die Frage
//      darf die Antwort nicht enthalten, Laenge im Rahmen.
//   3. ANSCHLUSS — jeder Eintrag muss auf einen Abschnitt zeigen, den der
//      Korpusbauer wirklich findet. Sonst sammelt man Fragen zu Ueberschriften,
//      die es nicht (mehr) gibt, und merkt es erst beim Training.
//
// Exit-Code 1, sobald ein Eintrag durchfaellt — damit der Pflicht-Check greift.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slug, zeilenAusDokument } from "../../src/training/projectcorpus/extract.js";
import { faktSchluessel, pruefeSammlung } from "../../src/training/projectcorpus/fragevarianten.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const VARIANTEN = "training-fragen/varianten.json";

// Dieselben Quellen wie der Korpusbauer. Bewusst dupliziert und nicht
// importiert: build_project_corpus.mjs exportiert sie nicht, und ein Umbau
// dieser Datei gehoert nicht in ein Pruefwerkzeug.
const QUELLEN = ["AI_Guidelines.md", "Project_Goals.md", "README.md",
  "docs/architecture", "docs/frontend", "docs/deployment", "docs/security"];
const AUSGESCHLOSSEN = [/task-capsules/i, /benchmarks/i, /CHANGELOG/i];

function sammleDateien(eintrag) {
  const absolut = path.join(REPO_ROOT, eintrag);
  let zustand;
  try {
    zustand = statSync(absolut);
  } catch {
    return [];
  }
  if (zustand.isFile()) return [eintrag];
  const gefunden = [];
  const lauf = (relativ) => {
    for (const e of readdirSync(path.join(REPO_ROOT, relativ), { withFileTypes: true })) {
      const kind = `${relativ}/${e.name}`;
      if (e.isDirectory()) lauf(kind);
      else if (e.name.endsWith(".md")) gefunden.push(kind);
    }
  };
  lauf(eintrag);
  return gefunden;
}

/** Alle Fakten, die der Korpusbauer heute findet — als Schluesselmenge. */
export function bekannteFakten(sammle = sammleDateien, lies = (d) => readFileSync(path.join(REPO_ROOT, d), "utf8")) {
  const schluessel = new Set();
  const dateien = [...new Set(QUELLEN.flatMap(sammle))]
    .filter((d) => !AUSGESCHLOSSEN.some((muster) => muster.test(d)));
  for (const datei of dateien) {
    let zeilen = [];
    try {
      zeilen = zeilenAusDokument({ pfad: datei, inhalt: lies(datei), systemText: "x" }) || [];
    } catch {
      continue;
    }
    // Die Korpuszeile traegt KEINE Ueberschrift, sondern eine Kennung der Form
    // "pfad#ebene-slug-index". Der Fakt ist alles bis auf den Schablonenindex.
    for (const zeile of zeilen) {
      const kennung = String(zeile?.id || "");
      const ohneIndex = kennung.replace(/-\d+$/, "");
      if (ohneIndex.includes("#")) schluessel.add(ohneIndex);
    }
  }
  return schluessel;
}

function main() {
  let sammlung;
  try {
    sammlung = JSON.parse(readFileSync(path.join(REPO_ROOT, VARIANTEN), "utf8"));
  } catch (fehler) {
    process.stderr.write(`Abbruch: ${VARIANTEN} nicht lesbar (${String(fehler?.message || fehler).slice(0, 100)})\n`);
    process.exitCode = 1;
    return;
  }

  const { angenommen, abgelehnt, kennzahlen } = pruefeSammlung(sammlung);

  if (kennzahlen.eintraege === 0) {
    process.stdout.write([
      `${VARIANTEN}: noch keine Eintraege.`,
      "",
      "Das ist der Auslieferungszustand, kein Fehler. Die Fragen muessen von",
      "Menschen geschrieben oder echten Nutzerfragen entnommen sein — ein",
      "Sprachmodell darf sie nicht erzeugen (Trainingsdaten-Policy).",
      "",
      "Warum es sie braucht: der Korpus hat 699 Fakten mit je drei fest",
      "verdrahteten Fragenformen. Die Pruefsuite stellt 295 natuerliche Fragen.",
      "Diese Luecke ist der gemessene Grund, warum das Training bisher",
      "verschlechtert (95,88 % -> 67,89 %).",
      ""
    ].join("\n"));
    return;
  }

  // Anschlusspruefung nur fuer Eintraege, die Form und Herkunft bestanden haben.
  const fakten = bekannteFakten();
  // Derselbe Schluessel wie im Korpus: Pfad, Ebene und Slug der Ueberschrift.
  // Die Ebene ist nicht bekannt, darum wird ueber das Slug-Ende verglichen.
  const verwaist = angenommen
    .filter((e) => {
      const endung = `-${slug(String(e.ueberschrift || ""))}`;
      const pfad = `${String(e.quelle || "").trim()}#`;
      return ![...fakten].some((k) => k.startsWith(pfad) && k.endsWith(endung));
    })
    .map((e) => faktSchluessel(e.quelle, e.ueberschrift));

  process.stdout.write([
    `Eintraege        ${kennzahlen.eintraege}`,
    `angenommen       ${kennzahlen.angenommen}`,
    `abgelehnt        ${kennzahlen.abgelehnt}`,
    `Fragen gesamt    ${kennzahlen.fragen}  (${kennzahlen.fragenJeFakt} je Fakt)`,
    `ohne Anschluss   ${verwaist.length}`,
    ""
  ].join("\n"));

  for (const eintrag of abgelehnt) {
    process.stdout.write(`  ABGELEHNT ${faktSchluessel(eintrag.quelle, eintrag.ueberschrift)} — ${eintrag.gruende.join(", ")}\n`);
  }
  for (const schluessel of verwaist) {
    process.stdout.write(`  OHNE ANSCHLUSS ${schluessel} — der Korpusbauer findet diesen Abschnitt nicht\n`);
  }

  if (abgelehnt.length > 0 || verwaist.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  main();
}
