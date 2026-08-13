#!/usr/bin/env node
// smejj.com — Werkstatt-Autopilot (Nr. 30), STATION 2a: der Auftrags-Erzeuger.
//
// Nimmt die dringendste Aufgabe aus dem frisch gesammelten Backlog und macht
// daraus einen VOLLSTAENDIGEN, in sich geschlossenen Bau-Auftrag fuer die
// naechtliche Routine. "In sich geschlossen" heisst: Die Routine, die ihn
// ausfuehrt, hat KEINEN Zugriff auf diese Sitzung — alles Noetige (Kontext,
// Schutzregeln, Abnahmekriterien) steht im Auftrag selbst.
//
// SICHERHEITSMODELL (Spezifikation AUTOPILOT_30_WERKSTATT_SPEZIFIKATION.md):
//   - GENAU EINE Aufgabe je Nacht. Kleine Schritte sind pruefbar.
//   - Nur auf einem frischen feature/werkstatt-Branch, nie auf main.
//   - Gesperrte Dateien (Start-, Security-, Favicon-Lock) sind TABU;
//     das Tor (Station 3) prueft das fail-closed nach.
//   - Ohne offenes Tor VOR dem Bau gibt es keinen Auftrag: Wer auf rotem
//     Fundament baut, kann seine eigene Wirkung nicht mehr messen.
//
// Aufruf:
//   node scripts/werkstatt/baue-auftrag.mjs             # schreibt docs/werkstatt/AUFTRAG.md
//   node scripts/werkstatt/baue-auftrag.mjs --zeigen    # nur auf stdout
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACKLOG_JSON = path.join(REPO, "docs/werkstatt/backlog.json");
const ZIEL = path.join(REPO, "docs/werkstatt/AUFTRAG.md");

// Aufgaben, die eine Nacht-Routine NICHT anfassen darf, selbst wenn sie oben
// stehen: alles, was Betreiber-Entscheidungen oder fremde Portale braucht.
const NICHT_AUTOMATISIERBAR = new Set([
  "training-loop",        // Betreiber hat stillgelegt — Reaktivierung ist seine Entscheidung
  "email-zustellung"      // SMTP/Portal-Sache, kein Code
]);

/**
 * Waehlt die Aufgabe fuer heute Nacht. REINE Funktion, damit die Wahl ohne
 * Dateisystem pruefbar ist.
 *
 * Regeln: dringendste zuerst (Stufe aufsteigend); nicht Automatisierbares
 * wird uebersprungen; Ausbau-Aufgaben (Stufe 5) nur, wenn nichts Dringenderes
 * offen ist — ein roter Vorfall schlaegt jede Erweiterung.
 */
export function waehleAufgabe(aufgaben = []) {
  const kandidaten = (aufgaben || [])
    .filter((a) => a && !NICHT_AUTOMATISIERBAR.has(String(a.betrifft || "")))
    .sort((a, b) => (a.stufe ?? 9) - (b.stufe ?? 9));
  return kandidaten[0] || null;
}

