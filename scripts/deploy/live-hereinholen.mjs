// smejj.com — ausgelieferte Fassungen in den Arbeitszweig zurueckholen.
//
// WOZU: Der Zweig und smejj.com laufen auseinander, wenn parallel gearbeitet
// wird. Am 07.09. waren 54 Dateien live NEUER als lokal — ein Deploy von hier
// haette siebzehn Service-Worker-Versionen fremder Arbeit zurueckgerollt.
//
// DIE REGEL, die check-deploy-abgleich.mjs vorgibt und die dieses Werkzeug
// umsetzt: "Live-Fassung zur Basis nehmen, eigene Aenderung daraufsetzen" —
// NIEMALS umgekehrt. Wer die lokale Fassung hochlaedt, loescht fremde Arbeit
// lautlos (Vorfaelle 2026-08-23: einviereck-Marke, chat-stream.js).
//
// WAS DIESES WERKZEUG ENTSCHEIDET, und was ausdruecklich NICHT:
//
// Es uebernimmt eine Datei nur dann, wenn JEDE lokale Zeile auch live
// vorkommt — dann geht nachweislich nichts verloren. Sobald eine einzige
// lokale Zeile fehlt, ruehrt es die Datei nicht an und meldet sie zur
// Handarbeit. Zusammenfuehren ist eine Entscheidung, keine Rechenaufgabe.
//
// EINE AUSNAHME BRAUCHT ES TROTZDEM: Versionsmarken (`?v=b141` gegen `?v=b156`)
// sehen wie verlorene Zeilen aus, sind aber dieselbe Zeile in einer aelteren
// Fassung. Wer sie als Verlust wertet, kann nie eine Datei uebernehmen, die
// Module laedt. Sie werden deshalb vor dem Vergleich entfernt — die Marke der
// LIVE-Fassung gilt, weil sie zum ausgelieferten Stand gehoert.
//
// ABGELEITETE DATEIEN sind ausgeschlossen (siehe ABGELEITET). index.html traegt
// die Marken ALLER Module, start-styles.css ist ein Buendel aus Einzeldateien:
// beide passen nur zum VOLLSTAENDIGEN Live-Stand. Einzeln uebernommen erzeugen
// sie eine Inkonsistenz, die erst drei Pruefungen spaeter auffaellt — am 07.09.
// zweimal passiert.
//
// Aufruf:
//   node scripts/deploy/live-hereinholen.mjs <datei…>          (nur pruefen)
//   node scripts/deploy/live-hereinholen.mjs --schreiben <datei…>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Dateien, die aus anderen erzeugt werden und nur als Ganzes stimmig sind. */
export const ABGELEITET = Object.freeze([
  "index.html",
  "assets/index.html",
  "start-styles.css",
  "assets/start-styles.css"
]);

