#!/usr/bin/env node
// smejj.com — Waechter gegen den RUECKFALL von Memory_Bank.md.
//
// WARUM ES IHN GIBT (2026-08-23). Memory_Bank.md ist die einzige Datei des
// Projekts, die von SELBST waechst: jeder abgeschlossene Auftrag haengt einen
// Eintrag an, oft mehrere Sitzungen am selben Tag. Sie ist damit die einzige
// Datei, bei der die 800-Zeilen-Regel nicht durch einen Umbau ein fuer alle
// Mal erledigt ist, sondern immer wieder neu reisst.
//
// Zweimal gemessen, beide Male dasselbe Muster:
//   2026-08-03  868 -> 649 Zeilen (Commit 46ed4b16)
//   2026-08-23  891 -> 733 Zeilen (Commit 179b7011)
// Dazwischen: 20 Tage, in denen niemand hinsah, bis check:guidelines rot war.
// An dem Tag, an dem sie rot ist, stolpern ALLE Parallelsitzungen darueber —
// die Meldung gehoert also VOR die Grenze, nicht dahinter.
//
// Der zweite, gefaehrlichere Rueckfall ist nicht die Laenge, sondern das
// KUERZEN SELBST. Eine Kurzfassung ist nur dann verlustfrei, wenn der Volltext
// wirklich dort liegt, wohin sie zeigt. Zeigt der Verweis ins Leere, ist der
// Eintrag weg — und niemand merkt es, weil die Kurzfassung plausibel aussieht.
// Genau dieser Verdacht stand am 2026-08-23 im Auftrag ("capsule.json existiert
// nicht"); er war diesmal falsch, aber er ist die richtige Frage.
//
// Der Waechter prueft darum DREI Zusagen:
//   1. LAENGE   — ueber 800 Zeilen ist ein Fehler, ab 760 eine Warnung mit
//                 Handlungsanweisung (welche Abschnitte auszulagern sind).
//   2. VERWEISE — jeder genannte Pfad nach docs/memory/ oder task-capsules/
//                 muss existieren. Ein toter Verweis ist verlorener Inhalt.
//   3. SELBSTPRUEFUNG — findet der Waechter in einer grossen Datei fast keine
//                 Verweise, ist sein eigenes Muster kaputt. Ein Pruefer, der
//                 bei leerer Trefferliste gruen meldet, ist schlimmer als kein
//                 Pruefer (siehe tests/waechter-tuev.test.mjs).
//
// Fail-closed: Zusage 1 (ueber Limit), 2 und 3 beenden den Lauf mit Exit 1.
// Die Warnung unterhalb des Limits meldet Exit 0 — sie soll aufmerksam machen,
// nicht die Arbeit anderer Sitzungen blockieren.
import { existsSync, readFileSync } from "node:fs";

const DATEI = process.env.MEMORY_BANK_DATEI ?? "Memory_Bank.md";
const LIMIT = 800;
// 40 Zeilen Puffer — das ist ungefaehr EIN Tageseintrag. Wer die Warnung sieht,
// hat also noch genau einen Auftrag Zeit, bevor die Datei rot wird.
const WARNSCHWELLE = 760;
// Ab dieser Groesse muss die Datei ausgelagerte Teile haben. Kleinere Dateien
// (Proben, frisch angelegte Baenke) sind davon frei.
const SELBSTPRUEFUNG_AB_ZEILEN = 200;
const MINDEST_VERWEISE = 10;