/** Der Auftrag als Markdown — vollstaendig, ohne Rueckfragen ausfuehrbar. */
export function alsAuftrag(aufgabe, { gesammeltAm = "", branchDatum = "" } = {}) {
  const branch = `feature/werkstatt-${branchDatum || "DATUM"}`;
  return `# Werkstatt-Bau-Auftrag (Station 2)

Erzeugt am ${gesammeltAm} aus docs/werkstatt/backlog.json. Dieser Auftrag ist
in sich geschlossen: alles Noetige steht hier, es gibt keine Sitzung dahinter.

## Die EINE Aufgabe fuer diese Nacht

- **Titel:** ${aufgabe.titel}
- **Betrifft:** \`${aufgabe.betrifft}\`
- **Quelle:** ${aufgabe.quelle} (Dringlichkeit Stufe ${aufgabe.stufe})
- **Befund:** ${aufgabe.befund || "(siehe Backlog)"}

## Harte Schutzregeln (bei Verstoss: abbrechen, nichts pushen)

1. Arbeite AUSSCHLIESSLICH auf einem frischen Branch \`${branch}\` ab origin/main.
   Niemals auf main oder einem fremden Branch committen.
2. GENAU diese eine Aufgabe. Keine Nebenreparaturen, keine "wo ich schon mal
   dabei bin"-Aenderungen — was dir auffaellt, gehoert als Notiz in den
   Commit-Text, nicht in den Code.
3. Gesperrte Dateien sind TABU (Start-Lock: 31 Startseiten-Dateien,
   Security-Lock: 10 Auth-Dateien, Favicon-Lock). Pruefe vorher mit
   \`node scripts/check-start-lock.mjs\` und \`node scripts/check-security-lock.mjs\`,
   welche das sind. Braucht die Aufgabe eine gesperrte Datei: NICHT bauen,
   stattdessen im Ergebnis dokumentieren, warum es Betreiber-Freigabe braucht.
4. Keine neuen Dienste, keine neuen Abhaengigkeiten, keine Secrets im Code.
5. Ehrlichkeits-Beschluss beachten (docs/approvals/2026-08-12-ampel-ehrlich-messen.md):
   keine Blind-Stempel, keine erfundenen Messwerte, nicht Gemessenes ist grau.

## Abnahme (Station 3 prueft das fail-closed nach)

- \`npm test\` ist komplett gruen (volle Suite, rund 60 s).
- \`npm run werkstatt:tor -- --schnell\` meldet OFFEN.
- Fuer die Aenderung existiert mindestens ein NEUER Test, der ohne sie rot waere.
- Commit-Text erklaert WARUM, nicht nur was (Vorbild: juengste Commits im Log).

## Abschluss

- Push NUR den Branch \`${branch}\`.
- Erzeuge die Freigabe-Karte: \`node scripts/werkstatt/freigabe-karte.mjs ${branch}\`
- Wenn der Bau scheitert: Branch trotzdem pushen (unfertig ist ehrlich),
  Karte mit Status GESCHEITERT erzeugen — ein stiller Abbruch waere eine
  stumme Quelle.
`;
}

async function main() {
  if (!existsSync(BACKLOG_JSON)) {
    console.error("[werkstatt] Kein backlog.json — zuerst npm run werkstatt:sammeln.");
    process.exit(1);
  }
  const backlog = JSON.parse(readFileSync(BACKLOG_JSON, "utf8"));

  // Ohne offenes Tor kein Auftrag: Wer auf rotem Fundament baut, kann seine
  // eigene Wirkung nicht messen. Das VOLLE Tor (inkl. Pruefsuite, ~60 s) —
  // --schnell wuerde die Suite auslassen und bleibt per Bauart ZU.
  const { spawnSync } = await import("node:child_process");
  const tor = spawnSync("npm", ["run", "werkstatt:tor", "--silent"], { cwd: REPO, encoding: "utf8", timeout: 300_000 });
  if (tor.status !== 0) {
    console.error("[werkstatt] Tor ist ZU — kein Bau-Auftrag. Erst den Grund beheben:");
    console.error(String(tor.stdout || "").split("\n").filter((z) => z.includes("ZU") || z.includes("VERLETZT")).slice(0, 5).join("\n"));
    process.exit(1);
  }

  const aufgabe = waehleAufgabe(backlog.aufgaben);
  if (!aufgabe) {
    console.log("[werkstatt] Backlog leer oder nichts automatisierbar — keine Arbeit heute Nacht. Das ist ein Ergebnis, kein Fehler.");
    process.exit(0);
  }

  const datum = new Date().toISOString().slice(0, 10);
  const auftrag = alsAuftrag(aufgabe, { gesammeltAm: backlog.gesammeltAm || "", branchDatum: datum });
  if (process.argv.includes("--zeigen")) {
    console.log(auftrag);
  } else {
    mkdirSync(path.dirname(ZIEL), { recursive: true });
    writeFileSync(ZIEL, auftrag, "utf8");
    console.log(`[werkstatt] Auftrag geschrieben: docs/werkstatt/AUFTRAG.md — "${aufgabe.titel}"`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
