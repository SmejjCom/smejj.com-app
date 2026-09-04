// smejj.com — Waechter fuer die CODE-DARSTELLUNG in den Systemregeln der tiefen Spur.
//
// LIVE GEFUNDEN 2026-09-05 im Code-Bereich (Betreiber: "teste jetzt den Code-Bereich
// live mit einer echten Aufgabe", danach "Code-Auszeichnung erzwingen"): Bei einer
// Aufgabe mit "genauer:" kam der Code in zwei von drei Laeufen OHNE ```-Zaeune und
// klebte direkt am Satz ("...und Randfaellen:function maximum(liste) {"). Die
// Oberflaeche baut aus Zaeunen einen <pre>-Kasten mit Kopier- und Download-Knopf;
// ohne sie fehlt beides. Der Renderer war korrekt — die Regel fehlte.
//
// Geprueft wird die Zusage, nicht der Wortlaut: die Regel gilt in jedem Modus
// AUSSER im Sprachmodus, wo Markdown verboten ist (die Antwort wird vorgelesen).
import test from "node:test";
import assert from "node:assert/strict";
import { baueSystemregeln } from "../src/agent/systemregeln.js";

const hatRegel = (zeilen) => zeilen.some((z) => z.includes("CODE-DARSTELLUNG"));

test("die Codeblock-Regel gilt im normalen Chat", () => {
  assert.ok(hatRegel(baueSystemregeln({})));
});

test("sie gilt auch fuer Code-Auftraege und mit Web-Ergebnissen", () => {
  assert.ok(hatRegel(baueSystemregeln({ codingTask: true })), "Code-Auftrag");
  assert.ok(hatRegel(baueSystemregeln({ codingTask: true, modus: "akzeptieren" })), "Modus akzeptieren");
  assert.ok(hatRegel(baueSystemregeln({ webContext: "Treffer" })), "mit Web-Ergebnissen");
});

test("im Sprachmodus gilt sie NICHT — die Antwort wird vorgelesen", () => {
  // Gegenstueck zur Regel direkt darunter, die dort Markdown und Code-Bloecke
  // ausdruecklich verbietet. Zwei widerspruechliche Ansagen waeren schlimmer
  // als keine.
  const zeilen = baueSystemregeln({ voiceMode: true });
  assert.ok(!hatRegel(zeilen), "keine Codeblock-Pflicht beim Vorlesen");
  assert.ok(zeilen.some((z) => z.includes("Sprachmodus")), "die Sprachmodus-Regel steht weiter da");
});

test("die Regel nennt Zaeune und Sprachangabe konkret genug", () => {
  // Eine Regel, die nur "nutze Markdown" sagt, hat live nichts bewirkt —
  // darum die ausdrueckliche Ansage samt Sprachangabe und eigener Zeile.
  const regel = baueSystemregeln({}).find((z) => z.includes("CODE-DARSTELLUNG"));
  assert.match(regel, /Backticks/, "die Zaeune muessen benannt sein");
  assert.match(regel, /Sprachangabe/, "die Sprachangabe muss verlangt sein");
  assert.match(regel, /eigenen Zeile/, "Zaeune gehoeren auf eine eigene Zeile");
});

test("die Sicherheitsregel von Nr. 79 bleibt unangetastet", () => {
  // Sie kam am 03.09. aus einem Red-Team-Fund und darf durch diesen Einbau
  // nicht verrutschen oder verschwinden.
  assert.ok(baueSystemregeln({}).some((z) => z.startsWith("SICHERHEIT:")));
});