// Nur BEWUSST formatierte Verweise zaehlen: ein Markdown-Link oder ein Pfad in
// Backticks. Fliesstext wie "steht in der Capsule von gestern" ist keine Zusage
// und wird nicht geprueft — sonst meldet der Waechter Prosa als Fehler.
const VERWEIS_MUSTER = [
  // [Text](pfad.md) — deckt auch Archive im Projektstamm, z. B.
  // Memory_Bank_Archiv_bis_2026-08-05.md, die nicht unter docs/ liegen.
  /\[[^\]]*\]\(([^)\s]+?\.(?:md|json))\)/g,
  // `ordner/datei.md` — Backtick-Pfad MIT Schraegstrich. Ohne Schraegstrich
  // waere es ein blosser Dateiname (`chat-store.js`), kein Verweis auf Inhalt.
  /`([\w./-]*\/[\w.-]+\.(?:md|json))`/g,
];
const KEIN_REPO_PFAD = /^(?:https?:|s3:|mailto:|data:|#)/;

/**
 * Ist der Pfad ueberhaupt als REPO-Datei gemeint?
 *
 * Befund beim ersten Lauf: Das Backtick-Muster fing
 * `admin/index/analytik-tage.json` — einen Schluessel im Objektspeicher auf
 * IDrive e2, der im Repo nie existieren wird. Ein Waechter, der so etwas als
 * "toten Verweis" meldet, erzeugt Arbeit, die es nicht gibt, und wird darum
 * bald ignoriert.
 *
 * Die Unterscheidung ist einfach und braucht keine Pflegeliste: ein Repo-Pfad
 * beginnt mit einem Ordner, den es im Repo GIBT. `docs/…` wird geprueft,
 * `admin/…` nicht. Markdown-Links sind davon ausgenommen — die sind immer
 * repo-relativ gemeint, sonst waeren sie keine Links.
 */
function istRepoPfad(pfad, ausLink, existiert) {
  if (ausLink) return true;
  const [erstesSegment] = pfad.split("/");
  return existiert(erstesSegment);
}
// Eintraege, die auf dem BAU-BRANCH umgesetzt wurden, nennen bewusst Pfade, die
// es hier nicht gibt (siehe job_autopiloten_seite_20260823). Sie werden nicht
// als tot gemeldet, aber GEZAEHLT — unsichtbar sollen sie nicht sein.
const ANDERSWO = /Bau-Branch|anderer Branch/i;

/** Ein Abschnitt, der Auslagerung behauptet, muss auch einen Pfad nennen. */
const BEHAUPTET_AUSLAGERUNG = /\bausgelagert\b|\bVolltext\b/i;

export function pruefeMemoryBank(text, existiert = existsSync) {
  const zeilen = text.split("\n");
  const zeilenzahl = text.endsWith("\n") ? zeilen.length - 1 : zeilen.length;
  const fehler = [];
  const warnungen = [];

  // --- Zusage 2: kein toter Verweis -----------------------------------------
  // Zeilenweise, damit die Bau-Branch-Ausnahme am Kontext haengt, nicht am Pfad.
  const verweise = new Set();
  const anderswo = new Set();
  for (const zeile of zeilen) {
    VERWEIS_MUSTER.forEach((muster, index) => {
      const ausLink = index === 0; // Muster 0 ist die Markdown-Link-Form.
      for (const treffer of zeile.matchAll(new RegExp(muster.source, "g"))) {
        const pfad = treffer[1];
        if (KEIN_REPO_PFAD.test(pfad)) continue;
        if (!istRepoPfad(pfad, ausLink, existiert)) continue;
        (ANDERSWO.test(zeile) ? anderswo : verweise).add(pfad);
      }
    });
  }
  const tote = [...verweise].filter((pfad) => !existiert(pfad.split("#")[0]));
  for (const pfad of tote.sort()) {
    fehler.push(`toter Verweis: \`${pfad}\` — der Volltext liegt nicht dort. Erst anlegen, dann kuerzen.`);
  }

  // --- Zusage 3: der Waechter prueft sich selbst -----------------------------
  if (zeilenzahl > SELBSTPRUEFUNG_AB_ZEILEN && verweise.size < MINDEST_VERWEISE) {
    fehler.push(
      `Selbstpruefung: nur ${verweise.size} Verweise in ${zeilenzahl} Zeilen gefunden ` +
        `(erwartet mindestens ${MINDEST_VERWEISE}). Entweder fehlen die Auslagerungen — ` +
        `oder das Suchmuster dieses Waechters passt nicht mehr auf die Schreibweise.`,
    );
  }

  // --- Abschnitte vermessen (fuer Laengenmeldung und Auslagerungs-Pruefung) ---
  const abschnitte = [];
  let offen = null;
  zeilen.forEach((zeile, index) => {
    if (/^#{2,3} /.test(zeile)) {
      if (offen) abschnitte.push({ ...offen, ende: index });
      offen = { titel: zeile.replace(/^#+ /, ""), start: index, zeilen: [] };
    }
    if (offen) offen.zeilen.push(zeile);
  });
  if (offen) abschnitte.push({ ...offen, ende: zeilen.length });
  for (const a of abschnitte) {
    a.laenge = a.ende - a.start;
    a.text = a.zeilen.join("\n");
  }

  // Ein Abschnitt, der "ausgelagert"/"Volltext" sagt, muss einen Pfad nennen.
  // Das ist die Kernzusage beim Kuerzen: eine Kurzfassung ohne Ziel ist Verlust.
  const nenntPfad = (abschnittstext) =>
    VERWEIS_MUSTER.some((muster, index) =>
      [...abschnittstext.matchAll(new RegExp(muster.source, "g"))].some(
        (t) => !KEIN_REPO_PFAD.test(t[1]) && istRepoPfad(t[1], index === 0, existiert),
      ),
    );
  for (const a of abschnitte) {
    if (!BEHAUPTET_AUSLAGERUNG.test(a.text)) continue;
    if (!nenntPfad(a.text)) {
      fehler.push(`"${a.titel}" behauptet eine Auslagerung, nennt aber keinen Pfad zum Volltext.`);
    }
  }

  // --- Zusage 1: Laenge ------------------------------------------------------
  const kandidaten = abschnitte
    .filter((a) => a.laenge >= 30)
    .sort((a, b) => b.laenge - a.laenge)
    .slice(0, 3);

  if (zeilenzahl > LIMIT) {
    fehler.push(`${DATEI}: ${zeilenzahl} Zeilen (Limit ${LIMIT}) — den naechsten Eintrag auslagern.`);
  } else if (zeilenzahl >= WARNSCHWELLE) {
    warnungen.push(
      `${DATEI}: ${zeilenzahl} Zeilen — noch ${LIMIT - zeilenzahl} bis zum Limit ${LIMIT}. ` +
        `Beim naechsten Eintrag zuerst auslagern.`,
    );
  }

  return { zeilenzahl, verweise: verweise.size, anderswo: anderswo.size, fehler, warnungen, kandidaten };
}

/** Handlungsanweisung statt blosser Meldung: WAS soll ausgelagert werden. */
function nenneKandidaten(kandidaten) {
  if (kandidaten.length === 0) return;
  console.error("  Laengste Abschnitte — Volltext nach task-capsules/ oder docs/memory/, Kurzfassung mit Verweis behalten:");
  for (const a of kandidaten) console.error(`    ${String(a.laenge).padStart(3)} Zeilen  ${a.titel}`);
}

const direktAufgerufen = process.argv[1] && process.argv[1].endsWith("check-memory-bank.mjs");
if (direktAufgerufen) {
  if (!existsSync(DATEI)) {
    console.error(`check:memory-bank FAILED — ${DATEI} nicht gefunden.`);
    process.exit(1);
  }
  const { zeilenzahl, verweise, anderswo, fehler, warnungen, kandidaten } = pruefeMemoryBank(
    readFileSync(DATEI, "utf8"),
  );

  if (fehler.length > 0) {
    console.error(`check:memory-bank FAILED (${fehler.length} Verstoesse):`);
    for (const f of fehler) console.error(`  - ${f}`);
    nenneKandidaten(kandidaten);
    process.exit(1);
  }
  for (const w of warnungen) {
    console.warn(`check:memory-bank WARNUNG — ${w}`);
    nenneKandidaten(kandidaten);
  }
  const nachtrag = anderswo > 0 ? `, ${anderswo} auf einem anderen Branch (nicht pruefbar)` : "";
  // Bei einer Warnung waere ein zusaetzliches "OK" irrefuehrend — die Datei ist
  // formal in Ordnung, aber sie braucht Arbeit. Nur die Verweise sind dann gut.
  console.log(
    warnungen.length > 0
      ? `check:memory-bank — ${verweise} Verweise geprueft, alle vorhanden${nachtrag}. Laenge siehe Warnung oben.`
      : `check:memory-bank OK — ${zeilenzahl}/${LIMIT} Zeilen, ${verweise} ausgelagerte Verweise alle vorhanden${nachtrag}.`,
  );
}
