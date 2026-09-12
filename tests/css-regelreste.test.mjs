// smejj.com — Kein Stylesheet darf einen Rest tragen, der die NAECHSTE Regel frisst.
//
// DER BEFUND (2026-09-12, LIVE gemessen): In der ausgelieferten
// start-styles.css standen 18 Zeilen, die nur aus einem Punkt bestehen — an
// sieben Stellen, jeweils dort, wo am 08.09. eine tote Regel entfernt wurde
// (Commit b88d7499, "20 tote Regeln sind weg"). Der Selektor wurde geloescht,
// der fuehrende Punkt blieb stehen.
//
// WARUM DAS SCHADET: CSS kennt kein "ungueltige Zeile ueberspringen". Der
// Parser liest den Punkt als Anfang eines Selektors, haengt alles bis zur
// naechsten geschweiften Klammer an — und verwirft dann die GANZE Regel.
// Nicht der Punkt geht verloren, sondern die Regel DAHINTER.
//
// GEMESSEN, nicht vermutet: dieselbe Datei einmal live und einmal lokal in ein
// <style>-Element gelegt und den Browser gefragt, was er daraus macht.
//   live:  1131 Regeln — .browser-panel-nav, .bp-tab.is-active .bp-tab-dot und
//          body.task-indicator-active .split-icon span:last-child FEHLTEN
//   lokal: 1138 Regeln, keine fehlt
// Fuenf weitere Stellen blieben folgenlos, weil dieselben Selektoren weiter
// hinten im Buendel noch einmal stehen (.workspace, .brand, .profile-dock …) —
// Glueck, keine Absicht.
//
// Der Test prueft die QUELLEN und das erzeugte Buendel. Eine Regel weniger im
// Buendel als in den Quellen ist kein Schoenheitsfehler, sondern eine Regel,
// die der Benutzer nie sieht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const CSS_ORDNER = "public";
const dateien = readdirSync(CSS_ORDNER).filter((n) => n.endsWith(".css"));

test("keine Zeile besteht nur aus einem Punkt (oder einem anderen leeren Selektor)", () => {
  const funde = [];
  for (const name of dateien) {
    const zeilen = readFileSync(`${CSS_ORDNER}/${name}`, "utf8").split("\n");
    zeilen.forEach((z, i) => {
      const t = z.trim();
      // "." allein, "#" allein, ".," — alles, was ein Selektoranfang ohne Namen ist.
      if (t === "." || t === "#" || t === "," || /^[.#]\s*,?$/.test(t)) {
        funde.push(`${name}:${i + 1} "${t}"`);
      }
    });
  }
  assert.deepEqual(funde, [],
    `Rest eines geloeschten Selektors — er frisst die naechste Regel:\n  ${funde.join("\n  ")}`);
});

test("das Buendel traegt keinen solchen Rest", () => {
  const text = readFileSync("public/start-styles.css", "utf8");
  const reste = text.split("\n").filter((z) => z.trim() === ".").length;
  assert.equal(reste, 0, `${reste} Punkt-Zeile(n) im ausgelieferten Buendel — jede kostet die Regel dahinter`);
});

test("die drei Regeln, die live verlorengegangen waren, stehen im Buendel", () => {
  // Namentlich, damit ein kuenftiger Aufraeumlauf sie nicht wieder mitnimmt,
  // ohne dass jemand es merkt.
  const text = readFileSync("public/start-styles.css", "utf8");
  for (const regel of [
    ".browser-panel-nav",
    ".bp-tab.is-active .bp-tab-dot",
    "body.task-indicator-active .split-icon span:last-child"
  ]) {
    assert.ok(text.includes(regel), `${regel} fehlt im Buendel — genau diese Regel war live tot`);
  }
});