/** Wo eine Datei live liegt. HTML unter der Wurzel, alles andere unter /assets/. */
export function liveAdresse(datei) {
  const rel = datei.replace(/^public\//, "");
  if (rel.endsWith(".html")) return `https://smejj.com/${rel}`;
  return `https://smejj.com/assets/${rel}`;
}

/**
 * Entfernt Versionsmarken, damit `?v=b141` und `?v=b156` als dieselbe Zeile
 * gelten. Ohne das waere jede Datei, die Module laedt, ewig "nicht uebernehmbar".
 */
export function ohneMarke(zeile) {
  return String(zeile).replace(/\?v=[A-Za-z0-9._-]+/g, "?v=X");
}

/**
 * Welche lokalen Zeilen kaemen bei einer Uebernahme abhanden?
 *
 * Verglichen werden ZEILENMENGEN, nicht Reihenfolgen: eine Zeile, die live an
 * anderer Stelle steht, ist nicht verloren. Reine Leerzeilen zaehlen nicht.
 */
export function verloreneZeilen(lokal, live) {
  // GEZAEHLT, nicht als Menge: eine Zeile, die lokal zweimal vorkommt und live
  // auch, ist nicht verloren. Der erste Anlauf benutzte ein Set und meldete
  // darum jede Wiederholung als Verlust — bei chat-history-cards.js zweimal
  // dieselbe Zeile, die in Wahrheit auf beiden Seiten doppelt stand.
  // Ein Waechter, der falschen Alarm gibt, wird nach dem dritten Mal ignoriert.
  const liveZaehler = new Map();
  for (const z of String(live).split("\n")) {
    const zeile = ohneMarke(z.trim());
    if (zeile) liveZaehler.set(zeile, (liveZaehler.get(zeile) || 0) + 1);
  }
  const fehlend = [];
  for (const roh of String(lokal).split("\n")) {
    const zeile = ohneMarke(roh.trim());
    if (!zeile) continue;
    const uebrig = liveZaehler.get(zeile) || 0;
    if (uebrig > 0) liveZaehler.set(zeile, uebrig - 1);
    else fehlend.push(roh.trim());
  }
  return fehlend;
}

/** Urteil ueber eine Datei. Rein: alles Aeussere kommt herein. */
export function beurteile(datei, lokal, live) {
  const rel = datei.replace(/^public\//, "");
  if (ABGELEITET.includes(rel)) {
    return { ok: false, grund: "abgeleitete Datei — nur mit dem vollstaendigen Live-Stand stimmig", verloren: [] };
  }
  if (lokal == null) return { ok: false, grund: "lokal nicht lesbar", verloren: [] };
  if (live == null) return { ok: false, grund: "live nicht erreichbar", verloren: [] };
  if (lokal === live) return { ok: false, grund: "schon gleich — nichts zu tun", verloren: [] };
  const verloren = verloreneZeilen(lokal, live);
  if (verloren.length) {
    return { ok: false, grund: `${verloren.length} lokale Zeile(n) wuerden verschwinden — Handarbeit`, verloren };
  }
  return { ok: true, grund: "jede lokale Zeile kommt live vor — Uebernahme verliert nichts", verloren: [] };
}

async function holeLive(datei, fetchImpl = fetch) {
  try {
    const antwort = await fetchImpl(liveAdresse(datei), { cache: "no-store" });
    if (!antwort.ok) return null;
    return await antwort.text();
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const dateien = argv.filter((a) => !a.startsWith("--"));
  if (!dateien.length) {
    console.error("Aufruf: node scripts/deploy/live-hereinholen.mjs [--schreiben] <datei…>");
    process.exit(2);
  }

  let uebernommen = 0, handarbeit = 0;
  for (const eingabe of dateien) {
    const rel = eingabe.startsWith("public/") ? eingabe : `public/${eingabe}`;
    const pfad = path.join(WURZEL, rel);
    const lokal = existsSync(pfad) ? readFileSync(pfad, "utf8") : null;
    const live = await holeLive(rel);
    const urteil = beurteile(rel, lokal, live);

    if (!urteil.ok) {
      handarbeit += 1;
      console.log(`HANDARBEIT  ${rel}\n            ${urteil.grund}`);
      for (const z of urteil.verloren.slice(0, 3)) console.log(`            nur lokal: ${z.slice(0, 100)}`);
      continue;
    }
    uebernommen += 1;
    console.log(`UEBERNEHMEN ${rel}  (${urteil.grund})`);
    if (schreiben) {
      writeFileSync(pfad, live);
      // Die ausgelieferte Kopie mitziehen, sonst laufen Quelle und Auslieferung
      // sofort wieder auseinander.
      const kopie = path.join(WURZEL, "public/assets", rel.replace(/^public\//, ""));
      if (existsSync(kopie)) writeFileSync(kopie, live);
    }
  }
  console.log(`\n${uebernommen} uebernehmbar, ${handarbeit} brauchen Handarbeit.`);
  if (!schreiben && uebernommen) console.log("Nichts geschrieben — mit --schreiben wirklich uebernehmen.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}
