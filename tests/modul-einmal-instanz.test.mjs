// smejj.com — Ein Modul, EIN Spezifizierer. Wer dieselbe Datei einmal mit und
// einmal ohne Versionsanhang importiert, bekommt zwei Modulinstanzen.
//
// Hintergrund (2026-09-03, Web-Vitals-Wache rot): erste-schritte.js importierte
// "/assets/chat-store.js", index.html und sechs weitere Module aber
// "/assets/chat-store.js?v=b65". Der Browser hielt das fuer zwei Dateien:
// chat-store.js wurde zweimal uebertragen (12,9 KB), lief zweimal (zweite
// IndexedDB-Verbindung, eigener Zustand) und das Seitengewicht stieg von 298
// auf 324 KB — ueber das 300-KB-Budget. Kein Test hat das gesehen: die Syntax
// war korrekt, der Import loeste auf, die Suite war gruen.
//
// Regel: Fuer jede Zieldatei unter public/ muessen alle Importe (statisch,
// dynamisch, <script src>) denselben Spezifizierer benutzen. Relative Pfade
// ("./chat-store.js?v=b65") zaehlen als "/assets/…", weil die App aus /assets/
// ausgeliefert wird.
//
// Nach der Hausregel: eine KAPUTTE und eine GESUNDE Probe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const IMPORT_RE = /(?:from\s*|import\s*\(\s*|src=)["']([^"']+\.js(?:\?v=[^"']*)?)["']/g;

/** Sammelt je Zieldatei die Menge der benutzten Spezifizierer. */
export function sammleSpezifizierer(dateien) {
  const jeZiel = new Map();
  for (const { name, inhalt } of dateien) {
    for (const [, roh] of inhalt.matchAll(IMPORT_RE)) {
      if (/^(https?:)?\/\//.test(roh)) continue;
      if (!roh.startsWith("/") && !roh.startsWith("./")) continue;
      const spez = roh.startsWith("./") ? `/assets/${roh.slice(2)}` : roh.startsWith("/assets/") ? roh : `/assets${roh}`;
      const ziel = spez.split("?")[0];
      const eintrag = jeZiel.get(ziel) || new Map();
      eintrag.set(spez, [...(eintrag.get(spez) || []), name]);
      jeZiel.set(ziel, eintrag);
    }
  }
  return jeZiel;
}

/** Liefert die Zieldateien, die mit mehr als einem Spezifizierer importiert werden. */
export function findeMehrfachInstanzen(dateien) {
  const befunde = [];
  for (const [ziel, eintrag] of sammleSpezifizierer(dateien)) {
    if (eintrag.size < 2) continue;
    befunde.push(`${ziel}: ${[...eintrag].map(([spez, quellen]) => `${spez} <- ${[...new Set(quellen)].join(", ")}`).join(" | ")}`);
  }
  return befunde;
}

function liesPublic() {
  const namen = readdirSync(PUBLIC).filter((f) => f.endsWith(".js") || f === "index.html");
  return namen.map((name) => ({ name, inhalt: readFileSync(join(PUBLIC, name), "utf8") }));
}

test("kaputte Probe: mit und ohne ?v= ist eine Mehrfachinstanz", () => {
  const befunde = findeMehrfachInstanzen([
    { name: "index.html", inhalt: '<script src="/assets/chat-store.js?v=b65" type="module"></script>' },
    { name: "erste-schritte.js", inhalt: 'import { listChats } from "/assets/chat-store.js";' }
  ]);
  assert.equal(befunde.length, 1);
  assert.match(befunde[0], /chat-store\.js\?v=b65 <- index\.html/);
  assert.match(befunde[0], /chat-store\.js <- erste-schritte\.js/);
});

test("gesunde Probe: gleicher Spezifizierer, relativ oder absolut, ist EINE Instanz", () => {
  const befunde = findeMehrfachInstanzen([
    { name: "index.html", inhalt: '<script src="/assets/chat-store.js?v=b65" type="module"></script>' },
    { name: "chat-store-bereiche.js", inhalt: 'import { x } from "./chat-store.js?v=b65";' },
    { name: "erwaehnung.js", inhalt: 'const lade = () => import("./chat-store.js?v=b65");' }
  ]);
  assert.deepEqual(befunde, []);
});

test("public/: jede Zieldatei wird mit genau einem Spezifizierer importiert", () => {
  const befunde = findeMehrfachInstanzen(liesPublic());
  assert.deepEqual(befunde, [], `Mehrfachinstanzen:\n${befunde.join("\n")}`);
});
